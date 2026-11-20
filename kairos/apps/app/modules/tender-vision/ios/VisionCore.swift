// Apple Vision text recognition and perspective correction for photos of a phone calendar.
//
// This file has no Expo dependency on purpose: the app's native module wraps it, and the
// command-line tool in tools/vision-cli compiles the very same file so the reader can be
// developed and measured on a Mac against simulated photos.
import CoreGraphics
import Foundation
import ImageIO
import Vision

public struct VisionToken {
  public var text: String
  /// Centre and size in pixels of the loaded image, origin top-left, y down.
  public var x: Double, y: Double, w: Double, h: Double
  public var confidence: Double
}

public enum VisionCore {
  /// Decode with the camera's orientation applied, no larger than `maxEdge` on its long side.
  public static func load(path: String, maxEdge: Int) -> CGImage? {
    let url = URL(fileURLWithPath: path.hasPrefix("file://") ? String(path.dropFirst(7)).removingPercentEncoding ?? path : path)
    guard let src = CGImageSourceCreateWithURL(url as CFURL, nil) else { return nil }
    let opts: [CFString: Any] = [
      kCGImageSourceCreateThumbnailFromImageAlways: true,
      kCGImageSourceCreateThumbnailWithTransform: true,
      kCGImageSourceThumbnailMaxPixelSize: maxEdge,
      kCGImageSourceShouldCacheImmediately: true,
    ]
    return CGImageSourceCreateThumbnailAtIndex(src, 0, opts as CFDictionary)
  }

