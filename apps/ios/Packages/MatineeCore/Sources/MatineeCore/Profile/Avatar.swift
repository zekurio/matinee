import CoreGraphics
import Foundation

/// The side a profile picture goes up at, at most: twice the 256 pixels the
/// server keeps, so its own crop has room to work, as the web's `prepareAvatar`.
public let AVATAR_UPLOAD_SIDE = 512

/// How a picture of `width` by `height` pixels becomes a profile picture,
/// as the web's `prepareAvatar` does it: the square in its middle, scaled
/// down to at most `maxSide`, never up. Nil for a picture with no pixels.
public func avatarCrop(width: Int, height: Int, maxSide: Int = AVATAR_UPLOAD_SIDE) -> (crop: CGRect, side: Int)? {
  guard width > 0, height > 0, maxSide > 0 else { return nil }
  let square = min(width, height)
  let crop = CGRect(x: (width - square) / 2, y: (height - square) / 2, width: square, height: square)
  return (crop, min(square, maxSide))
}
