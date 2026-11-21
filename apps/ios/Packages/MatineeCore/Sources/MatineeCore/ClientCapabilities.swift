import Foundation

/// Features a client can offer before constructing platform-specific services.
public enum ClientCapabilities {
  #if os(tvOS)
    public static let downloads = false
    public static let browserSignIn = false
    public static let offlineMode = false
    public static let adminPages = false
    public static let imageEditing = false
    public static let cameraLinking = false
    public static let pictureInPicture = false
    public static let sessionPlatform = "tvos"
    public static let clientName = "Matinee Apple TV"
  #else
    public static let downloads = true
    public static let browserSignIn = true
    public static let offlineMode = true
    public static let adminPages = true
    public static let imageEditing = true
    public static let cameraLinking = true
    public static let pictureInPicture = true
    public static let sessionPlatform = "ios"
    /// What the app calls itself in the server's sessions list, watching
    /// now, and client stats: a product name, the same in every language.
    public static let clientName = "Matinee iOS"
  #endif
}

public enum UnsupportedClientFeature: String, Error, LocalizedError {
  case downloads, browserSignIn, offlineMode
  public var errorDescription: String? { "\(rawValue) is not available on this device." }
}
