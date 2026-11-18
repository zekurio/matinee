import Testing
@testable import MatineeCore

@Suite struct ClientCapabilitiesTests {
  @Test func platformFeatures() {
    #if os(tvOS)
    #expect(!ClientCapabilities.downloads)
    #expect(!ClientCapabilities.browserSignIn)
    #expect(!ClientCapabilities.offlineMode)
    #expect(ClientCapabilities.sessionPlatform == "tvos")
    #else
    #expect(ClientCapabilities.downloads)
    #expect(ClientCapabilities.browserSignIn)
    #expect(ClientCapabilities.offlineMode)
    #expect(ClientCapabilities.sessionPlatform == "ios")
    #endif
  }
}
