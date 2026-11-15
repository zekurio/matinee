import SwiftUI

extension EnvironmentValues {
  /// The kit's palette under a second name, for a module that has an
  /// environment value of its own called `palette`, as the app's old theme
  /// does until the screens have all moved onto the kit.
  public var matineePalette: Palette {
    get { palette }
    set { palette = newValue }
  }
}
