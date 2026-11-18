import Foundation
import Testing
@testable import MatineeCore
private final class PersonCreditsProtocol: URLProtocol, @unchecked Sendable {
  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
  override func startLoading() {
    #expect(request.httpMethod == "GET")
    let query = URLComponents(url: request.url!, resolvingAgainstBaseURL: false)!.queryItems!
    #expect(request.url!.lastPathComponent == "A Person")
    #expect(query.contains(URLQueryItem(name: "tmdbId", value: "42")))
    client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!, cacheStoragePolicy: .notAllowed)
    client?.urlProtocol(self, didLoad: Data(#"{"name":"A Person","kind":"actor","titleCount":0,"credits":[],"catalog":[],"stale":false}"#.utf8))
    client?.urlProtocolDidFinishLoading(self)
  }
  override func stopLoading() {}
}
struct PersonRequestCreditsTests {
  @Test func readsCatalogCreditsFromPersonEndpoint() async throws {
    let config = URLSessionConfiguration.ephemeral
    config.protocolClasses = [PersonCreditsProtocol.self]
    let data = RequestData(api: ContractApi(base: URL(string: "http://requests.test")!, configuration: config))
    #expect(try await data.personCredits(name: "A Person", tmdbId: "42").isEmpty)
  }
}
