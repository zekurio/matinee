import Testing

@testable import MatineeCore

/// Bars.kt's StatusBarScrim and HomeScreen.kt's fade of it; Android has no test for them.
struct StatusBarFrostTest {
  @Test func atRestTheFrostIsLightButNeverClear() {
    let rest = StatusBarFrostStrength(offset: 0)
    #expect(rest.scrolled == 0)
    #expect(abs(rest.veil - 0.35) < 1e-9)
    #expect(abs(rest.reducedVeil - 0.6) < 1e-9)
    #expect(rest.opacity == 1)
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

  @Test func homesFrostFadesInAsItScrolls() {
    #expect(StatusBarFrostStrength(offset: 0, fadesIn: true).opacity == 0)
    #expect(abs(StatusBarFrostStrength(offset: 10, fadesIn: true).opacity - 0.25) < 1e-9)
    #expect(StatusBarFrostStrength(offset: 40, fadesIn: true).opacity == 1)
    // And under it the veil deepens as on any page.
    #expect(abs(StatusBarFrostStrength(offset: 10, fadesIn: true).veil - 0.45) < 1e-9)
  }
}
