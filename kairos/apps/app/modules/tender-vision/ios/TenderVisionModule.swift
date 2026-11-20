import ExpoModulesCore

/// Reads and flattens photographs of a phone's calendar, entirely on the device.
public class TenderVisionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("TenderVision")

    /// Every word in the image with its box, in pixels of the upright image scaled to at most `maxEdge`.
    AsyncFunction("recognize") { (uri: String, maxEdge: Int) -> [String: Any] in
      guard let image = VisionCore.load(path: uri, maxEdge: maxEdge) else { throw UnreadableImageException() }
      let seen = try VisionCore.recognizeUpright(image)
      let tokens = seen.tokens
      return [
        "width": seen.image.width,
        "height": seen.image.height,
        "turns": seen.turns,
        "tokens": tokens.map { t -> [String: Any] in
          ["text": t.text, "x": t.x, "y": t.y, "w": t.w, "h": t.h, "confidence": t.confidence]
        },
      ]
    }

    /// The image, turned clockwise by `turns` quarter turns as `recognize` reported, warped by `h` (output pixel to
    /// image pixel, row-major 3×3), as raw RGBA bytes (`width` × `height` × 4).
    AsyncFunction("rectify") { (uri: String, maxEdge: Int, turns: Int, h: [Double], width: Int, height: Int) -> Data in
      guard let loaded = VisionCore.load(path: uri, maxEdge: maxEdge), let image = VisionCore.rotate(loaded, quarterTurns: turns)
      else { throw UnreadableImageException() }
      guard let bytes = VisionCore.rectifyBytes(image, h: h, width: width, height: height) else { throw FlattenException() }
      return Data(bytes)
    }
  }
}

final class UnreadableImageException: Exception, @unchecked Sendable {
  override var reason: String { "The photo could not be opened" }
}

final class FlattenException: Exception, @unchecked Sendable {
  override var reason: String { "The photo could not be straightened" }
}
