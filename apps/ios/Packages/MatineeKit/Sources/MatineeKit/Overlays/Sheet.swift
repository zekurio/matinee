import SwiftUI

/// How tall a sheet opens.
public enum SheetSize: Sendable {
  /// As tall as its content, as the web's Drawer, up to most of the screen;
  /// past that, its `SheetBody` scrolls.
  case fitted
  /// Half the screen, dragged up to full: a long list.
  case mediumAndLarge
  /// Most of the screen.
  case large
}

extension Space {
  /// How far a sheet's text sits from its sides, the web drawer's `px-5`
  /// and Android's `SheetPadding`: its header, its items, its body, and its footer.
  public static let sheet: CGFloat = 20
}

extension View {
  /// A sheet from the bottom, as the web's Drawer and Android's `Sheet`:
  /// frosted glass, round at the top by `rounded-t-xl`, a hairline ring,
  /// the drawer's grip, and the web's backdrop behind it, the page's own
  /// background at 60% rather than the system's gray. The system's sheet
  /// does the dragging, the detents, the keyboard, and VoiceOver's escape;
  /// the kit draws the rest. Its `SheetItem`s close it, then run their
  /// action once it's gone.
  ///
  /// The content is a column: a `SheetHeader`, then what may run longer
  /// than the screen in a `SheetBody`, which scrolls, then what must stay
  /// in reach, like the sheet's button, in a `SheetFooter`, which stays at
  /// the bottom above the keyboard however long the body is.
  public func matineeSheet<Content: View>(
    isPresented: Binding<Bool>, size: SheetSize = .fitted, onDismiss: (() -> Void)? = nil,
    @ViewBuilder content: @escaping () -> Content
  ) -> some View {
    modifier(SheetModifier(isPresented: isPresented, size: size, onDismiss: onDismiss, sheet: content))
  }

  /// The same, for an `item` to show: the sheet opens while it's set.
  public func matineeSheet<Item: Identifiable, Content: View>(
    item: Binding<Item?>, size: SheetSize = .fitted, onDismiss: (() -> Void)? = nil,
    @ViewBuilder content: @escaping (Item) -> Content
  ) -> some View {
    let shown = Binding(get: { item.wrappedValue != nil }, set: { if !$0 { item.wrappedValue = nil } })
    return matineeSheet(isPresented: shown, size: size, onDismiss: onDismiss) {
      if let value = item.wrappedValue { content(value) }
    }
  }
}

extension EnvironmentValues {
  /// Inside a kit sheet: closes it, then runs the action once it's gone.
  @Entry public var sheetDismiss = OverlayDismiss { action in action?() }
}

/// The sheet is the system's, presented from inside a clear kit overlay
/// that draws the web's backdrop under it: the overlay comes first, then
/// the sheet slides up over it; closing, the sheet goes down, then the
/// overlay fades. The system's own dimming is off, so a tap beside the
/// sheet lands on the backdrop, which closes it.
private struct SheetModifier<Sheet: View>: ViewModifier {
  @Binding var isPresented: Bool
  let size: SheetSize
  let onDismiss: (() -> Void)?
  @ViewBuilder let sheet: () -> Sheet
  @State private var covered = false
  @State private var shown = false
  @State private var after: [@MainActor () -> Void] = []
  @Environment(\.layoutDirection) private var direction
  @Environment(\.dynamicTypeSize) private var dynamicType
  @Environment(\.locale) private var locale

  func body(content: Content) -> some View {
    content
      .onChange(of: isPresented, initial: true) { _, present in
        if present {
          covered = true
        } else if shown {
          shown = false
        } else {
          covered = false
        }
      }
      .kitOverlay(isPresented: $covered, onDismiss: finish) { visible in
        Backdrop(visible: visible) { isPresented = false }
          .onAppear { shown = true }
          .sheet(isPresented: $shown, onDismiss: sheetGone) {
            SheetFrame(size: size, content: sheet)
              .environment(\.layoutDirection, direction)
              .environment(\.dynamicTypeSize, dynamicType)
              .environment(\.locale, locale)
              .environment(
                \.sheetDismiss,
                OverlayDismiss { action in
                  if let action { after.append(action) }
                  isPresented = false
                })
          }
      }
  }

