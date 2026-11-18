import Foundation

public enum UserCode {
  public static func parse(_ text: String) -> String? {
    let text = text.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
    guard
      text.range(
        of: "^[BCDFGHJKLMNPQRSTVWXZ]{4}[\\s-]?[BCDFGHJKLMNPQRSTVWXZ]{4}$",
        options: .regularExpression) != nil
    else { return nil }
    let letters = text.filter { $0.isLetter }
    return String(letters.prefix(4)) + "-" + String(letters.suffix(4))
  }
}
public struct ScannedCode: Sendable, Equatable {
  public let userCode: String
  public let server: String?
  public init(userCode: String, server: String?) {
    self.userCode = userCode
    self.server = server
  }
}
public func scannedCode(_ text: String) -> ScannedCode? {
  if let code = UserCode.parse(text) { return .init(userCode: code, server: nil) }
  guard let c = URLComponents(string: text.trimmingCharacters(in: .whitespacesAndNewlines)),
    ["http", "https"].contains(c.scheme), c.url?.lastPathComponent == "link",
    let value = c.queryItems?.first(where: { $0.name == "code" })?.value,
    let code = UserCode.parse(value), let url = MatineeSession.serverCandidates(text).first
  else { return nil }
  return .init(userCode: code, server: String(url.absoluteString.dropLast()))
}
public struct DeviceCodes: Sendable {
  public let api: MatineeApi
  public init(api: MatineeApi) { self.api = api }
  public func start(name: String?, platform: String = ClientCapabilities.sessionPlatform) async throws -> DeviceCode {
    try await api.auth.device.start(appDevice: .init(name: name, platform: platform))
  }
  public func poll(
    _ code: DeviceCode,
    onError: @Sendable (any Error) async -> Void = { _ in }
  ) async throws -> AppSession {
    let clock = ContinuousClock()
    let deadline = clock.now.advanced(by: .seconds(code.expiresIn))
    while clock.now < deadline {
      try await Task.sleep(for: .seconds(max(1, code.interval)))
      do {
        if case .approved(let result) = try await api.auth.device.poll(deviceCode: code.deviceCode)
        {
          return .init(token: result.token, user: result.user)
        }
      } catch {
        try Task.checkCancellation()
        if let failure = error as? ApiException, failure.status == 404 { throw failure }
        // A dropped network must not discard a code approved while the browser
        // was in front. Keep polling the same grant until it expires.
        await onError(error)
      }
    }
    throw URLError(.timedOut)
  }
  public func get(userCode: String) async throws -> DeviceRequest {
    try await api.auth.device.get(userCode: userCode)
  }
  public func approve(userCode: String) async throws {
    try await api.auth.device.approve(userCode: userCode)
  }
}
