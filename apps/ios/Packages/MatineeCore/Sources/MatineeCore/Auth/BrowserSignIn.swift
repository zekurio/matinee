import AuthenticationServices
import CryptoKit
import Foundation
import Security

public struct BrowserSignIn: Sendable {
  public static let REDIRECT_URI = "matinee://auth/callback"
  public let state: String
  public let verifier: String
  public var challenge: String { Self.challenge(verifier) }
  public static func challenge(_ verifier: String) -> String {
    base64URL(Data(SHA256.hash(data: Data(verifier.utf8))))
  }
  private static func base64URL(_ bytes: Data) -> String {
    bytes.base64EncodedString().replacingOccurrences(of: "+", with: "-")
      .replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
  }
  public static func create() throws -> BrowserSignIn {
    func random(_ count: Int) throws -> String {
      var bytes = [UInt8](repeating: 0, count: count)
      let status = SecRandomCopyBytes(kSecRandomDefault, count, &bytes)
      guard status == errSecSuccess else { throw KeychainError(status: status) }
      return base64URL(Data(bytes))
    }
    return try .init(state: random(24), verifier: random(64))
  }
  public static func isCallback(_ url: URL) -> Bool {
    url.scheme == "matinee" && url.host == "auth" && url.path == "/callback"
  }
}

@MainActor public protocol BrowserAuthenticator {
  func authenticate(url: URL) async throws -> URL
}

@MainActor public final class SystemBrowserAuthenticator: NSObject, BrowserAuthenticator {
  private let presentation: any ASWebAuthenticationPresentationContextProviding
  private var session: ASWebAuthenticationSession?
  public init(presentation: any ASWebAuthenticationPresentationContextProviding) {
    self.presentation = presentation
  }
  public func authenticate(url: URL) async throws -> URL {
    try await withTaskCancellationHandler {
      try await withCheckedThrowingContinuation { continuation in
        let session = ASWebAuthenticationSession(url: url, callbackURLScheme: "matinee") {
          url, error in
          if let url {
            continuation.resume(returning: url)
          } else {
            continuation.resume(throwing: error ?? URLError(.cancelled))
          }
        }
        session.presentationContextProvider = presentation
        // Share browser cookies so an existing passkey/OIDC sign-in carries over,
        // just as it does in Android's Custom Tab.
        session.prefersEphemeralWebBrowserSession = false
        self.session = session
        if !session.start() { continuation.resume(throwing: URLError(.cannotLoadFromNetwork)) }
      }
    } onCancel: {
      Task { @MainActor [weak self] in self?.session?.cancel() }
    }
  }
}
