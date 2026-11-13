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

/// iOS prompts on first LAN use. Set NSLocalNetworkUsageDescription. No Bonjour
/// services are used. IPv4 broadcast requires the multicast entitlement on iOS.
/// An empty scan cannot distinguish denied LAN access from a quiet network.
public func discoverServers(
  timeoutMillis: Int = 3000,
  destinations: @escaping @Sendable () throws -> [DiscoveryDestination] =
    discoveryBroadcastAddresses
) -> AsyncStream<DiscoveredServer> {
  AsyncStream { continuation in
    let task = Task.detached {
      guard timeoutMillis > 0 else {
        continuation.finish()
        return
      }
      let fd = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP)
      guard fd >= 0 else {
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
      else { return }
      var local = sockaddr_in()
      local.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
      local.sin_family = sa_family_t(AF_INET)
      let bound = withUnsafePointer(to: &local) {
        $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
          bind(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
        }
      }
      guard bound == 0 else { return }
      let clock = ContinuousClock()
      let deadline = clock.now.advanced(by: .milliseconds(timeoutMillis))
      let probe = Array(
        "Matinee discovery v1".padding(toLength: 512, withPad: " ", startingAt: 0).utf8)
      for destination in Set((try? destinations()) ?? []) {
        if Task.isCancelled { return }
        var address = sockaddr_in()
        address.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
        address.sin_family = sa_family_t(AF_INET)
        address.sin_port = destination.port.bigEndian
        guard destination.port != 0, inet_pton(AF_INET, destination.host, &address.sin_addr) == 1
        else { continue }
        _ = withUnsafePointer(to: &address) { pointer in
          pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) {
            sendto(fd, probe, probe.count, 0, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
          }
        }
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
        if seen.insert(normalized.string ?? server.url).inserted { continuation.yield(server) }
      }
    }
    continuation.onTermination = { _ in task.cancel() }
  }
}
