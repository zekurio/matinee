import Foundation
import Testing

@testable import MatineeCore

struct VideoRectTests {
  @Test func fitAndFill() {
    let bounds = CGSize(width: 200, height: 100)
    #expect(videoRect(aspect: 1, in: bounds, fill: false) == CGRect(x: 50, y: 0, width: 100, height: 100))
    #expect(videoRect(aspect: 1, in: bounds, fill: true) == CGRect(x: 0, y: -50, width: 200, height: 200))
    #expect(videoRect(aspect: 4, in: bounds, fill: false) == CGRect(x: 0, y: 25, width: 200, height: 50))
    #expect(videoRect(aspect: 4, in: bounds, fill: true) == CGRect(x: -100, y: 0, width: 400, height: 100))
    for fill in [false, true] {
      #expect(videoRect(aspect: 2, in: bounds, fill: fill) == CGRect(origin: .zero, size: bounds))
    }
  }

  @Test func unknownSizes() {
    for bounds in [CGSize.zero, CGSize(width: 0, height: 100), CGSize(width: 200, height: 0)] {
      #expect(videoRect(aspect: 2, in: bounds, fill: false) == CGRect(origin: .zero, size: bounds))
    }
    let bounds = CGSize(width: 200, height: 100)
    for aspect in [0.0, -1, .nan] {
      #expect(videoRect(aspect: aspect, in: bounds, fill: true) == CGRect(origin: .zero, size: bounds))
    }
  }
}
