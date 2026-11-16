import Darwin
import Foundation
import Testing

@testable import MatineeCore

struct ServerDiscoveryTests {
  let good = #"{"version":1,"name":"Matinee","url":"https://media.example.com","future":true}"#
  @Test func malformedReplies() {
    for text in [
      "not JSON", "{}", good.replacingOccurrences(of: "\"version\":1", with: "\"version\":2"),
      good.replacingOccurrences(of: "\"version\":1", with: "\"version\":\"1\""),
      good.replacingOccurrences(of: "\"Matinee\"", with: "42"),
      good.replacingOccurrences(of: "https://media.example.com", with: "file:///etc/passwd"),
      good.replacingOccurrences(of: "media.example.com", with: "user:pass@media.example.com"),
      good.replacingOccurrences(of: "Matinee", with: " "),
      good.padding(toLength: 513, withPad: " ", startingAt: 0),
    ] {
      #expect(readDiscoveryReply(Data(text.utf8)) == nil)
    }
    #expect(readDiscoveryReply(Data([0xff])) == nil)
    #expect(
      readDiscoveryReply(Data(good.utf8))
        == .init(name: "Matinee", url: "https://media.example.com"))
  }
  @Test func socketScanDeduplicatesAndCancels() async throws {
    let fd = socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP)
    defer { close(fd) }
    var address = sockaddr_in()
    address.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
    address.sin_family = sa_family_t(AF_INET)
    address.sin_addr.s_addr = inet_addr("127.0.0.1")
    let result = withUnsafeMutablePointer(to: &address) { pointer in
      pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) {
        bind(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
      }
    }
    #expect(result == 0)
    var size = socklen_t(MemoryLayout<sockaddr_in>.size)
    _ = withUnsafeMutablePointer(to: &address) { pointer in
      pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) { getsockname(fd, $0, &size) }
    }
    let port = UInt16(bigEndian: address.sin_port)
    let reply = good
    let responder = Task.detached {
      var sender = sockaddr_storage()
      var length = socklen_t(MemoryLayout<sockaddr_storage>.size)
      var bytes = [UInt8](repeating: 0, count: 1024)
      var timeout = timeval(tv_sec: 2, tv_usec: 0)
      _ = setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &timeout, socklen_t(MemoryLayout<timeval>.size))
      let count = withUnsafeMutablePointer(to: &sender) { p in
        p.withMemoryRebound(to: sockaddr.self, capacity: 1) {
          recvfrom(fd, &bytes, bytes.count, 0, $0, &length)
        }
      }
      #expect(count == 512)
      #expect(
        String(decoding: bytes.prefix(max(0, count)), as: UTF8.self)
          == "Matinee discovery v1".padding(toLength: 512, withPad: " ", startingAt: 0))
      for text in ["bad", reply, reply] {
        _ = withUnsafePointer(to: &sender) { p in
          p.withMemoryRebound(to: sockaddr.self, capacity: 1) {
            sendto(fd, Array(text.utf8), text.utf8.count, 0, $0, length)
          }
        }
      }
    }
    var found: [DiscoveredServer] = []
    for await server in discoverServers(
      timeoutMillis: 100, destinations: { [.init("127.0.0.1", port: port)] })
    { found.append(server) }
    await responder.value
    #expect(found.count == 1)
    let clock = ContinuousClock()
    let start = clock.now
    let stream = discoverServers(timeoutMillis: 10_000) { [.init("127.0.0.1", port: port)] }
    let task = Task { for await _ in stream {} }
    task.cancel()
    await task.value
    #expect(clock.now - start < .seconds(1))
  }
  @Test func errorsAndTimeouts() async {
    var count = 0
    for await _ in discoverServers(
      timeoutMillis: 20, destinations: { throw URLError(.notConnectedToInternet) })
    { count += 1 }
    for await _ in discoverServers(
      timeoutMillis: 20, destinations: { [.init("127.0.0.1", port: 9)] })
    { count += 1 }
    #expect(count == 0)
  }
  /// A scan is unavailable only when it tried to send and every send failed.
  @Test func unavailableOnlyWhenEverySendFailed() {
    #expect(probesFailed([-1]))
    #expect(probesFailed([-1, -1]))
    #expect(!probesFailed([512, -1]))
    #expect(!probesFailed([512]))
    // Nowhere to send, as with no network: an empty scan, not an unavailable one.
    #expect(!probesFailed([]))
  }
  @Test func scanThatSendsIsNotUnavailable() async {
    var events: [DiscoveryEvent] = []
    for await event in scanForServers(
      timeoutMillis: 20, destinations: { [.init("127.0.0.1", port: 9)] })
    { events.append(event) }
    #expect(!events.contains(.unavailable))
    // Nothing to send to at all is an empty scan too.
    for await event in scanForServers(timeoutMillis: 20, destinations: { [] }) { events.append(event) }
    for await event in scanForServers(
      timeoutMillis: 20, destinations: { [.init("not an address")] })
    { events.append(event) }
    #expect(events.isEmpty)
  }
}
