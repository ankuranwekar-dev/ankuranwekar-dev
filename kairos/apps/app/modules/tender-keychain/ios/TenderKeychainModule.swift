import ExpoModulesCore
import Security

/// The backup secret, as one synchronizable keychain item.
///
/// `kSecAttrSynchronizable` makes iCloud Keychain carry it to the person's other devices, end to end encrypted: Apple
/// cannot read it and neither can Tender's server, which never sees it. If iCloud Keychain is off the item simply stays on
/// this phone, and the recovery code is the way to the secret on another one.
public class TenderKeychainModule: Module {
  private let service = "com.9labs.tenderapp.backup"
  private let account = "backup-secret"

  private func query(_ extra: [String: Any] = [:]) -> [String: Any] {
    var q: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword,
      kSecAttrService as String: service,
      kSecAttrAccount as String: account,
      // Look at both the synced and the local copy when reading or deleting.
      kSecAttrSynchronizable as String: kSecAttrSynchronizableAny,
    ]
    for (k, v) in extra { q[k] = v }
    return q
  }

  public func definition() -> ModuleDefinition {
    Name("TenderKeychain")

    AsyncFunction("get") { () -> String? in
      let q = self.query([kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne])
      var item: CFTypeRef?
      let status = SecItemCopyMatching(q as CFDictionary, &item)
      guard status == errSecSuccess, let data = item as? Data else { return nil }
      return String(data: data, encoding: .utf8)
    }

    AsyncFunction("set") { (value: String) in
      SecItemDelete(self.query() as CFDictionary)
      let add: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrService as String: self.service,
        kSecAttrAccount as String: self.account,
        kSecAttrSynchronizable as String: true,
        kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock,
        kSecValueData as String: Data(value.utf8),
      ]
      let status = SecItemAdd(add as CFDictionary, nil)
      if status != errSecSuccess { throw KeychainException() }
    }

    AsyncFunction("remove") { () in
      SecItemDelete(self.query() as CFDictionary)
    }
  }
}

final class KeychainException: Exception, @unchecked Sendable {
  override var reason: String { "The keychain refused the backup secret" }
}
