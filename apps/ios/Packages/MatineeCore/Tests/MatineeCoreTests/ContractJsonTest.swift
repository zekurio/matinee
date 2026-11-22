import Foundation
import Testing

@testable import MatineeCore

private func decode<T: Decodable>(_ type: T.Type, _ text: String) throws -> T {
  try JSONDecoder().decode(type, from: Data(text.utf8))
}
private func object<T: Encodable>(_ value: T) throws -> JSONValue {
  try JSONDecoder().decode(JSONValue.self, from: JSONEncoder().encode(value))
}

@Test func unionsReadByTheirTag() throws {
  #expect(try decode(DeviceSignIn.self, "{\"status\":\"pending\"}") == .pending(.init()))
  let user =
    #"{"id":"u","username":"ana","displayName":null,"role":"user","permissions":[],"avatarId":null,"avatarSource":"none","playback":null,"library":{"showSpecials":false},"sharing":{"favorites":false,"stats":false}}"#
  let result = try decode(
    DeviceSignIn.self, "{\"status\":\"approved\",\"token\":\"t\",\"user\":\(user)}")
  guard case .approved(let approved) = result else {
    Issue.record("Expected approved")
    return
  }
  #expect(approved.token == "t")
}
@Test func unknownUnionTagFails() {
  #expect(throws: DecodingError.self) { try decode(DeviceSignIn.self, "{\"status\":\"future\"}") }
}
@Test func unionsWriteTheirTag() throws {
  let spec = DownloadSpec(
    video: .encode(.init(codec: "h264", maxHeight: 720, bitrate: 4_000_000)),
    audio: [.copy(.init(index: 1))])
  #expect(
    try object(spec)
      == decode(
        JSONValue.self,
        #"{"video":{"mode":"encode","codec":"h264","maxHeight":720,"bitrate":4000000},"audio":[{"mode":"copy","index":1}]}"#
      ))
}
@Test func explicitTellsLeftOutFromNull() throws {
  #expect(try object(TitlesItemsInput()) == .object([:]))
  #expect(try object(TitlesItemsInput(season: .null)) == .object(["season": .null]))
  #expect(try object(TitlesItemsInput(season: .value(2))) == .object(["season": .integer(2)]))
  #expect(try decode(TitlesItemsInput.self, "{}").season == .omitted)
  #expect(try decode(TitlesItemsInput.self, #"{"season":null}"#).season == .null)
  #expect(try decode(TitlesItemsInput.self, #"{"season":2}"#).season == .value(2))
}
@Test func requiredNullIsSent() throws {
  #expect(try object(TitlesSetImageInput(imageId: nil)) == .object(["imageId": .null]))
}
@Test func unknownEnumValueReads() throws {
  #expect(try decode(ApiErrorBody.self, #"{"code":"FUTURE"}"#).code == "FUTURE")
  #expect(
    try decode(
      DownloadVideo.Encode.self, #"{"codec":"future-codec","maxHeight":720,"bitrate":4000000}"#
    ).codec == "future-codec")
}
@Test func int64Reads() throws {
  let item = try decode(
    MediaItem.self,
    #"{"id":"i","libraryId":"l","fileTitle":"Film","label":{"show":"movie","showName":"Film","showKey":"film","untitled":false,"group":"","groupLabel":[]},"relativePath":"Film.mkv","container":"mkv","mimeType":"video/x-matroska","sizeBytes":5000000000,"modifiedAt":"2026-01-01T00:00:00.000Z","durationSeconds":60,"favorite":false}"#
  )
  #expect(item.sizeBytes == 5_000_000_000)
  #expect(item.modifiedAt == "2026-01-01T00:00:00.000Z")
}
@Test func fallbackDoesNotInventServerLists() {
  #expect(FALLBACK_PLAYBACK_OPTIONS.qualities.isEmpty)
  #expect(FALLBACK_PLAYBACK_OPTIONS.downloadVideoPresets.isEmpty)
  #expect(FALLBACK_PLAYBACK_OPTIONS.skipSteps.isEmpty)
  #expect(!FALLBACK_PLAYBACK_OPTIONS.downloads)
  #expect(FALLBACK_PLAYBACK_OPTIONS.maxBitrate == nil)
}

