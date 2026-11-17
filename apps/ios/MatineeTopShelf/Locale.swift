import Foundation

// Strings.gen.swift formats in this bundle's selected language, as the app does.
nonisolated extension Locale {
  static var app: Locale {
    guard let language = Bundle.main.preferredLocalizations.first else { return .current }
    var components = Locale.Components(locale: .current)
    components.languageComponents = Locale.Language.Components(identifier: language)
    return Locale(components: components)
  }
}
