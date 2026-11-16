import Foundation
import Testing
@testable import MatineeCore

private final class RequestsProtocol: URLProtocol, @unchecked Sendable {
  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
  override func startLoading() {
    client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: 403, httpVersion: nil, headerFields: ["Content-Type": "application/json"])!, cacheStoragePolicy: .notAllowed)
    client?.urlProtocol(self, didLoad: Data(#"{"code":"FORBIDDEN","message":"Requests are disabled"}"#.utf8))
    client?.urlProtocolDidFinishLoading(self)
  }
  override func stopLoading() {}
}
struct RequestApiTests {
  @Test func everyFetchAndMutationPropagatesServerPermissionFailure() async {
    let configuration = URLSessionConfiguration.ephemeral
    configuration.protocolClasses = [RequestsProtocol.self]
    let api = ContractApi(base: URL(string: "http://requests.test")!, configuration: configuration)
    let data = RequestData(api: api)
    let actions = RequestActions(api: api)
    let input = CatalogInput(ref: CatalogRef(kind: "show", provider: "tmdb", providerId: "1"), libraryId: "shows")
    let calls: [@Sendable () async throws -> Void] = [
      { _ = try await data.title(input) }, { _ = try await data.discover() },
      { _ = try await data.browseOptions(kind: "show") },
      { _ = try await data.search("Dune") }, { _ = try await data.gaps(titleId: "show") },
      { _ = try await data.mine() }, { _ = try await data.queue() },
      { _ = try await data.related(input) }, { _ = try await data.relatedTitles(input, rail: "similar") },
      { _ = try await actions.ask(input) }, { _ = try await actions.more(id: "r", scope: ShowScope(seasons: [1], future: false)) },
      { try await actions.cancel(id: "r") }, { try await actions.add(id: "r") },
      { try await actions.decline(id: "r", reason: "notForServer") },
    ]
    for call in calls {
      do { try await call(); Issue.record("Expected permission failure") }
      catch let error as ApiException {
        #expect(error.status == 403)
        #expect(error.message == "Requests are disabled")
      } catch { Issue.record("Unexpected error: \(error)") }
    }
  }
}
