import CoreGraphics
import Testing

@testable import MatineeCore

/// A profile picture goes up as the web's `prepareAvatar` sends it.
@Suite struct AvatarTests {
  @Test func cropsTheMiddleSquareAndScalesDown() throws {
    let wide = try #require(avatarCrop(width: 4032, height: 3024))
    #expect(wide.crop == CGRect(x: 504, y: 0, width: 3024, height: 3024))
    #expect(wide.side == AVATAR_UPLOAD_SIDE)
    let tall = try #require(avatarCrop(width: 1000, height: 1500))
    #expect(tall.crop == CGRect(x: 0, y: 250, width: 1000, height: 1000))
  }

  @Test func neverScalesUp() throws {
    let small = try #require(avatarCrop(width: 300, height: 200))
    #expect(small.crop == CGRect(x: 50, y: 0, width: 200, height: 200))
    #expect(small.side == 200)
  }

  @Test func refusesAnEmptyPicture() {
    #expect(avatarCrop(width: 0, height: 10) == nil)
  }
}
