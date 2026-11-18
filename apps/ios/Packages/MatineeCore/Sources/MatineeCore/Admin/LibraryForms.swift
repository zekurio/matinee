import Foundation

/*
 * LibrariesSettings.kt's and UsersSettings.kt's logic: what a library's
 * row says, the editor's draft and its languages, the folder picker's
 * bar, and what an admin may do to an account.
 */

/// What a library's row says it's doing.
public enum LibraryState: Equatable, Sendable {
  case scanning
  /// Fetching metadata, from the provider named, when it's known.
  case fetching(provider: String?)
  /// At rest: its titles, and the provider it uses, when it's known.
  case idle(titles: Int, provider: String?)
}

public func libraryState(_ library: Library, providers: [MetadataProvider]?) -> LibraryState {
  let provider = providers?.first { $0.id == library.metadataProvider }?.name
  if library.scanning { return .scanning }
  if library.refreshing { return .fetching(provider: provider) }
  return .idle(titles: library.titleCount, provider: provider)
}

/// Whether any library is being scanned or fetched, which the page follows by asking again.
public func librariesBusy(_ libraries: [Library]) -> Bool { libraries.contains { $0.scanning || $0.refreshing } }

/// Languages every provider has a fair amount of data in, as the web's
/// library dialog offers them, with the tag their name comes from: the
/// region only where it matters.
public let METADATA_LANGUAGES: [(value: String, tag: String)] = [
  ("en-US", "en"), ("de-DE", "de"), ("fr-FR", "fr"), ("es-ES", "es"), ("it-IT", "it"), ("pt-BR", "pt-BR"),
  ("nl-NL", "nl"), ("pl-PL", "pl"), ("sv-SE", "sv"), ("ja-JP", "ja"), ("ko-KR", "ko"), ("zh-CN", "zh"),
]

/// The offered language in the device's `language` code, else English.
public func defaultMetadataLanguage(_ language: String?) -> String {
  METADATA_LANGUAGES.first { $0.value.split(separator: "-").first.map(String.init) == language }?.value ?? "en-US"
}

/// The languages to offer: a library saved with one the list lacks keeps it as a choice.
public func offeredMetadataLanguages(_ current: String) -> [(value: String, tag: String)] {
  METADATA_LANGUAGES.contains { $0.value == current } ? METADATA_LANGUAGES : METADATA_LANGUAGES + [(current, current)]
}

/// The folder `path` is in, "/" at the top.
public func parentFolder(_ path: String) -> String {
  var trimmed = Substring(path)
  while trimmed.hasSuffix("/") { trimmed = trimmed.dropLast() }
  guard let slash = trimmed.lastIndex(of: "/") else { return "/" }
  let parent = trimmed[..<slash]
  return parent.isEmpty ? "/" : String(parent)
}

/// The last part of `path`, or the path itself at the top.
public func folderName(_ path: String) -> String {
  var trimmed = Substring(path)
  while trimmed.hasSuffix("/") { trimmed = trimmed.dropLast() }
  let name = trimmed.split(separator: "/", omittingEmptySubsequences: false).last.map(String.init) ?? ""
  return name.isEmpty ? path : name
}

/// The library editor's fields.
public struct LibraryDraft: Equatable, Sendable {
  public var name: String
  public var kind: String
  public var provider: String?
  public var language: String
  public var paths: [String]

  /// A draft from `existing`, or for a new library, the first provider with
  /// its key and the device's language.
  public init(existing: Library?, providers: [MetadataProvider], deviceLanguage: String?) {
    name = existing?.name ?? ""
    kind = existing?.kind ?? LibraryKind.movies
    provider = existing.map(\.metadataProvider) ?? providers.first { $0.configured }?.id
    language = existing?.metadataLanguage ?? defaultMetadataLanguage(deviceLanguage)
    paths = existing?.paths ?? []
  }

  public var valid: Bool { !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !paths.isEmpty }

  public var input: LibraryInput {
    LibraryInput(
      name: name.trimmingCharacters(in: .whitespacesAndNewlines), kind: kind, paths: paths,
      metadataProvider: provider, metadataLanguage: language)
  }

  /// A folder the picker handed back, added once.
  public mutating func add(_ path: String) {
    if !paths.contains(path) { paths.append(path) }
  }

  public mutating func remove(_ path: String) { paths.removeAll { $0 == path } }

  /// A provider picked: one without its key can't fetch anything, so it isn't taken.
  public mutating func pick(provider choice: String?, from providers: [MetadataProvider]) {
    if choice == nil || providers.first(where: { $0.id == choice })?.configured == true { provider = choice }
  }

  /// Where the folder picker opens: media usually sits beside the folder
  /// added last, or the ones other libraries use.
  public func pickerStart(existing: Library?, knownPath: String?) -> String? {
    (paths.last ?? existing?.paths.first ?? knownPath).map(parentFolder)
  }
}

/// What the folder picker's bar says, and what its button does.
public enum PickerBar: Equatable, Sendable {
  /// Nothing to add yet: at the top, or before the first folder loads.
  case openRoot
  case alreadyAdded(String)
  /// The open folder, which the button adds, with its name for the button.
  case adds(path: String, name: String)
}

public func pickerBar(_ listing: DirectoryListing?, added: [String]) -> PickerBar {
  guard let listing, listing.parent != nil else { return .openRoot }
  if added.contains(listing.path) { return .alreadyAdded(listing.path) }
  return .adds(path: listing.path, name: folderName(listing.path))
}

/// What an admin is about to do to an account, waiting for a yes.
public enum UserAction: Equatable, Sendable, Identifiable {
  case role(AdminUser, admin: Bool)
  case signOut(AdminUser)
  case delete(AdminUser)

  public var user: AdminUser {
    switch self {
    case .role(let user, _), .signOut(let user), .delete(let user): user
    }
  }

  public var id: String {
    switch self {
    case .role(let user, let admin): "role-\(user.id)-\(admin)"
    case .signOut(let user): "sign-out-\(user.id)"
    case .delete(let user): "delete-\(user.id)"
    }
  }

  /// Whether this would leave the server without an admin, when `user` is
  /// its last: the server keeps one who can sign in, so the app says so
  /// rather than ask.
  public func strandsServer(lastAdmin: Bool) -> Bool {
    guard lastAdmin else { return false }
    switch self {
    case .delete: return true
    case .role(_, let admin): return !admin
    case .signOut: return false
    }
  }
}

/// Whether `user` is the server's only admin, of `users`.
public func isLastAdmin(_ user: AdminUser, of users: [AdminUser]) -> Bool {
  user.isAdmin && users.filter(\.isAdmin).count <= 1
}
