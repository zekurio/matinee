import Darwin
import Foundation
import UIKit

/// What Dart can't read itself. Pigeon calls it on the main thread.
final class DeviceBridge: DeviceApi {
  func facts() throws -> DeviceFacts {
    let device = UIDevice.current
    return DeviceFacts(
      television: false,
      // From iOS 16 this is "iPhone" or "iPad" unless Apple grants the
      // user-assigned-device-name entitlement, which is still a fair name.
      name: device.name,
      model: Self.hardwareModel(),
      osVersion: device.systemVersion,
      appVersion: Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String
        ?? "",
      timeZone: TimeZone.current.identifier)
  }

  /// iOS asks for local network access by itself, the first time the app
  /// sends to the LAN, so there's nothing to ask beforehand.
  func localNetworkMissing() throws -> Bool { false }

  func requestLocalNetwork() async throws -> Bool { true }

  func broadcastAddresses() throws -> [String] {
    var found: Set<String> = []
    var interfaces: UnsafeMutablePointer<ifaddrs>?
    guard getifaddrs(&interfaces) == 0 else { return [] }
    defer { freeifaddrs(interfaces) }
    var current = interfaces
    while let entry = current {
      defer { current = entry.pointee.ifa_next }
      let interface = entry.pointee
      let flags = Int32(interface.ifa_flags)
      // On a broadcast interface, ifa_dstaddr holds the broadcast address.
      guard flags & IFF_UP != 0, flags & IFF_LOOPBACK == 0, flags & IFF_BROADCAST != 0,
        let address = interface.ifa_dstaddr, address.pointee.sa_family == UInt8(AF_INET)
      else { continue }
      var host = [CChar](repeating: 0, count: Int(NI_MAXHOST))
      if getnameinfo(
        address, socklen_t(address.pointee.sa_len), &host, socklen_t(host.count), nil, 0,
        NI_NUMERICHOST) == 0
      {
        found.insert(String(cString: host))
      }
    }
    return Array(found)
  }

  /// This app installs over the SwiftUI app, which had the same bundle id,
  /// and existing installs start fresh, once: its settings, its sign-ins in
  /// the Keychain, its downloads and their background session. Flutter's
  /// own storage is under other keys and stays.
  func freshStart() throws -> Bool {
    let files = FileManager.default
    let support = files.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    let marker = support.appendingPathComponent(".matinee-fresh-start")
    if files.fileExists(atPath: marker.path) { return false }
    let defaults = UserDefaults.standard
    for key in defaults.dictionaryRepresentation().keys
    where Self.swiftDefaults.contains(key) || key.hasSuffix("/profile") || key.contains("/stats-") {
      defaults.removeObject(forKey: key)
    }
    SecItemDelete(
      [kSecClass: kSecClassGenericPassword, kSecAttrService: "io.github.zekurio.matinee.sessions"] as CFDictionary)
    try? files.removeItem(at: support.appendingPathComponent("Matinee"))
    let old = URLSession(configuration: .background(withIdentifier: "io.github.zekurio.matinee.downloads"))
    old.invalidateAndCancel()
    try files.createDirectory(at: support, withIntermediateDirectories: true)
    try Data().write(to: marker)
    return true
  }

  /// The SwiftUI app's UserDefaults keys; its profile snapshots went under
  /// the account's name, `{username}/profile` and `{username}/stats-{range}`.
  private static let swiftDefaults: Set<String> = [
    "servers", "active_server", "last_server", "offline_mode", "pending_signin", "player", "player.firstURL",
    "player.trace", "downloads.codec", "downloads.subtitles", "downloads.unmetered", "downloads.version",
    "theme.mode", "theme.accents",
  ]

  func displayNames(codes: [String], kind: DisplayNameKind, language: String) throws -> [String:
    String]
  {
    let locale = Locale(identifier: language)
    var names: [String: String] = [:]
    for code in codes {
      let name: String? =
        switch kind {
        case .language: locale.localizedString(forIdentifier: code)
        case .region: locale.localizedString(forRegionCode: code)
        }
      guard let name, !name.isEmpty, name.caseInsensitiveCompare(code) != .orderedSame else {
        continue
      }
      names[code] = name.prefix(1).capitalized(with: locale) + name.dropFirst()
    }
    return names
  }

  /// Like "iPhone16,1": `UIDevice.model` only says "iPhone".
  static func hardwareModel() -> String {
    #if targetEnvironment(simulator)
      if let simulated = ProcessInfo.processInfo.environment["SIMULATOR_MODEL_IDENTIFIER"] {
        return simulated
      }
    #endif
    var system = utsname()
    uname(&system)
    return withUnsafeBytes(of: &system.machine) { bytes in
      String(decoding: bytes.prefix { $0 != 0 }, as: UTF8.self)
    }
  }
}
