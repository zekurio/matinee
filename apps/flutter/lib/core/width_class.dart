/// How wide the window is, for the touch screens. A phone is compact, a
/// tablet in portrait or a foldable medium, a tablet in landscape
/// expanded. Tablets keep the phone's design and use the room: more
/// columns, more cards across, a rail instead of the bottom bar.
enum WidthClass {
  compact,
  medium,
  expanded;

  /// The class of a window [width] logical pixels wide. The breakpoints
  /// are Material's, the ones the Kotlin app's carousel used.
  static WidthClass of(double width) {
    if (width >= 840) return WidthClass.expanded;
    if (width >= 600) return WidthClass.medium;
    return WidthClass.compact;
  }

  bool get isCompact => this == WidthClass.compact;
}
