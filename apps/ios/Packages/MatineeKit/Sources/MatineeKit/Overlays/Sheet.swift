import SwiftUI

/// How tall a sheet opens.
public enum SheetSize: Sendable {
  /// As tall as its content, as the web's Drawer, up to most of the screen.
  case fitted
  /// Half the screen, dragged up to full: a long list.
  case mediumAndLarge
  /// Most of the screen.
  case large
}

extension View {
  /// A sheet from the bottom, as the web's Drawer and Android's `Sheet`:
  /// frosted glass, round at the top by `rounded-t-xl`, a hairline ring,
  /// the drawer's grip, and the web's backdrop behind it, the page's own
  /// background at 60% rather than the system's gray. The system's sheet
  /// does the dragging, the detents, the keyboard, and VoiceOver's escape;
  /// the kit draws the rest. Its `SheetItem`s close it, then run their
  /// action once it's gone.
  public func matineeSheet<Content: View>(
    isPresented: Binding<Bool>, size: SheetSize = .fitted, handle: Bool = true, onDismiss: (() -> Void)? = nil,
    @ViewBuilder content: @escaping () -> Content
  ) -> some View {
    modifier(SheetModifier(isPresented: isPresented, size: size, handle: handle, onDismiss: onDismiss, sheet: content))
  }

  /// The same, for an `item` to show: the sheet opens while it's set.
  public func matineeSheet<Item: Identifiable, Content: View>(
    item: Binding<Item?>, size: SheetSize = .fitted, handle: Bool = true, onDismiss: (() -> Void)? = nil,
    @ViewBuilder content: @escaping (Item) -> Content
  ) -> some View {
    let shown = Binding(get: { item.wrappedValue != nil }, set: { if !$0 { item.wrappedValue = nil } })
    return matineeSheet(isPresented: shown, size: size, handle: handle, onDismiss: onDismiss) {
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
  let handle: Bool
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
            SheetBody(size: size, handle: handle, content: sheet)
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

private struct SheetBody<Content: View>: View {
  let size: SheetSize
  let handle: Bool
  @ViewBuilder let content: () -> Content
  @Environment(\.palette) private var palette
  @State private var height: CGFloat = 320

  var body: some View {
    let top = UnevenRoundedRectangle(topLeadingRadius: Radius.xl, topTrailingRadius: Radius.xl, style: .circular)
    VStack(spacing: 0) {
      if handle {
        // The drawer's grip: `h-1 w-10 rounded-full bg-foreground/20`, 8 from the top.
        Capsule().fill(palette.foreground.opacity(0.2))
          .frame(width: 40, height: 4)
          .padding(.top, 8)
          .padding(.bottom, 4)
          .accessibilityHidden(true)
      }
      if size == .fitted {
        VStack(spacing: 0) { content() }
          .fixedSize(horizontal: false, vertical: true)
          .frame(maxWidth: .infinity)
      } else {
        VStack(spacing: 0) { content() }
          .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
      }
    }
    .padding(.bottom, size == .fitted ? Space.s2 : 0)
    .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height = $0 }
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

/// What a sheet is about, over a line: its title in `text-base
/// font-semibold`, and under it what it belongs to, muted.
public struct SheetHeader: View {
  let title: String
  let subtitle: String?
  @Environment(\.palette) private var palette

  public init(_ title: String, subtitle: String? = nil) {
    self.title = title
    self.subtitle = subtitle
  }

  public var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      VStack(alignment: .leading, spacing: 2) {
        Text(title).textStyle(.base, weight: .semibold).lineLimit(2).accessibilityAddTraits(.isHeader)
        if let subtitle {
          Text(subtitle).textStyle(.sm).foregroundStyle(palette.mutedForeground).lineLimit(1)
        }
      }
      .padding(.horizontal, 20)
      .padding(.vertical, 8)
      Separator().padding(.vertical, 6)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
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
      .padding(.horizontal, 20)
      .padding(.vertical, 12)
      .frame(minHeight: 48)
      .contentShape(Rectangle())
    }
    .buttonStyle(KitPressStyle(shape: Rectangle(), washColor: destructive ? palette.destructive : nil, ring: .inside))
    .accessibilityAddTraits(selected ? .isSelected : [])
  }
}
