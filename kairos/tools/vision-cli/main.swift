// usage: vision-cli <max-edge> <image>...   -> one JSON line per image: {"file","width","height","tokens":[...]}
import Foundation
import CoreGraphics

let args = CommandLine.arguments
// usage: vision-cli rectify <max-edge> <plans.json>   plans: [{"image","out","h":[9],"w","hh"}]
if args.count == 4, args[1] == "rectify", let maxEdge = Int(args[2]) {
  let plans = try! JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: args[3]))) as! [[String: Any]]
  var ok = 0
  for p in plans {
    guard let loaded = VisionCore.load(path: p["image"] as! String, maxEdge: maxEdge),
          let img = VisionCore.rotate(loaded, quarterTurns: (p["turns"] as? NSNumber)?.intValue ?? 0),
          let flat = VisionCore.rectify(img, h: (p["h"] as! [NSNumber]).map { $0.doubleValue }, width: (p["w"] as! NSNumber).intValue, height: (p["hh"] as! NSNumber).intValue),
          let data = VisionCore.png(flat) else { print("failed \(p["image"] as! String)"); continue }
    try! data.write(to: URL(fileURLWithPath: p["out"] as! String))
    ok += 1
  }
  print("rectified \(ok)/\(plans.count)")
  exit(0)
}
guard args.count >= 3, let maxEdge = Int(args[1]) else {
  FileHandle.standardError.write("usage: vision-cli <max-edge> <image>...\n".data(using: .utf8)!)
  exit(2)
}
for path in args.dropFirst(2) {
  guard let img = VisionCore.load(path: path, maxEdge: maxEdge) else {
    print("{\"file\":\"\(path)\",\"error\":\"load\"}"); continue
  }
  let t0 = Date()
  let seen = try? VisionCore.recognizeUpright(img)
  let toks = seen?.tokens ?? []
  let upright = seen?.image ?? img
  let rows = toks.map { t -> [String: Any] in
    ["t": t.text, "x": (t.x * 10).rounded() / 10, "y": (t.y * 10).rounded() / 10, "w": (t.w * 10).rounded() / 10,
     "h": (t.h * 10).rounded() / 10, "c": (t.confidence * 100).rounded() / 100]
  }
  let obj: [String: Any] = ["file": (path as NSString).lastPathComponent, "width": upright.width, "height": upright.height, "turns": seen?.turns ?? 0,
                            "ms": Int(Date().timeIntervalSince(t0) * 1000), "tokens": rows]
  let data = try! JSONSerialization.data(withJSONObject: obj, options: [])
  print(String(data: data, encoding: .utf8)!)
}
