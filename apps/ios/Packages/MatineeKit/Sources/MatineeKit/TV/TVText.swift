#if os(tvOS)
  import Foundation

  /// The words the TV components show or say on their own, in English and
  /// German, from the `TV` table in Resources/*.lproj, beside the phone
  /// kit's `KitText`. They follow the environment's locale.
  nonisolated enum TVText: String {
    case watched, clearSearch, search, moreActions

    func callAsFunction(_ locale: Locale) -> String { TVText.lookup(rawValue, locale) }

    /// "62% watched": a card's progress, given the percentage.
    static func progress(_ percent: String, _ locale: Locale) -> String {
      String(format: lookup("progress %@", locale), percent)
    }

    private static func lookup(_ key: String, _ locale: Locale) -> String {
      bundle(for: locale).localizedString(forKey: key, value: nil, table: "TV")
    }

    private static func bundle(for locale: Locale) -> Bundle {
      let available = Bundle.module.localizations
      let preferred = [locale.language.languageCode?.identifier ?? "en"] + Locale.preferredLanguages
      let language = Bundle.preferredLocalizations(from: available, forPreferences: preferred).first ?? "en"
      guard let path = Bundle.module.path(forResource: language, ofType: "lproj"), let bundle = Bundle(path: path)
      else { return .module }
      return bundle
    }
  }
#endif
