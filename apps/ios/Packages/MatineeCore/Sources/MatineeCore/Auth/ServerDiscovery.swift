import Darwin
import Foundation

public struct DiscoveredServer: Sendable, Equatable {
  public let name: String
  public let url: String
}
public struct DiscoveryDestination: Sendable, Hashable {
  public let host: String
  public let port: UInt16
  public init(_ host: String, port: UInt16 = 8421) {
    self.host = host
    self.port = port
  }
}
private struct DiscoveryReply: Decodable {
  let version: Int
  let name: String
  let url: String
}
func readDiscoveryReply(_ data: Data) -> DiscoveredServer? {
  guard data.count <= 512, String(data: data, encoding: .utf8) != nil,
    let reply = try? JSONDecoder().decode(DiscoveryReply.self, from: data), reply.version == 1,
    !reply.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
    reply.name.trimmingCharacters(in: .whitespacesAndNewlines).unicodeScalars.count <= 64,
    reply.url.unicodeScalars.count <= 400,
    let c = URLComponents(string: reply.url), ["https", "http"].contains(c.scheme),
    c.host?.isEmpty == false, c.url != nil,
    c.port.map({ (1...65535).contains($0) }) ?? true,
    c.user == nil, c.password == nil
  else { return nil }
  return .init(name: reply.name.trimmingCharacters(in: .whitespacesAndNewlines), url: reply.url)
}
public func discoveryBroadcastAddresses() -> [DiscoveryDestination] {
  var result: Set<DiscoveryDestination> = [.init("255.255.255.255")]
  var interfaces: UnsafeMutablePointer<ifaddrs>?
  guard getifaddrs(&interfaces) == 0 else { return Array(result) }
  defer { freeifaddrs(interfaces) }
  var current = interfaces
  while let entry = current {
    defer { current = entry.pointee.ifa_next }
    let interface = entry.pointee
    guard interface.ifa_flags & UInt32(IFF_UP) != 0,
      interface.ifa_flags & UInt32(IFF_BROADCAST) != 0,
      let address = interface.ifa_dstaddr, address.pointee.sa_family == UInt8(AF_INET)
    else { continue }
    var host = [CChar](repeating: 0, count: Int(NI_MAXHOST))
    if getnameinfo(
      address, socklen_t(address.pointee.sa_len), &host, socklen_t(host.count), nil, 0,
      NI_NUMERICHOST) == 0
    {
      let bytes = host.prefix { $0 != 0 }.map { UInt8(bitPattern: $0) }
      result.insert(.init(String(decoding: bytes, as: UTF8.self)))
    }
  }
  return Array(result)
}

/// What a scan heard: a server that answered, or that it couldn't ask at all.
public enum DiscoveryEvent: Sendable, Equatable {
  case found(DiscoveredServer)
  /// No probe went out: the socket couldn't be opened or set to broadcast,
  /// or every send failed, as iOS fails a broadcast with EHOSTUNREACH for an
  /// app without the multicast entitlement or local network access. Nothing
  /// will answer this scan; the screen offers typing the address instead.
  case unavailable
}

/// Whether a scan asked no one: it tried to send and every send failed.
/// A scan with nowhere to send, as with no network at all, sent nothing
/// and failed nothing, so it's an empty scan rather than an unavailable one.
func probesFailed(_ results: [Int]) -> Bool {
  !results.isEmpty && results.allSatisfy { $0 < 0 }
}

/// The servers that answer a scan; `scanForServers` also says when it couldn't ask.
public func discoverServers(
  timeoutMillis: Int = 3000,
  destinations: @escaping @Sendable () throws -> [DiscoveryDestination] =
    discoveryBroadcastAddresses
) -> AsyncStream<DiscoveredServer> {
  let events = scanForServers(timeoutMillis: timeoutMillis, destinations: destinations)
  return AsyncStream { continuation in
    let task = Task {
      for await event in events {
        if case .found(let server) = event { continuation.yield(server) }
      }
      continuation.finish()
    }
    continuation.onTermination = { _ in task.cancel() }
  }
}