private final class StubProtocol: URLProtocol, @unchecked Sendable {
  override class func canInit(with request: URLRequest) -> Bool { true }
  override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
  override func startLoading() {
    let failing = request.url!.path.contains("error")
    let malformed = request.url!.path.contains("malformed")
    let body =
      failing
      ? (malformed ? "not JSON" : #"{"code":"FORBIDDEN","message":"No access","status":999}"#)
      : "event: ignored\ndata: invalid\n\nevent: message\ndata: {\"status\":\"pending\"}\n\ndata: {\"status\":\"pending\"}\n\n"
    if request.value(forHTTPHeaderField: "Authorization") != "Bearer secret" {
      client?.urlProtocol(self, didFailWithError: URLError(.userAuthenticationRequired))
      return
    }
    client?.urlProtocol(
      self,
      didReceive: HTTPURLResponse(
        url: request.url!, statusCode: failing ? 403 : 200, httpVersion: nil,
        headerFields: ["Content-Type": failing ? "application/json" : "text/event-stream"])!,
      cacheStoragePolicy: .notAllowed)
    client?.urlProtocol(self, didLoad: Data(body.utf8))
    client?.urlProtocolDidFinishLoading(self)
  }
  override func stopLoading() {}
}
private func transport() -> ApiTransport {
  let config = URLSessionConfiguration.ephemeral
  config.protocolClasses = [StubProtocol.self]
  return ApiTransport(
    base: URL(string: "http://localhost/")!, configuration: config, tokenProvider: { "secret" })
}
@Test func errorsMapStatusCodeAndMessage() async throws {
  for (path, code, message) in [
    ("error", "FORBIDDEN", "No access"), ("error-malformed", nil, "The server answered 403."),
  ] {
    do {
      try await transport().send(method: "GET", path: [path], query: [], body: nil)
      Issue.record("Expected error")
    } catch let error as ApiException {
      #expect(error.status == 403)
      #expect(error.code == code)
      #expect(error.message == message)
    }
  }
}
@Test func sseParsesAndEndsWithoutReconnect() async throws {
  let stream: AsyncThrowingStream<DeviceSignIn, any Error> = transport().events(
    method: "GET", path: ["events"], query: [], body: nil)
  var values: [DeviceSignIn] = []
  for try await value in stream { values.append(value) }
  #expect(values == [.pending(.init()), .pending(.init())])
}
@Test func decoderLimitsAndLanguage() {
  let decoder = VideoDecoder(
    codec: "hevc", widest: .init(width: 4096, height: 2304),
    tallest: .init(width: 2304, height: 4096), tenBit: true)
  let profiles = profileDecoders(decoder, dolbyVision: false)
  #expect(profiles.count == 2)
  #expect(profiles[0].maxWidth == 4096)
  #expect(profiles[0].dolbyVisionProfiles?.contains(5) == false)
  #expect(profileLanguage(Locale(identifier: "de_AT")) == "de")
  #expect(profileLanguage(Locale(identifier: "en-US-u-fw-mon-mu-celsius")) == "en")
  #expect(profileLanguage(Locale(identifier: "pt-BR")) == "pt")
  #expect(profileLanguage(Locale(identifier: "")) == "en")
  let square = VideoDecoder(
    codec: "av1", widest: .init(width: 1920, height: 1920),
    tallest: .init(width: 1920, height: 1920), tenBit: false)
  #expect(profileDecoders(square, dolbyVision: true).count == 1)
  #expect(profileDecoders(square, dolbyVision: true)[0].dolbyVisionProfiles == [])
  let unlimited = profileDecoders(
    .init(codec: "vp9", widest: nil, tallest: nil, tenBit: false), dolbyVision: false)
  #expect(unlimited.count == 1)
  #expect(unlimited[0].maxWidth == nil)
  #expect(unlimited[0].maxBitDepth == 8)
}

@Test func pathsEncodeSegmentsAndQueries() {
  let paths = Paths(URL(string: "https://example.com/matinee/")!)
  #expect(
    paths.artwork("a/b?c", size: .thumb)
      == "https://example.com/matinee/api/artwork/a%2Fb%3Fc?size=thumb")
  #expect(paths.server("/api/source") == "https://example.com/api/source")
  #expect(paths.downloadSegment("d", segment: 2).hasSuffix("/api/downloads/d/2.m4s"))
  let url = URL(
    string: paths.authorize(
      redirectUri: "matinee://auth/callback", state: "a&b", codeChallenge: "c", deviceName: "  ",
      platform: "ios"))!
  let query = URLComponents(url: url, resolvingAgainstBaseURL: false)!.queryItems!
  #expect(query.first { $0.name == "state" }?.value == "a&b")
  #expect(!query.contains { $0.name == "device_name" })
}
