import Flutter
import Foundation
import Security

/// What an Apple TV keeps for the app: its settings in the defaults and its
/// session tokens in the Keychain. On the other platforms plugins do this,
/// and none of them has a tvOS side. Pigeon calls it on the main thread.
final class AppleTvBridge: AppleTvApi {
  private let defaults = UserDefaults.standard

  /// Ahead of each setting's key, to tell the app's own from what the
  /// system keeps in the same defaults.
  private static let prefix = "matinee.preference."
  private static let service = "io.github.zekurio.matinee.secrets"

  func preferences() throws -> [String: Any] {
    var found: [String: Any] = [:]
    for (key, value) in defaults.dictionaryRepresentation() where key.hasPrefix(Self.prefix) {
      found[String(key.dropFirst(Self.prefix.count))] = value
    }
    return found
  }

  func setPreference(key: String, value: Any?) throws {
    let name = Self.prefix + key
    switch value {
    // Dart's null comes over the channel as NSNull.
    case nil, is NSNull:
      defaults.removeObject(forKey: name)
    case let list as [Any?]:
      // A list of strings, which the channel hands over as a list of anything.
      defaults.set(list.compactMap { $0 as? String }, forKey: name)
    case let value?:
      defaults.set(value, forKey: name)
    }
  }

  func secret(key: String) throws -> String? {
    var query = item(key)
    query[kSecReturnData] = true
    query[kSecMatchLimit] = kSecMatchLimitOne
    var found: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &found)
    if status == errSecItemNotFound { return nil }
    // A Keychain that can't be read is not a missing token: Dart keeps the
    // sign-in and offers to try again.
    guard status == errSecSuccess, let data = found as? Data, let text = String(data: data, encoding: .utf8) else {
      throw failure("read", status)
    }
    return text
  }

  func setSecret(key: String, value: String?) throws {
    guard let value else {
      let status = SecItemDelete(item(key) as CFDictionary)
      guard status == errSecSuccess || status == errSecItemNotFound else { throw failure("delete", status) }
      return
    }
    let data = Data(value.utf8)
    var status = SecItemUpdate(item(key) as CFDictionary, [kSecValueData: data] as CFDictionary)
    if status == errSecItemNotFound {
      var added = item(key)
      added[kSecValueData] = data
      // The token is this device's own, and readable once it has started,
      // so the app can open after a restart with nobody there.
      added[kSecAttrAccessible] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
      status = SecItemAdd(added as CFDictionary, nil)
    }
    guard status == errSecSuccess else { throw failure("write", status) }
  }

  func cacheFolder() throws -> String {
    FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].path
  }

  private func item(_ key: String) -> [CFString: Any] {
    [kSecClass: kSecClassGenericPassword, kSecAttrService: Self.service, kSecAttrAccount: key]
  }

  private func failure(_ what: String, _ status: OSStatus) -> PigeonError {
    PigeonError(code: "keychain", message: "The Keychain could not \(what) (\(status)).", details: nil)
  }
}
