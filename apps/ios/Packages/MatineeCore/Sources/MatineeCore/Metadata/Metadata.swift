import Foundation

/*
 * What the admin's metadata pages decide, from MetadataScreens.kt: the
 * search Fix match sends, which entry is the match now, what each image
 * slot says about the image it has, which buttons a slot offers, the
 * caption under a provider's image, and whether a picked file can go up.
 * The words are the app's; this only picks.
 */

/// What Fix match searches for: the name typed, or the title's own when
/// the field is empty, and the year typed, if it's a number.
public struct IdentifyQuery: Hashable, Sendable {
  public var name: String
  public var year: Int?

  public init(name: String, year: Int?) {
    self.name = name
    self.year = year
  }

  /// From the fields as typed, falling back on `fallback`, the title's name.
  public init(typed name: String, year: String, fallback: String) {
    let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
    self.name = trimmed.isEmpty ? fallback : trimmed
    self.year = Int(year.trimmingCharacters(in: .whitespacesAndNewlines))
  }
}

/// The year field keeps digits only, four at most, as Android's.
public func yearDigits(_ typed: String) -> String {
  String(typed.filter(\.isASCIIDigit).prefix(4))
}

extension Character {
  fileprivate var isASCIIDigit: Bool { isASCII && isNumber }
}

/// Whether `match` is the entry `title` is matched to now. The provider has
/// to agree too when the title says which it is, since two providers can
/// use the same id for different entries.
public func isCurrentMatch(_ match: MetadataMatch, of title: Title) -> Bool {
  guard let providerId = title.providerId, match.id == providerId else { return false }
  return title.provider == nil || title.provider == match.provider
}

/// The provider whose name the image editor gives, and that lists images:
/// only one with its API key, as one without has nothing to list either.
public func usableProvider(_ provider: MetadataProvider?) -> MetadataProvider? {
  provider?.configured == true ? provider : nil
}

/// The provider lists images for `title` only for an entry it matched.
public func listsImages(provider: MetadataProvider?, title: Title) -> Bool {
  usableProvider(provider) != nil && title.providerId != nil
}

/// What a slot's card says about the image it has: "Picked from TMDB",
/// "Uploaded", "None", and so on.
public enum ImageState: Hashable, Sendable {
  /// Taken away by hand.
  case removed
  /// None, so a frame from the file shows, for an episode's still.
  case noneFrame
  case none
  case uploaded
  /// Picked by hand, from a provider the library no longer has.
  case picked
  case pickedFrom(String)
  case from(String)

  public init(slot: String, current: ItemImage, providerName: String?) {
    self =
      if current.image == nil && current.chosen {
        .removed
      } else if current.image == nil && slot == ImageSlot.still {
        .noneFrame
      } else if current.image == nil {
        .none
      } else if current.uploaded {
        .uploaded
      } else if let providerName {
        current.chosen ? .pickedFrom(providerName) : .from(providerName)
      } else {
        .picked
      }
  }
}

/// The buttons under the slots, for the slot picked.
public struct ImageButtons: Hashable, Sendable {
  /// Taking the image away, when there's one.
  public var remove: Bool
  /// Going back to the provider's, when one was picked by hand and the
  /// provider lists any.
  public var reset: Bool

  public init(inUse: ItemImage?, lists: Bool) {
    remove = inUse?.image != nil
    reset = inUse?.chosen == true && lists
  }
}

/// How wide a slot's image is for its height.
public func imageAspect(_ slot: String) -> Double {
  slot == ImageSlot.poster ? 2.0 / 3.0 : 16.0 / 9.0
}

/// How many of a provider's images go in a row `width` wide: three posters
/// or two of the wide ones on a phone, as Android's, and on a wider screen
/// as many as keep each about as big as on a phone. With `largeText`, one
/// fewer, so the captions under them still fit.
public func imageColumns(_ slot: String, width: Double, largeText: Bool = false) -> Int {
  let poster = slot == ImageSlot.poster
  let fewest = poster ? 3 : 2
  let columns = width >= 600 ? max(fewest, Int(width / (poster ? 150 : 280))) : fewest
  return largeText ? max(1, columns - 1) : columns
}

/// The caption under a provider's image: its size, and its language or
/// that it has no text. Stills have no text to speak of, whatever the
/// provider says.
public struct ImageCaption: Hashable, Sendable {
  public enum Language: Hashable, Sendable {
    /// An ISO 639-1 code, for the app to name in its own language.
    case code(String)
    case noText
  }

  public struct Size: Hashable, Sendable {
    public var width: Int
    public var height: Int
  }

  public var size: Size?
  public var language: Language?

  public init(_ image: RemoteImage, slot: String) {
    if let width = image.width, let height = image.height { size = Size(width: width, height: height) }
    if slot != ImageSlot.still { language = image.language.map(Language.code) ?? .noText }
  }
}

/// A language code's name in `locale`'s language, capitalized as a
/// caption starts: "en" is "English", or "Englisch" in German.
public func languageName(_ code: String, locale: Locale) -> String {
  let name = locale.localizedString(forLanguageCode: code) ?? code
  return name.prefix(1).uppercased(with: locale) + name.dropFirst()
}

/// Why a picked file can't go up as an image.
public enum UploadProblem: Error, Hashable, Sendable {
  /// Not a JPEG, PNG, or WebP.
  case wrongType
  /// Over `MAX_IMAGE_BYTES`.
  case tooBig
  /// Nothing could be read.
  case unreadable
}

/// What an image file is, from its first bytes: the server takes JPEG,
/// PNG, and WebP, and checks the same way, so what a picker claims about
/// a file doesn't decide.
public func sniffImageType(_ data: Data) -> String? {
  let bytes = [UInt8](data.prefix(12))
  if bytes.starts(with: [0xFF, 0xD8, 0xFF]) { return "image/jpeg" }
  if bytes.starts(with: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]) { return "image/png" }
  if bytes.count == 12, bytes.starts(with: Array("RIFF".utf8)), Array(bytes[8..<12]) == Array("WEBP".utf8) {
    return "image/webp"
  }
  return nil
}

/// A file picked to upload, checked: its type and the part to send, or
/// what's wrong with it.
public func checkUpload(_ data: Data?) -> Result<FilePart, UploadProblem> {
  guard let data, !data.isEmpty else { return .failure(.unreadable) }
  guard let type = sniffImageType(data), IMAGE_TYPES.contains(type) else { return .failure(.wrongType) }
  guard Int64(data.count) <= MAX_IMAGE_BYTES else { return .failure(.tooBig) }
  return .success(FilePart(bytes: data, type: type, name: "image." + type.dropFirst("image/".count)))
}
