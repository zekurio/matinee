#if os(tvOS)
  import SwiftUI

  /// An entry in the TV's drawer: an icon and a label, or, with no icon,
  /// the signed-in person's picture.
  public struct TVDrawerEntry: Identifiable, Hashable {
    public let id: String
    public let label: String
    public let icon: Lucide?

    public init(_ id: String, label: String, icon: Lucide?) {
      self.id = id
      self.label = label
      self.icon = icon
    }
  }

  /// Whether the drawer has focus, and a way into it other than Left, as
  /// Back on Home opens it on Android TV.
  @MainActor @Observable
  public final class TVDrawerState {
    public internal(set) var isOpen = false
    private(set) var opens = 0

    public init() {}

    /// Focus the current page's entry.
    public func open() { opens += 1 }
  }

  /// The TV's navigation, as Android TV's and Wholphin's: a rail of icons at
  /// the left edge that grows into a labelled drawer over the page, on a
  /// shade, while it has focus. The `selection`'s entry is marked. Left from
  /// a page's first column comes in, to the marked entry; Right leaves, and
  /// calls `onLeave`, for the page to put focus back where it was. The
  /// page puts focus where it starts itself, with `TVFocusMemory.restore`
  /// or a `defaultFocus`: otherwise the focus engine starts at the top left,
  /// in the drawer.
  ///
  /// Put it over the page, at the leading edge, filling the height. The
  /// page starts at `TVPage.start`, clear of the rail.
  ///
  ///     TVNavDrawer(top: profile, entries: entries, bottom: settings, selection: current, state: drawer) { entry in
  ///       navigate(entry.id)
  ///     } avatar: { Avatar(user.name, size: 64) { picture } }
  public struct TVNavDrawer<AvatarView: View>: View {
    let top: TVDrawerEntry?
    let entries: [TVDrawerEntry]
    let bottom: TVDrawerEntry?
    let selection: String
    let state: TVDrawerState?
    let onPick: (TVDrawerEntry) -> Void
    let onLeave: (() -> Void)?
    @ViewBuilder let avatar: () -> AvatarView
    @FocusState private var focused: String?
    @State private var opening = false
    @Environment(\.palette) private var palette
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    public init(
      top: TVDrawerEntry? = nil, entries: [TVDrawerEntry], bottom: TVDrawerEntry? = nil, selection: String,
      state: TVDrawerState? = nil, onLeave: (() -> Void)? = nil, onPick: @escaping (TVDrawerEntry) -> Void,
      @ViewBuilder avatar: @escaping () -> AvatarView
    ) {
      self.top = top
      self.entries = entries
      self.bottom = bottom
      self.selection = selection
      self.state = state
      self.onPick = onPick
      self.onLeave = onLeave
      self.avatar = avatar
    }

    public var body: some View {
      let open = focused != nil
      VStack(alignment: .leading, spacing: 12) {
        if let top {
          entry(top)
          Spacer().frame(height: 36)
        }
        ForEach(entries) { entry($0) }
        Spacer(minLength: 0)
        if let bottom { entry(bottom) }
      }
      .frame(width: open ? TVDrawerSize.expanded : TVDrawerSize.row, alignment: .leading)
      .padding(.leading, TVOverscan.railCenter - TVDrawerSize.row / 2)
      .padding(.vertical, TVOverscan.vertical)
      .frame(maxHeight: .infinity, alignment: .top)
      .background(alignment: .leading) {
        // Over the page, a shade the labels read on, deepest at the left.
        LinearGradient(
          stops: [
            .init(color: palette.background.opacity(0.98), location: 0),
            .init(color: palette.background.opacity(0.94), location: 0.25),
            .init(color: palette.background.opacity(0.7), location: 0.5),
            .init(color: palette.background.opacity(0.6), location: 1),
          ], startPoint: .leading, endPoint: .trailing
        )
        .frame(width: (TVOverscan.railCenter + TVDrawerSize.expanded + 96) * 4)
        .ignoresSafeArea()
        .opacity(open ? 1 : 0)
        .allowsHitTesting(false)
      }
      .focusSection()
      .background(TVLeftPresses())
      .onChange(of: focused) { old, entry in
        guard old == nil, let entry else { return }
        // Only Left, or `open()`, comes in. Focus the focus engine put here
        // by itself, as the first focus of a page at the top left, goes back.
        let asked = opening || Date.now.timeIntervalSince(TVLeftPresses.last) < 0.6
        opening = false
        if !asked, let onLeave {
          onLeave()
          return
        }
        // Coming in lands on the current page's entry, wherever it came from.
        let known = entries.contains { $0.id == selection } || top?.id == selection || bottom?.id == selection
        if entry != selection, known { focused = selection }
      }
      .onMoveCommand { direction in
        if direction == .right { onLeave?() }
      }
      .onChange(of: open) { _, open in state?.isOpen = open }
      .onChange(of: state?.opens) { _, _ in
        opening = true
        focused = selection
      }
      .animation(Motion.animation(open ? Motion.move : Motion.exit, reduceMotion: reduceMotion), value: open)
    }

    private func entry(_ entry: TVDrawerEntry) -> some View {
      TVControlButton(
        shape: Capsule(),
        rest: entry.id == selection && focused == nil ? palette.foreground.opacity(0.1) : .clear,
        content: entry.id == selection ? palette.accent : palette.foreground.opacity(focused == nil ? 0.45 : 0.85),
        scale: TVFocus.rowScale,
        action: { onPick(entry) }
      ) {
        DrawerFace(entry: entry, open: focused != nil, avatar: avatar)
      }
      .focused($focused, equals: entry.id)
      .accessibilityLabel(entry.label)
      .accessibilityAddTraits(entry.id == selection ? .isSelected : [])
    }
  }

  extension TVNavDrawer where AvatarView == EmptyView {
    public init(
      top: TVDrawerEntry? = nil, entries: [TVDrawerEntry], bottom: TVDrawerEntry? = nil, selection: String,
      state: TVDrawerState? = nil, onLeave: (() -> Void)? = nil, onPick: @escaping (TVDrawerEntry) -> Void
    ) {
      self.init(
        top: top, entries: entries, bottom: bottom, selection: selection, state: state, onLeave: onLeave, onPick: onPick
      ) { EmptyView() }
    }
  }

  /// The drawer's measures: Android TV's at two points a dp.
  public enum TVDrawerSize {
    /// A row's height, and the rail's width, so the mark behind the current page's icon is a circle.
    public static let row: CGFloat = 88
    /// The drawer's width while open.
    public static let expanded: CGFloat = 472
  }

  private struct DrawerFace<AvatarView: View>: View {
    let entry: TVDrawerEntry
    let open: Bool
    @ViewBuilder let avatar: () -> AvatarView
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
      HStack(spacing: 0) {
        Group {
          if let icon = entry.icon {
            LucideIcon(icon, size: 44, scales: false)
          } else {
            avatar().frame(width: 64, height: 64)
          }
        }
        .frame(width: TVDrawerSize.row, height: TVDrawerSize.row)
        if open {
          Text(entry.label).textStyle(.facts).lineLimit(1)
            .padding(.leading, 12)
            .padding(.trailing, 36)
            .transition(.opacity.animation(Motion.animation(Motion.easing(Motion.enterDuration, delay: 0.06), reduceMotion: reduceMotion)))
          Spacer(minLength: 0)
        }
      }
      .frame(height: TVDrawerSize.row)
    }
  }
#endif
