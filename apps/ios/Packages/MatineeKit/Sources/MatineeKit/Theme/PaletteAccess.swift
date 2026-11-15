import SwiftUI

extension EnvironmentValues {
  /// The kit's `palette` by a name of its own, for an app whose own
  /// environment has a `palette` too while its screens move onto the kit:
  /// Swift picks the app's for `\.palette` there, whatever type is asked
  /// for. Once the app's is gone, `\.palette` and this are the same.
  public var kitPalette: Palette {
    get { palette }
    set { palette = newValue }
  }
}