  private func sheetGone() {
    if isPresented { isPresented = false }
    covered = false
  }

  private func finish() {
    onDismiss?()
    let actions = after
    after = []
    DispatchQueue.main.async { actions.forEach { $0() } }
  }
}

/// The sheet's surface and its column: the grip on every sheet, then the
/// content. The glass and its ring are the presentation's own background,
/// so they move with the sheet as it's dragged, and run down past the home
/// indicator to the screen's edge, while the content keeps to the safe area.
private struct SheetFrame<Content: View>: View {
  let size: SheetSize
  @ViewBuilder let content: () -> Content
  @Environment(\.palette) private var palette
  @State private var height: CGFloat = 320

  var body: some View {
    let top = UnevenRoundedRectangle(topLeadingRadius: Radius.xl, topTrailingRadius: Radius.xl, style: .circular)
    let column = VStack(spacing: 0) {
      // The drawer's grip: `h-1 w-10 rounded-full bg-foreground/20`, 8 from the top.
      Capsule().fill(palette.foreground.opacity(0.2))
        .frame(width: 40, height: 4)
        .padding(.top, 8)
        .padding(.bottom, 4)
        .accessibilityHidden(true)
      content()
    }
    .frame(maxWidth: .infinity)
    Group {
      if size == .fitted {
        // Reports the height the content takes with nothing scrolled, which
        // the detent becomes, and lays it out in the height the sheet has,
        // so a body that doesn't fit scrolls above the footer.
        FittedColumn { column }
          .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height = $0 }
      } else {
        column
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    .foregroundStyle(palette.foreground)
    .presentationDetents(detents)
    .presentationBackgroundInteraction(.enabled)
    .presentationDragIndicator(.hidden)
    .presentationCornerRadius(Radius.xl)
    .presentationBackground {
      Rectangle().fill(.clear)
        .glassBackground(in: top)
        .overlay { top.strokeBorder(palette.hairline) }
        .ignoresSafeArea()
    }
  }

  private var detents: Set<PresentationDetent> {
    switch size {
    case .fitted: [.height(height)]
    case .mediumAndLarge: [.medium, .large]
    case .large: [.large]
    }
  }
}

/// A fitted sheet's column. It says it's as tall as its content asks with
/// no height given, as a `ScrollView` is when it shows all it holds, and
/// that is what the detent takes. It lays the content out in no more than
/// the height it's offered, which the system caps at most of the screen
/// and above the keyboard, so there the body gives up height and scrolls
/// while the header and footer stay whole.
private struct FittedColumn: Layout {
  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    guard let content = subviews.first else { return .zero }
    let ideal = content.sizeThatFits(ProposedViewSize(width: proposal.width, height: nil))
    return CGSize(width: proposal.width ?? ideal.width, height: ideal.height)
  }

  func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
    guard let content = subviews.first else { return }
    let height = min(bounds.height, proposal.height ?? bounds.height)
    content.place(
      at: bounds.origin, anchor: .topLeading, proposal: ProposedViewSize(width: bounds.width, height: height))
  }
}

/// What a sheet is about, over a line: every sheet's title, so they all
/// start the same under the grip, as Android's `SheetHeader`. The title in
/// `text-base font-semibold`, and under it what it belongs to, muted.
/// `line: false` leaves the line out, for a sheet whose next part draws
/// its own, as a search field over a list.
public struct SheetHeader: View {
  let title: String
  let subtitle: String?
  let line: Bool
  @Environment(\.palette) private var palette

  public init(_ title: String, subtitle: String? = nil, line: Bool = true) {
    self.title = title
    self.subtitle = subtitle
    self.line = line
  }

