import Foundation

/*
 * ServerBrandingSettings.kt's form, as the web's branding panel has it:
 * the accents (AccentDraft, in AuthForms.swift) and the login screen's
 * backdrop, saved together.
 */

/// The most blur the login backdrop takes, as the contract's
/// `LOGIN_BACKDROP_MAX_BLUR` caps it.
public let LOGIN_BACKDROP_MAX_BLUR = 48

/// The branding form's edits to `saved`: the accents, and how the login
/// screen shows the libraries' artwork behind its form.
public struct BrandingDraft: Equatable, Sendable {
  public let saved: Branding
  public var accents: AccentDraft
  public var backdrop: LoginBackdrop

  public init(_ saved: Branding) {
    self.saved = saved
    accents = AccentDraft(saved.themeAccents)
    backdrop = saved.loginBackdrop
  }

  /// Whether it can be saved: both accents are colors.
  public var valid: Bool { accents.valid }

  /// A color still being typed counts as an edit, so the bar stays while it's typed.
  public var dirty: Bool { accents.dirty || backdrop != saved.loginBackdrop }

  /// What a save sends; the accents as the server stores them, nil for Matinee's own.
  public var draft: Branding { Branding(themeAccents: accents.draft, loginBackdrop: backdrop) }

  /// The blur in its range, a whole number, as the slider sets it.
  public mutating func setBlur(_ value: Double) {
    backdrop.blur = Int(value.rounded()).clamped(0, LOGIN_BACKDROP_MAX_BLUR)
  }

  /// The fade, a percentage, as the slider sets it.
  public mutating func setFade(_ value: Double) {
    backdrop.fade = Int(value.rounded()).clamped(0, 100)
  }

  public mutating func reset() {
    accents.reset()
    backdrop = saved.loginBackdrop
  }
}

extension Int {
  fileprivate func clamped(_ low: Int, _ high: Int) -> Int { Swift.min(Swift.max(self, low), high) }
}
