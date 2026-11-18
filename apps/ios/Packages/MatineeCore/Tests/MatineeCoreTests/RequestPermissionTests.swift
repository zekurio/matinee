import Foundation
import Testing
@testable import MatineeCore
@MainActor struct RequestPermissionTests {
  @Test func quotaAndPermissionComeFromServer() {
    var value = RequestViewParityTests().value()
    value.limit = .init(left: 0, resetsAt: "2026-05-04T00:00:00Z")
    #expect(RequestPermission(value).canRequest)
    value.disabledReason = "limit"
    #expect(!RequestPermission(value).canRequest)
    #expect(RequestPermission(value).remaining == 0)
    #expect(RequestPermission(value).resetsAt == requestInstant("2026-05-04T00:00:00Z"))
    for reason in ["off", "noDestination", "declined"] {
      value.disabledReason = reason
      #expect(!RequestPermission(value).canRequest)
    }
  }
  @Test func selectedDestinationIsNotGuessedAndQuotaDisablesSubmit() throws {
    let value = RequestViewParityTests().value()
    var object: [String: Any] = [
      "ref": ["kind": "movie", "provider": "tmdb", "providerId": "1"],
      "name": "Film", "stale": false, "genres": [], "credits": [], "studios": [], "trailers": [], "seasons": [],
      "destinations": [["id": "a", "name": "A", "selected": false], ["id": "b", "name": "B", "selected": true]],
      "availability": try JSONSerialization.jsonObject(with: JSONEncoder().encode(value))]
    func detail() throws -> CatalogTitleDetail {
      try JSONDecoder().decode(CatalogTitleDetail.self, from: JSONSerialization.data(withJSONObject: object))
    }
    let chooser = RequestChooser(detail: try detail())
    #expect(chooser.libraryId == "b" && chooser.label == .title)
    #expect(chooser.canSubmit(availability: value, busy: false))
    #expect(!chooser.canSubmit(availability: value, busy: true))
    var limited = value; limited.disabledReason = "limit"
    #expect(!chooser.canSubmit(availability: limited, busy: false))
    object["destinations"] = [["id": "a", "name": "A", "selected": false]]
    #expect(try RequestChooser(detail: detail()).libraryId == nil)
  }
}
