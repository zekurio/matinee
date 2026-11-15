import Foundation

/// Ask.kt: a dimmed request remains visible and a tap explains why. The
/// server alone decides whether quota/permission disables it; never infer
/// permission from a role or debit the quota locally after a submission.
public struct RequestPermission: Sendable, Equatable {
  public let blocked: RequestBlocked?
  public let answer: RequestAnswer?
  public let remaining: Int?
  public let resetsAt: Date?
  public init(_ availability: Availability) {
    blocked = availability.requestBlocked
    answer = availability.declineAnswer
    remaining = availability.limit?.left
    resetsAt = requestInstant(availability.limit?.resetsAt)
  }
  public var canRequest: Bool { blocked == nil }
}
extension RequestChooser {
  /// CatalogScreen.kt chooses the first server-selected destination. Android
  /// does not offer a local destination picker or guess when none is selected.
  public convenience init(detail: CatalogTitleDetail, availability: Availability? = nil, only: Int? = nil) {
    self.init(ref: detail.ref, seasons: requestSeasonsInOrder(detail.seasons),
      first: (availability ?? detail.availability).asks,
      defaultFuture: detail.defaultScope?.future ?? false,
      libraryId: detail.destinations.first(where: \.selected)?.id, only: only)
  }
  public func canSubmit(availability: Availability, busy: Bool) -> Bool {
    !busy && RequestPermission(availability).canRequest && label != .pickOne
  }
}
