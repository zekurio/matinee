import Foundation

public enum PageFailureKind: Equatable, Sendable {
  case unreachable, connectionLost, signedOut, forbidden, notFound, serverError, rejected, unreadable, other
}
public enum PageErrorAction: Equatable, Sendable { case retry, home }

/// Errors.kt's presentation policy, without localized words or drawing.
/// HTTP categories preserve context for a screen; Android offers the same
/// retry/home actions for all server responses, not an automatic sign-in action.
public struct PageErrorState: Equatable, Sendable {
  public let kind: PageFailureKind
  public let actions: [PageErrorAction]
  public let retryEnabled: Bool
  public let message: String?
  public var disconnected: Bool { kind == .unreachable || kind == .connectionLost }

  /// Cancellation is not a visible error. Sections and sheets pass fullPage=false;
  /// tab roots pass aboveTabBar=true. The player passes homeAvailable=false.
  public init?(error: any Error, fullPage: Bool = true, aboveTabBar: Bool = false,
               offline: Bool = false, retryAvailable: Bool = true, retrying: Bool = false,
               homeAvailable: Bool = true) {
    let failure = Failure(error)
    if failure == .cancelled { return nil }
    if let api = error as? ApiException {
      switch api.status {
      case 401: kind = .signedOut
      case 403: kind = .forbidden
      case 404: kind = .notFound
      case 500...599: kind = .serverError
      default: kind = .rejected
      }
      message = api.message
    } else {
      switch failure {
      case .unreachable: kind = .unreachable
      case .connectionLost: kind = .connectionLost
      case .unreadable: kind = .unreadable
      default: kind = .other
      }
      // Network/parsing internals can include private server data. Screens
      // supply localized descriptions using the existing Failure helper.
      message = nil
    }
    var actions: [PageErrorAction] = retryAvailable ? [.retry] : []
    if fullPage && !aboveTabBar && !offline && homeAvailable { actions.append(.home) }
    self.actions = actions
    retryEnabled = retryAvailable && !retrying
  }
}
