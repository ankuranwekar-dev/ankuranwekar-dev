Pod::Spec.new do |s|
  s.name           = 'TenderKeychain'
  s.version        = '1.0.0'
  s.summary        = 'Keeps the backup secret in the iCloud Keychain so another phone on the same Apple ID has it'
  s.description    = 'One keychain item, marked synchronizable. Nothing is sent anywhere by this module; iCloud Keychain does the syncing, end to end encrypted.'
  s.author         = 'Ankur Anwekar'
  s.homepage       = 'https://github.com/ankuranwekar-dev/ankuranwekar-dev'
  s.license        = { :type => 'MIT' }
  s.platforms      = { :ios => '16.4' }
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES', 'SWIFT_COMPILATION_MODE' => 'wholemodule' }
  s.source_files = '**/*.{h,m,mm,swift}'
end
