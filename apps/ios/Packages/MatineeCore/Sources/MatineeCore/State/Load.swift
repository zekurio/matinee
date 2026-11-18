import Foundation

/// Where a screen's data stands: on its way, there, or failed with words for the person.
public enum Load<T> {
  case loading
  case ready(T)
  /// `disconnected`: the server couldn't be reached, or the connection broke
  /// off, rather than it answering with an error.
  case failed(String, disconnected: Bool = false)

  public var value: T? {
    if case .ready(let value) = self { return value }
    return nil
  }

  public var isLoading: Bool {
    if case .loading = self { return true }
    return false
  }

  public var isFailed: Bool {
    if case .failed = self { return true }
    return false
  }
}

extension Load: Equatable where T: Equatable {}
extension Load: Sendable where T: Sendable {}

/// Fetch again on return after this long, when nothing asked for it sooner.
public let REFRESH_AFTER: Duration = .seconds(30)

/// Where a load stands after an answer or a failure.
public struct Settled<T> {
  public var state: Load<T>
  public var refreshError: String?
  public var refreshDisconnected: Bool = false

  public init(state: Load<T>, refreshError: String?, refreshDisconnected: Bool = false) {
    self.state = state
    self.refreshError = refreshError
    self.refreshDisconnected = refreshDisconnected
  }
}

extension Load {
  /// A fetch that failed with `message`, over what showed before it: an
  /// earlier answer stays on screen, marked stale, so a refresh that fails
  /// doesn't blank what the person saw. With nothing on screen yet and the
  /// server out of reach, the answer `kept` from an earlier run shows the
  /// same way.
  public func failedWith(
    _ message: String, disconnected: Bool = false, kept: (() -> T?)? = nil
  ) -> Settled<T> {
    if case .ready = self {
      return Settled(state: self, refreshError: message, refreshDisconnected: disconnected)
    }
    let saved = disconnected ? kept?() : nil
    if let saved {
      return Settled(state: .ready(saved), refreshError: message, refreshDisconnected: true)
    }
    return Settled(state: .failed(message, disconnected: disconnected), refreshError: nil)
  }
}

/// A load's last answer, kept on the phone for when the server can't be reached.
public protocol Kept<Value> {
  associatedtype Value
  /// The answer saved last, or nil with none.
  func read() -> Value?
  func write(_ value: Value)
}

/// What went wrong reaching the server, before it's put in words: the
/// app's `describeFailure` turns this into the person's language.
public enum Failure: Equatable, Sendable {
  /// The server answered with an error, and its own message.
  case server(String)
  /// The server couldn't be reached at all.
  case unreachable
  /// It was reached, and the connection broke off.
  case connectionLost
  /// The answer made no sense to this app.
  case unreadable
  /// Cancelled: a newer fetch or the screen going took over. Never shown.
  case cancelled
  /// Anything else, which isn't the network's doing; worded as a connection
  /// that broke off, as Android words it.
  case other

  public init(_ error: any Error) {
    switch error {
    case let error as ApiException: self = .server(error.message)
    case is DecodingError: self = .unreadable
    case is CancellationError: self = .cancelled
    case let error as URLError:
      switch error.code {
      case .cancelled: self = .cancelled
      case .cannotFindHost, .cannotConnectToHost, .dnsLookupFailed, .timedOut,
        .notConnectedToInternet, .internationalRoamingOff, .dataNotAllowed,
        .secureConnectionFailed, .serverCertificateUntrusted, .serverCertificateHasBadDate,
        .serverCertificateNotYetValid, .serverCertificateHasUnknownRoot,
        .clientCertificateRejected, .appTransportSecurityRequiresSecureConnection:
        self = .unreachable
      case .cannotDecodeContentData, .cannotDecodeRawData, .cannotParseResponse,
        .badServerResponse:
        self = .unreadable
      default: self = .connectionLost
      }
    default: self = .other
    }
  }

  /// Whether the server couldn't be reached or the connection broke off,
  /// not that it answered with an error or with something unreadable.
  public var isDisconnect: Bool { self == .unreachable || self == .connectionLost }
}

/// Whether `error` means the server couldn't be reached or the connection broke off.
public func isDisconnect(_ error: any Error) -> Bool { Failure(error).isDisconnect }