  /// The image turned clockwise by `quarterTurns` quarter turns.
  public static func rotate(_ image: CGImage, quarterTurns: Int) -> CGImage? {
    let turns = ((quarterTurns % 4) + 4) % 4
    if turns == 0 { return image }
    let w = image.width, h = image.height
    let (ow, oh) = turns % 2 == 0 ? (w, h) : (h, w)
    guard let ctx = CGContext(data: nil, width: ow, height: oh, bitsPerComponent: 8, bytesPerRow: 0,
                              space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
    else { return nil }
    // Core Graphics' y axis points up, so a clockwise turn is a negative rotation.
    switch turns {
    case 1: ctx.translateBy(x: 0, y: CGFloat(oh)); ctx.rotate(by: -.pi / 2)
    case 2: ctx.translateBy(x: CGFloat(ow), y: CGFloat(oh)); ctx.rotate(by: .pi)
    default: ctx.translateBy(x: CGFloat(ow), y: 0); ctx.rotate(by: .pi / 2)
    }
    ctx.draw(image, in: CGRect(x: 0, y: 0, width: w, height: h))
    return ctx.makeImage()
  }

  /// How many words look like a day of the month: the measure of whether the picture is the right way up.
  static func dayCount(_ tokens: [VisionToken]) -> Int {
    tokens.filter { t in
      let digits = t.text.filter { $0.isNumber }
      return (1...2).contains(digits.count) && t.text.count <= digits.count + 1 && (1...31).contains(Int(digits) ?? 0)
    }.count
  }

  /// Read the picture the way up it was taken; if that finds hardly any day numbers, try the other three quarter
  /// turns (a phone held sideways, or a photo whose orientation was lost) and keep the one that finds the most.
  public static func recognizeUpright(_ image: CGImage) throws -> (turns: Int, image: CGImage, tokens: [VisionToken]) {
    var best = (turns: 0, image: image, tokens: try recognize(image))
    var bestCount = dayCount(best.tokens)
    if bestCount >= 14 { return best }
    for turns in 1...3 {
      guard let turned = rotate(image, quarterTurns: turns), let tokens = try? recognize(turned) else { continue }
      let count = dayCount(tokens)
      if count > bestCount + 3 { best = (turns, turned, tokens); bestCount = count }
    }
    return best
  }

  /// Every whitespace-separated word Vision finds, with its own box.
  public static func recognize(_ image: CGImage) throws -> [VisionToken] {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = false
    request.recognitionLanguages = ["en-US"]
    request.minimumTextHeight = 0.004
    let handler = VNImageRequestHandler(cgImage: image, options: [:])
    try handler.perform([request])
    let W = Double(image.width), H = Double(image.height)
    var out: [VisionToken] = []
    for obs in request.results ?? [] {
      guard let cand = obs.topCandidates(1).first else { continue }
      let s = cand.string
      var i = s.startIndex
      while i < s.endIndex {
        if s[i].isWhitespace { i = s.index(after: i); continue }
        var j = i
        while j < s.endIndex, !s[j].isWhitespace { j = s.index(after: j) }
        let r = i..<j
        if let box = try? cand.boundingBox(for: r) {
          // Vision's quad is normalised with the origin bottom-left; use the rotated box's own centre and extent.
          let pts = [box.topLeft, box.topRight, box.bottomRight, box.bottomLeft]
          let cx = pts.map { Double($0.x) }.reduce(0, +) / 4 * W
          let cy = (1 - pts.map { Double($0.y) }.reduce(0, +) / 4) * H
          let dx = Double(box.topRight.x - box.topLeft.x) * W, dy = Double(box.topRight.y - box.topLeft.y) * H
          let ex = Double(box.topLeft.x - box.bottomLeft.x) * W, ey = Double(box.topLeft.y - box.bottomLeft.y) * H
          out.append(VisionToken(text: String(s[r]), x: cx, y: cy, w: (dx * dx + dy * dy).squareRoot(),
                                 h: (ex * ex + ey * ey).squareRoot(), confidence: Double(cand.confidence)))
        }
        i = j
      }
    }
    return out
  }
}

// MARK: - Perspective correction

import CoreImage
import UniformTypeIdentifiers

extension VisionCore {
  /// Flatten `image` into a `width` × `height` bitmap. `h` maps output pixels to source pixels (row-major 3×3).
  /// Each output pixel averages a 3×3 grid of bilinear samples, enough to keep thin digits when shrinking.
  public static func rectify(_ image: CGImage, h: [Double], width: Int, height: Int) -> CGImage? {
    guard var out = rectifyBytes(image, h: h, width: width, height: height) else { return nil }
    guard let oc = CGContext(data: &out, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4,
                             space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
    else { return nil }
    return oc.makeImage()
  }

  /// The same warp as raw RGBA bytes (alpha always 255), which is what the app wants: no PNG to encode and decode.
  public static func rectifyBytes(_ image: CGImage, h: [Double], width: Int, height: Int) -> [UInt8]? {
    guard h.count == 9, width > 0, height > 0, width * height <= 16_000_000 else { return nil }
    let sw = image.width, sh = image.height
    let space = CGColorSpaceCreateDeviceRGB()
    var src = [UInt8](repeating: 0, count: sw * sh * 4)
    guard let sc = CGContext(data: &src, width: sw, height: sh, bitsPerComponent: 8, bytesPerRow: sw * 4, space: space,
                             bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
    sc.draw(image, in: CGRect(x: 0, y: 0, width: sw, height: sh))
    var out = [UInt8](repeating: 255, count: width * height * 4)
    let taps: [Double] = [-1.0 / 3, 0, 1.0 / 3]
    src.withUnsafeBufferPointer { sp in
      for y in 0..<height {
        for x in 0..<width {
          var r = 0.0, g = 0.0, b = 0.0, n = 0.0
          for dy in taps {
            for dx in taps {
              let u = Double(x) + 0.5 + dx, v = Double(y) + 0.5 + dy
              let w = h[6] * u + h[7] * v + h[8]
              let sx = (h[0] * u + h[1] * v + h[2]) / w - 0.5
              let sy = (h[3] * u + h[4] * v + h[5]) / w - 0.5
              if sx < 0 || sy < 0 || sx > Double(sw - 1) || sy > Double(sh - 1) { continue }
              let x0 = Int(sx), y0 = Int(sy)
              let x1 = min(x0 + 1, sw - 1), y1 = min(y0 + 1, sh - 1)
              let fx = sx - Double(x0), fy = sy - Double(y0)
              for c in 0..<3 {
                let p00 = Double(sp[(y0 * sw + x0) * 4 + c]), p10 = Double(sp[(y0 * sw + x1) * 4 + c])
                let p01 = Double(sp[(y1 * sw + x0) * 4 + c]), p11 = Double(sp[(y1 * sw + x1) * 4 + c])
                let val = (p00 * (1 - fx) + p10 * fx) * (1 - fy) + (p01 * (1 - fx) + p11 * fx) * fy
                if c == 0 { r += val } else if c == 1 { g += val } else { b += val }
              }
              n += 1
            }
          }
          let o = (y * width + x) * 4
          if n > 0 {
            out[o] = UInt8(min(255, max(0, (r / n).rounded())))
            out[o + 1] = UInt8(min(255, max(0, (g / n).rounded())))
            out[o + 2] = UInt8(min(255, max(0, (b / n).rounded())))
          }
        }
      }
    }
    return out
  }

  public static func png(_ image: CGImage) -> Data? {
    let data = NSMutableData()
    guard let dest = CGImageDestinationCreateWithData(data, UTType.png.identifier as CFString, 1, nil) else { return nil }
    CGImageDestinationAddImage(dest, image, nil)
    return CGImageDestinationFinalize(dest) ? data as Data : nil
  }
}
