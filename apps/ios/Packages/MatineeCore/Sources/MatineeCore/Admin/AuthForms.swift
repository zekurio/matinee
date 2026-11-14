import Foundation

/*
 * AuthenticationSettings.kt's and ServerAppearanceSettings.kt's forms.
 */

/// The authentication form's edits to `saved`.
public struct AuthDraft: Equatable, Sendable {
  public let saved: AdminAuthSettings
  public var passkeys: PasskeySettings
  public var oidc: OidcSettings
  /// A new client secret, typed; empty keeps what's there.
  public var secret = ""
  /// The saved secret to be dropped on the next save.
  public var dropSecret = false

  public init(_ saved: AdminAuthSettings) {
    self.saved = saved
    passkeys = saved.passkeys
    oidc = saved.oidc
  }

  /// A new secret to save, the saved one dropped, or the saved one kept.
  public var change: Explicit<String> {
    let typed = secret.trimmingCharacters(in: .whitespacesAndNewlines)
    if !typed.isEmpty { return .value(typed) }
    return dropSecret ? .null : .omitted
  }

  public var dirty: Bool { passkeys != saved.passkeys || oidc != saved.oidc || change != .omitted }

  public var issuerInvalid: Bool {
    let issuer = oidc.issuerUrl
    guard !issuer.trimmingCharacters(in: .whitespaces).isEmpty else { return false }
    return issuer.range(of: "^https?://", options: [.regularExpression, .caseInsensitive]) == nil
  }

  public var scopesInvalid: Bool {
    let scopes = oidc.scopes
    guard !scopes.trimmingCharacters(in: .whitespaces).isEmpty else { return false }
    return !scopes.split(whereSeparator: \.isWhitespace).contains("openid")
  }

  public var canSave: Bool { !issuerInvalid && !scopesInvalid }

  /// A new secret typed replaces the saved one, so a removal no longer applies.
  public mutating func typeSecret(_ text: String) {
    secret = text
    if !text.isEmpty { dropSecret = false }
  }

  public mutating func reset() {
    passkeys = saved.passkeys
    oidc = saved.oidc
    secret = ""
    dropSecret = false
  }

  public func input() -> AuthSettingsInput {
    AuthSettingsInput(
      passkeys: passkeys,
      oidc: OidcSettingsInput(
        enabled: oidc.enabled, allowSignUp: oidc.allowSignUp,
        // The app has no fields for these yet, so a save keeps what the web set.
        signOutRefused: oidc.signOutRefused,
        displayName: oidc.displayName, issuerUrl: oidc.issuerUrl, clientId: oidc.clientId, scopes: oidc.scopes,
        usernameClaim: oidc.usernameClaim, roleClaim: oidc.roleClaim, groupsClaim: oidc.groupsClaim,
        policyClaim: oidc.policyClaim, clientSecret: change))
  }

  /// What's in use now, while the secret's field is empty.
  public enum SecretState: Equatable, Sendable {
    case environmentApplies, removed, saved, fromEnvironment, none
  }

  public var secretState: SecretState {
    if dropSecret { return saved.clientSecret.environment ? .environmentApplies : .removed }
    switch saved.clientSecret.source {
    case "saved": return .saved
    case "environment": return .fromEnvironment
    default: return .none
    }
  }

  /// The field's button, which drops the saved secret or takes the drop back: only while one is saved and nothing's typed.
  public var offersSecretToggle: Bool { saved.clientSecret.source == "saved" && secret.isEmpty }
}

/// The Matinee theme's own accents, as packages/ui's theme-colors has them.
public let DEFAULT_ACCENT_LIGHT = "#3b5bdb"
public let DEFAULT_ACCENT_DARK = "#6d8cf5"

/// Starting points, Matinee's own first, a shade per appearance, as the web offers them.
public let ACCENT_PRESETS: [(light: String, dark: String)] = [
  (DEFAULT_ACCENT_LIGHT, DEFAULT_ACCENT_DARK),
  ("#0369a1", "#38bdf8"),
  ("#0f766e", "#2dd4bf"),
  ("#13793a", "#4ade80"),
  ("#975c06", "#facc15"),
  ("#bb3e0b", "#fb923c"),
  ("#be123c", "#f43f5e"),
  ("#be185d", "#ec4899"),
]

/// "#ABC" or "abcdef" as `#rrggbb`, or nil when it isn't a color.
public func normalizeHex(_ text: String) -> String? {
  var digits = text.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
  if digits.hasPrefix("#") { digits.removeFirst() }
  if digits.count == 3 { digits = digits.map { "\($0)\($0)" }.joined() }
  guard digits.count == 6, digits.allSatisfy({ $0.isASCII && $0.isHexDigit }) else { return nil }
  return "#" + digits
}

/// What the server stores for `color`: nil for the theme's own accent.
public func storedAccent(_ color: String, default: String) -> String? {
  normalizeHex(color).flatMap { $0 == `default` ? nil : $0 }
}

/// The server appearance form's edits to `saved`.
public struct AccentDraft: Equatable, Sendable {
  public let saved: ThemeAccents
  public var light: String
  public var dark: String

  public init(_ saved: ThemeAccents) {
    self.saved = saved
    light = saved.light ?? DEFAULT_ACCENT_LIGHT
    dark = saved.dark ?? DEFAULT_ACCENT_DARK
  }

  public var draft: ThemeAccents {
    ThemeAccents(light: storedAccent(light, default: DEFAULT_ACCENT_LIGHT), dark: storedAccent(dark, default: DEFAULT_ACCENT_DARK))
  }

  public var valid: Bool { normalizeHex(light) != nil && normalizeHex(dark) != nil }

  /// A color that isn't one yet counts as an edit, so the bar stays while it's typed.
  public var dirty: Bool { !valid || draft != saved }

  /// Whether `preset` is what the fields hold.
  public func picked(_ preset: (light: String, dark: String)) -> Bool {
    normalizeHex(light) == preset.light && normalizeHex(dark) == preset.dark
  }

  public mutating func reset() {
    light = saved.light ?? DEFAULT_ACCENT_LIGHT
    dark = saved.dark ?? DEFAULT_ACCENT_DARK
  }
}
