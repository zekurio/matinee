import Foundation
import Testing
@testable import MatineeCore

struct LiveRequestsTests {
  @Test(.enabled(if: ProcessInfo.processInfo.environment["MATINEE_LIVE_REQUESTS_TOKEN"] != nil))
  func reads() async throws {
    let token = ProcessInfo.processInfo.environment["MATINEE_LIVE_REQUESTS_TOKEN"]!
    let data = RequestData(api: ContractApi(base: URL(string: "http://localhost:18420")!, tokenProvider: { token }))
    let mine = try await data.mine()
    let queue = try await data.queue()
    print("LIVE requests mine: \(try JSONEncoder().encode(mine).count) bytes; queue: \(try JSONEncoder().encode(queue).count) bytes")
    do {
      let rails = try await data.discover()
      print("LIVE discover: \(String(decoding: try JSONEncoder().encode(rails), as: UTF8.self))")
      let search = try await data.search("Dune")
      print("LIVE catalog search: \(search.items.count) results")
    } catch {
      print("LIVE metadata calls failed: \(error)")
      throw error
    }
  }
}
