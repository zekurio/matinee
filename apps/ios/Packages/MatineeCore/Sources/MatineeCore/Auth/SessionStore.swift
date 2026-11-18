import Foundation
import Security

@MainActor public protocol SecretStore {
  func token(for origin: String) throws -> String?
  func setToken(_ token: String?, for origin: String) throws
}

@MainActor public final class KeychainSecretStore: SecretStore {
  private let service: String
  public init(service: String = "io.github.zekurio.matinee.sessions") { self.service = service }
  private func query(_ origin: String) -> [String: Any] {
    [
      kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
      kSecAttrAccount as String: origin, kSecAttrSynchronizable as String: false,
    ]
  }
  public func token(for origin: String) throws -> String? {
    var q = query(origin)
    q[kSecReturnData as String] = true
    q[kSecMatchLimit as String] = kSecMatchLimitOne
    var result: CFTypeRef?
    let status = SecItemCopyMatching(q as CFDictionary, &result)
    if status == errSecItemNotFound { return nil }
    guard status == errSecSuccess else { throw KeychainError(status: status) }
    return (result as? Data).flatMap { String(data: $0, encoding: .utf8) }
  }
  public func setToken(_ token: String?, for origin: String) throws {
    let q = query(origin)
    guard let token else {
      let status = SecItemDelete(q as CFDictionary)
      guard status == errSecSuccess || status == errSecItemNotFound else {
        throw KeychainError(status: status)
      }
      return
    }
    // AfterFirstUnlock permits background downloads. Unlike Android's excluded
    // preferences, these items can migrate in encrypted backups. They do not sync
    // through iCloud Keychain; ThisDeviceOnly would prevent backup migration too.
    let values: [String: Any] = [
      kSecValueData as String: Data(token.utf8),
      kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock,
    ]
    let status = SecItemUpdate(q as CFDictionary, values as CFDictionary)
    if status == errSecItemNotFound {
      let added = SecItemAdd(q.merging(values) { _, new in new } as CFDictionary, nil)
      guard added == errSecSuccess else { throw KeychainError(status: added) }
    } else if status != errSecSuccess {
      throw KeychainError(status: status)
    }
  }
}
public struct KeychainError: Error { public let status: OSStatus }
public struct StoredServer: Codable, Sendable, Hashable {
  public var origin: String
  public var user: User?
  public var name: String?
  public init(origin: String, user: User? = nil, name: String? = nil) {
    self.origin = origin
    self.user = user
    self.name = name
  }
}
public struct PendingSignIn: Codable, Sendable {
  public let state: String
  public let verifier: String
  public let origin: String
}
@MainActor public final class SessionStore {
  public let secrets: any SecretStore
  private let defaults: UserDefaults
  public init(defaults: UserDefaults = .standard, secrets: any SecretStore = KeychainSecretStore())
  {
    self.defaults = defaults
    self.secrets = secrets
  }
  public var servers: [StoredServer] {
    get {
      guard let entries = defaults.array(forKey: "servers") as? [Data] else { return [] }
      return entries.compactMap { try? JSONDecoder().decode(StoredServer.self, from: $0) }
    }
    set { defaults.set(newValue.compactMap { try? JSONEncoder().encode($0) }, forKey: "servers") }
  }
  public var active: String? {
    get { defaults.string(forKey: "active_server") }
    set { defaults.set(newValue, forKey: "active_server") }
  }
  public var lastServer: String? {
    get { defaults.string(forKey: "last_server") }
    set { defaults.set(newValue, forKey: "last_server") }
  }
  public var offlineMode: Bool {
    get { defaults.bool(forKey: "offline_mode") }
    set { defaults.set(newValue, forKey: "offline_mode") }
  }
  public var pendingSignIn: PendingSignIn? {
    get {
      defaults.data(forKey: "pending_signin").flatMap {
        try? JSONDecoder().decode(PendingSignIn.self, from: $0)
      }
    }
    set {
      defaults.set(newValue.flatMap { try? JSONEncoder().encode($0) }, forKey: "pending_signin")
    }
  }
}
