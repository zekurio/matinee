import Foundation

public enum ArtworkSize: String, Sendable { case thumb, small, medium, large }
public struct Paths: Sendable {
  public let base: URL
  public init(_ base: URL) { self.base = base }
  private func url(_ parts: [String], query: [URLQueryItem] = []) -> String {
    var url = base
    for part in parts { url.append(component: part) }
    var components = URLComponents(url: url, resolvingAgainstBaseURL: false)!
    if !query.isEmpty { components.queryItems = query }
    return components.url!.absoluteString
  }
  public func artwork(_ id: String, size: ArtworkSize = .small) -> String {
    url(["api", "artwork", id], query: [.init(name: "size", value: size.rawValue)])
  }
  public func avatar(_ id: String) -> String { url(["api", "avatars", id]) }
  public func thumbnail(_ itemId: String, large: Bool = false) -> String {
    url(
      ["api", "media", itemId, "thumbnail"],
      query: [.init(name: "size", value: large ? "large" : "small")])
  }
  public func stream(_ itemId: String) -> String { url(["api", "media", itemId, "stream"]) }
  public func server(_ path: String) -> String {
    URL(string: path, relativeTo: base)?.absoluteURL.absoluteString ?? path
  }
  public func subtitle(_ itemId: String, trackId: String) -> String {
    url(["api", "media", itemId, "subtitles", trackId])
  }
  public func downloadInit(_ id: String) -> String { url(["api", "downloads", id, "init.mp4"]) }
  public func downloadSegment(_ id: String, segment: Int) -> String {
    url(["api", "downloads", id, "\(segment).m4s"])
  }
  public func trickplayTile(_ itemId: String, key: String, tile: Int) -> String {
    url(["api", "media", itemId, "trickplay", key, "\(tile).jpg"])
  }
  public func authorize(
    redirectUri: String, state: String, codeChallenge: String, deviceName: String?, platform: String
  ) -> String {
    var query = [
      URLQueryItem(name: "redirect_uri", value: redirectUri), .init(name: "state", value: state),
      .init(name: "code_challenge", value: codeChallenge),
      .init(name: "code_challenge_method", value: "S256"), .init(name: "platform", value: platform),
    ]
    if let deviceName, !deviceName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      query.append(.init(name: "device_name", value: deviceName))
    }
    return url(["authorize"], query: query)
  }
}