/// Broadcasts the probe of apps/server/README.md, "Local server discovery",
/// and yields each server that answers, once per URL, for `timeoutMillis`.
///
/// BSD sockets rather than Network.framework, which has no way to send to a
/// broadcast address; Apple's TN3179 points broadcasts at BSD sockets too.
/// iOS prompts on first LAN use (NSLocalNetworkUsageDescription), and needs
/// the multicast entitlement for IPv4 broadcast; without either, every send
/// fails and the scan yields `.unavailable`. tvOS has neither the prompt nor
/// the entitlement, and broadcasts freely. An empty scan still cannot tell a
/// quiet network from replies that never arrived. No Bonjour services are used.
public func scanForServers(
  timeoutMillis: Int = 3000,
  destinations: @escaping @Sendable () throws -> [DiscoveryDestination] =
    discoveryBroadcastAddresses
) -> AsyncStream<DiscoveryEvent> {
  AsyncStream { continuation in
    let task = Task.detached {
      guard timeoutMillis > 0 else {
        continuation.finish()
        return
      }
      let fd = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP)
      guard fd >= 0 else {
        continuation.yield(.unavailable)
        continuation.finish()
        return
      }
      defer {
        close(fd)
        continuation.finish()
      }
      var enabled: Int32 = 1
      guard
        setsockopt(
          fd, SOL_SOCKET, SO_BROADCAST, &enabled, socklen_t(MemoryLayout.size(ofValue: enabled)))
          == 0
      else {
        continuation.yield(.unavailable)
        return
      }
      var local = sockaddr_in()
      local.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
      local.sin_family = sa_family_t(AF_INET)
      let bound = withUnsafePointer(to: &local) {
        $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
          bind(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
        }
      }
      guard bound == 0 else {
        continuation.yield(.unavailable)
        return
      }
      let clock = ContinuousClock()
      let deadline = clock.now.advanced(by: .milliseconds(timeoutMillis))
      let probe = Array(
        "Matinee discovery v1".padding(toLength: 512, withPad: " ", startingAt: 0).utf8)
      var sent: [Int] = []
      for destination in Set((try? destinations()) ?? []) {
        if Task.isCancelled { return }
        var address = sockaddr_in()
        address.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
        address.sin_family = sa_family_t(AF_INET)
        address.sin_port = destination.port.bigEndian
        guard destination.port != 0, inet_pton(AF_INET, destination.host, &address.sin_addr) == 1
        else { continue }
        sent.append(
          withUnsafePointer(to: &address) { pointer in
            pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) {
              sendto(fd, probe, probe.count, 0, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
            }
          })
      }
      if probesFailed(sent) {
        continuation.yield(.unavailable)
        return
      }
      var seen: Set<String> = []
      var bytes = [UInt8](repeating: 0, count: 513)
      while !Task.isCancelled && clock.now < deadline {
        var descriptor = pollfd(fd: fd, events: Int16(POLLIN), revents: 0)
        guard poll(&descriptor, 1, 20) > 0 else { continue }
        let count = recv(fd, &bytes, bytes.count, 0)
        if count < 0 { return }
        guard let server = readDiscoveryReply(Data(bytes.prefix(count))),
          let url = URL(string: server.url)
        else { continue }
        var normalized = URLComponents(url: url, resolvingAgainstBaseURL: false)!
        normalized.scheme = normalized.scheme?.lowercased()
        normalized.host = normalized.host?.lowercased()
        if (normalized.scheme == "https" && normalized.port == 443)
          || (normalized.scheme == "http" && normalized.port == 80)
        {
          normalized.port = nil
        }
        if normalized.path.isEmpty { normalized.path = "/" }
        if seen.insert(normalized.string ?? server.url).inserted { continuation.yield(.found(server)) }
      }
    }
    continuation.onTermination = { _ in task.cancel() }
  }
}
