import Foundation
import Testing
@testable import MatineeCore

private func availability(state: String = "none", action: String? = nil, id: String? = nil, disabled: String? = nil) -> Availability {
  Availability(state: state, action: action, progress: 0.4, etaSeconds: nil, releaseDate: "2027-08-14", stillLooking: false, reason: nil, askedBySelf: false, following: false, requestId: id, others: .init(count: 0, names: []), limit: nil, libraryTitleId: nil, disabledReason: disabled)
}
struct RequestsTests {
  @Test func statesAndActionsRemainServerDecisions() {
    #expect(availability(state: "asked").stateWord(today: "2026-01-01") == .asked)
    #expect(availability(state: "coming").stateWord(today: "2026-01-01") == .coming(nil))
    #expect(availability(state: "coming").stateWord(today: "2026-01-01", percent: true) == .coming(0.4))
    #expect(availability(state: "here").stateWord(today: "2026-01-01") == nil)
    #expect(availability(action: "add").adds)
    #expect(availability(action: "ask").asks)
    #expect(availability(action: "cancel").posterAction == nil)
    #expect(availability(action: "cancel", id: "r").posterAction == .cancel)
    #expect(availability(disabled: "limit").requestBlocked == .limitUntil(nil))
    #expect(availability(disabled: "off").hasPosterButton)
  }
  @Test func releaseDatesAndAnswers() {
    #expect(requestReleaseWord("2027-08-14", today: "2026-01-01") == .out("2027-08-14"))
    #expect(requestReleaseWord("2027-08-14", today: "2027-08-14") == .notOut)
    #expect(requestReleaseWord("invalid", today: "2026-01-01") == .notOut)
    var value = availability(state: "unavailable")
    value.reason = .init(kind: "notFound", code: nil, note: "  \n")
    #expect(value.declineAnswer == RequestAnswer(code: "notFound", note: nil))
  }
  @Test @MainActor func liveOverlayUsesLatestServerValue() async {
    let ref = CatalogRef(kind: "movie", provider: "tmdb", providerId: "1")
    let state = RequestAvailabilityState()
    await state.follow([CatalogInput(ref: ref, libraryId: nil)]) { _ in
      AsyncThrowingStream { continuation in
        continuation.yield([RequestsLiveEvent(ref: ref, availability: availability(state: "asked"), seasons: [])])
        continuation.yield([RequestsLiveEvent(ref: ref, availability: availability(state: "here"), seasons: [])])
        continuation.finish()
      }
    }
    #expect(state.availability(ref, fallback: availability()).state == "here")
    #expect(state.failure == nil)
  }
  @Test func noticesDiscardStaleButMarkThemRead() {
    let items = [Notification(id: "old", kind: "waiting", title: nil, season: nil, count: 1, createdAt: "2020-01-01T00:00:00Z", readAt: nil)]
    let changes = newRequestNotices(items, seen: [], now: Date())
    #expect(changes.show.isEmpty)
    #expect(changes.markRead == ["old"])
    #expect(newRequestNotices(items, seen: ["old"]).markRead.isEmpty)
    #expect(requestNoticeTarget(items[0]) == .queue("waiting"))
  }
}
