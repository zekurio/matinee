/// iPhone and iPad screens have no display modes to pick: ProMotion follows
/// the frames on screen by itself, so there are no rates to offer.
final class DisplayBridge: DisplayApi {
  func refreshRates() throws -> [Double] { [] }

  func preferRefreshRate(rate: Double?) throws {}
}
