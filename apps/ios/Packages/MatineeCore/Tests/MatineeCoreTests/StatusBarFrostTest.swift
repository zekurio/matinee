import Testing

@testable import MatineeCore

/// The frost under an iPad's tab bar over Home's banner; Android has no test for it.
struct StatusBarFrostTest {
  @Test func atRestTheFrostIsLightButNeverClear() {
    let rest = StatusBarFrostStrength(offset: 0)
    #expect(rest.scrolled == 0)
    #expect(abs(rest.veil - 0.35) < 1e-9)
    #expect(abs(rest.reducedVeil - 0.6) < 1e-9)
  }

  @Test func itDeepensOverTheFirstFortyPoints() {
    let half = StatusBarFrostStrength(offset: 20)
    #expect(abs(half.scrolled - 0.5) < 1e-9)
    #expect(abs(half.veil - 0.55) < 1e-9)
    let down = StatusBarFrostStrength(offset: 40)
    #expect(abs(down.veil - 0.75) < 1e-9)
    #expect(abs(down.reducedVeil - 0.85) < 1e-9)
    #expect(StatusBarFrostStrength(offset: 900) == down)
  }

  @Test func aPullPastTheTopCountsAsNone() {
    #expect(StatusBarFrostStrength(offset: -80).scrolled == 0)
    #expect(StatusBarFrostStrength(offset: .nan).scrolled == 0)
    #expect(StatusBarFrostStrength(offset: .infinity).scrolled == 0)
  }
}
