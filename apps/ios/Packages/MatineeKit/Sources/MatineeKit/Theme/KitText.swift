import Foundation
import SwiftUI

/// The words the kit's components show or say on their own, like a close
/// button's label, in English and German (Resources/*.lproj). They follow
/// the environment's locale, so a preview or the gallery can switch
/// language, and otherwise the device's.
nonisolated enum KitText: String {
  case back, close, cancel, closeToast, loading, previousMonth, nextMonth, clearText
  case showPassword, hidePassword, rangeStart, rangeEnd

  func callAsFunction(_ locale: Locale) -> String { KitText.lookup(rawValue, locale) }

  /// "Today, Monday 3 March": a calendar day that's today.
  static func today(_ date: String, _ locale: Locale) -> String {
    String(format: lookup("today %@", locale), date)
  }

  private static func lookup(_ key: String, _ locale: Locale) -> String {
    bundle(for: locale).localizedString(forKey: key, value: nil, table: nil)
  }

  /// The kit's own translations for `locale`'s language, or English.
  private static func bundle(for locale: Locale) -> Bundle {
    let available = Bundle.module.localizations
    let preferred = [locale.language.languageCode?.identifier ?? "en"] + Locale.preferredLanguages
    let language = Bundle.preferredLocalizations(from: available, forPreferences: preferred).first ?? "en"
    guard let path = Bundle.module.path(forResource: language, ofType: "lproj"), let bundle = Bundle(path: path)
    else { return .module }
    return bundle
  }
}
