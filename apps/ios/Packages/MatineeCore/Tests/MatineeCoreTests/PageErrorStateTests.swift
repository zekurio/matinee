import Foundation
import Testing
@testable import MatineeCore

struct PageErrorStateTests {
  @Test func httpResponsesHaveDistinctKindsButTheSameAndroidActions() {
    for (status, kind) in [(401, PageFailureKind.signedOut), (403, .forbidden), (404, .notFound), (500, .serverError), (503, .serverError), (400, .rejected), (429, .rejected)] {
      let state = PageErrorState(error: ApiException(status: status, code: nil, message: "Reason"))
      #expect(state?.kind == kind)
      #expect(state?.actions == [.retry, .home])
      #expect(state?.message == "Reason")
      #expect(state?.disconnected == false)
    }
  }
  @Test func networkParsingAndCancellation() {
    for code in [URLError.cannotFindHost, .cannotConnectToHost, .timedOut, .notConnectedToInternet] {
      let state = PageErrorState(error: URLError(code))
      #expect(state?.kind == .unreachable)
      #expect(state?.disconnected == true)
      #expect(state?.message == nil)
    }
    #expect(PageErrorState(error: URLError(.networkConnectionLost))?.kind == .connectionLost)
    #expect(PageErrorState(error: URLError(.cannotParseResponse))?.kind == .unreadable)
    #expect(PageErrorState(error: DecodingError.dataCorrupted(.init(codingPath: [], debugDescription: "private")))?.kind == .unreadable)
    #expect(PageErrorState(error: CancellationError()) == nil)
    #expect(PageErrorState(error: URLError(.cancelled)) == nil)
    struct Other: Error {}
    #expect(PageErrorState(error: Other())?.kind == .other)
  }
  @Test func actionsRespectWhereTheErrorAppears() {
    let error = URLError(.cannotConnectToHost)
    #expect(PageErrorState(error: error, fullPage: false)?.actions == [.retry])
    #expect(PageErrorState(error: error, aboveTabBar: true)?.actions == [.retry])
    #expect(PageErrorState(error: error, offline: true)?.actions == [.retry])
    #expect(PageErrorState(error: error, homeAvailable: false)?.actions == [.retry])
    #expect(PageErrorState(error: error, retryAvailable: false)?.actions == [.home])
    #expect(PageErrorState(error: error, retrying: true)?.retryEnabled == false)
    #expect(PageErrorState(error: error, fullPage: false, retryAvailable: false)?.actions == [])
  }
}