  public var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      VStack(alignment: .leading, spacing: 2) {
        Text(title).textStyle(.base, weight: .semibold).lineLimit(2).accessibilityAddTraits(.isHeader)
        if let subtitle {
          Text(subtitle).textStyle(.sm).foregroundStyle(palette.mutedForeground).lineLimit(1)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.horizontal, Space.sheet)
      .padding(.vertical, Space.s2)
      if line { Separator().padding(.top, Space.s1_5) }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

/// The part of a sheet that scrolls once the sheet is taller than the
/// screen leaves room for, between a `SheetHeader` and a `SheetFooter`
/// that stay put, as Android's `SheetBody`. `sides`, `top`, and `bottom`
/// pad inside the scroll, so the padding scrolls with the rows; `spacing`
/// goes between them. A sheet of actions puts its header in here too, and
/// `bottom: Space.s2` under its items.
///
/// It's a `ScrollView`, so `.scrollPosition`, `.defaultScrollAnchor`, and
/// the other scroll modifiers reach it from outside.
public struct SheetBody<Content: View>: View {
  let sides: CGFloat
  let top: CGFloat
  let bottom: CGFloat
  let spacing: CGFloat
  @ViewBuilder let content: () -> Content

  public init(
    sides: CGFloat = 0, top: CGFloat = 0, bottom: CGFloat = 0, spacing: CGFloat = 0,
    @ViewBuilder content: @escaping () -> Content
  ) {
    self.sides = sides
    self.top = top
    self.bottom = bottom
    self.spacing = spacing
    self.content = content
  }

  public var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: spacing) { content() }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, sides)
        .padding(.top, top)
        .padding(.bottom, bottom)
    }
    // Still while it all fits, so a drag down moves the sheet.
    .scrollBounceBehavior(.basedOnSize)
    #if os(iOS)
      .scrollDismissesKeyboard(.interactively)
    #endif
  }
}

/// What stays at a sheet's bottom under its `SheetBody`, set off by a
/// line, as Android's `SheetFooter`: the sheet's button, and what goes
/// with it, `spacing` apart, `Space.sheet` from the sides and 12 above and
/// below. `line: false` leaves the line out, for a sheet with nothing
/// between its header's line and this.
public struct SheetFooter<Content: View>: View {
  let line: Bool
  let spacing: CGFloat
  @ViewBuilder let content: () -> Content

  public init(line: Bool = true, spacing: CGFloat = Space.s3, @ViewBuilder content: @escaping () -> Content) {
    self.line = line
    self.spacing = spacing
    self.content = content
  }

  public var body: some View {
    VStack(spacing: 0) {
      if line { Separator() }
      VStack(alignment: .leading, spacing: spacing) { content() }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, Space.sheet)
        .padding(.vertical, Space.s3)
    }
  }
}

/// A row in a sheet of actions: an icon and a label, `destructive` in the
/// danger color. A tap closes the sheet, then runs `action` once it's gone,
/// so a dialog or page it opens doesn't cut the sheet off.
public struct SheetItem: View {
  let icon: Lucide?
  let label: String
  let destructive: Bool
  let selected: Bool
  let action: @MainActor () -> Void
  @Environment(\.palette) private var palette
  @Environment(\.sheetDismiss) private var dismiss

  public init(
    _ label: String, icon: Lucide? = nil, destructive: Bool = false, selected: Bool = false,
    action: @escaping @MainActor () -> Void
  ) {
    self.icon = icon
    self.label = label
    self.destructive = destructive
    self.selected = selected
    self.action = action
  }

  public var body: some View {
    let color = destructive ? palette.destructive : palette.foreground
    Button {
      dismiss(then: action)
    } label: {
      HStack(spacing: 16) {
        if let icon { LucideIcon(icon, tint: destructive ? color : palette.mutedForeground) }
        Text(label).textStyle(.base).foregroundStyle(color).frame(maxWidth: .infinity, alignment: .leading)
        if selected { LucideIcon(.check, size: 18, tint: palette.accent) }
      }
      .padding(.horizontal, Space.sheet)
      .padding(.vertical, 12)
      .frame(minHeight: 48)
      .contentShape(Rectangle())
    }
    .buttonStyle(KitPressStyle(shape: Rectangle(), washColor: destructive ? palette.destructive : nil, ring: .inside))
    .accessibilityAddTraits(selected ? .isSelected : [])
  }
}
