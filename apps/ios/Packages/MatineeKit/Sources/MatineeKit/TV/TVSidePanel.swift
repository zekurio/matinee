#if os(tvOS)
  import SwiftUI

  /// The size of every right-edge panel on a TV, the player's too.
  public enum TVPanels {
    /// Android TV's 380 dp.
    public static let width: CGFloat = 760
    /// Between the panel's edges and its rows.
    public static let listPadding: CGFloat = 48
    /// Where the panel's title starts, in line with its rows' text.
    public static let textStart: CGFloat = listPadding + TVListItems.inset
  }

  extension View {
    /// The panel at the right edge of a TV screen, for a choice or a
    /// question, in place of the phone's sheets and menus: a card's
    /// actions, a sort, a setting, the player's menus. While `isPresented`
    /// it slides in over the dimmed screen with `title` and `description`
    /// at its top and `content` under them, usually quiet `TVListItem`s.
    /// Focus starts on the first row, or where `content` puts a
    /// `defaultFocus`, and stays in the panel; Menu closes it, and focus
    /// goes back to what opened it. While `loading`, a spinner in place of
    /// the rows. Inside, `@Environment(\.overlayDismiss)` closes it, then
    /// runs what it's given.
    public func tvSidePanel<Content: View>(
      isPresented: Binding<Bool>, title: String?, description: String? = nil, loading: Bool = false,
      onDismiss: (() -> Void)? = nil, @ViewBuilder content: @escaping () -> Content
    ) -> some View {
      kitOverlay(isPresented: isPresented, onDismiss: onDismiss) { visible in
        TVSidePanelLayer(
          visible: visible, title: title, description: description, loading: loading,
          close: { isPresented.wrappedValue = false }, content: content)
      }
    }

    /// The same, for an `item`: the panel shows while it's set, and keeps
    /// showing the last one as it slides away.
    public func tvSidePanel<Item: Identifiable, Content: View>(
      item: Binding<Item?>, title: @escaping (Item) -> String?, description: @escaping (Item) -> String? = { _ in nil },
      onDismiss: (() -> Void)? = nil, @ViewBuilder content: @escaping (Item) -> Content
    ) -> some View {
      modifier(ItemPanel(item: item, title: title, description: description, onDismiss: onDismiss, content: content))
    }
  }

  /// Keeps the item a panel opened for through its slide away, after the binding is cleared.
  private struct ItemPanel<Item: Identifiable, Panel: View>: ViewModifier {
    @Binding var item: Item?
    let title: (Item) -> String?
    let description: (Item) -> String?
    let onDismiss: (() -> Void)?
    @ViewBuilder let content: (Item) -> Panel
    @State private var last: Item?

    func body(content view: Content) -> some View {
      let shown = Binding(get: { item != nil }, set: { if !$0 { item = nil } })
      view
        .onChange(of: item?.id, initial: true) { _, _ in if let item { last = item } }
        .tvSidePanel(
          isPresented: shown, title: last.flatMap(title), description: last.flatMap(description), onDismiss: onDismiss
        ) {
          if let last { content(last) }
        }
    }
  }

  private struct TVSidePanelLayer<Content: View>: View {
    let visible: Bool
    let title: String?
    let description: String?
    let loading: Bool
    let close: () -> Void
    @ViewBuilder let content: () -> Content
    @Environment(\.palette) private var palette

    var body: some View {
      ZStack(alignment: .trailing) {
        LinearGradient(colors: [.black.opacity(0.35), .black.opacity(0.85)], startPoint: .leading, endPoint: .trailing)
          .ignoresSafeArea()
          .opacity(visible ? 1 : 0)
          .accessibilityHidden(true)
        VStack(alignment: .leading, spacing: 0) {
          if let title {
            Text(title).textStyle(.headline).lineLimit(2)
              .padding(.horizontal, TVPanels.textStart)
              .accessibilityAddTraits(.isHeader)
          }
          if let description {
            Text(description).textStyle(.body).foregroundStyle(palette.mutedForeground).lineLimit(3)
              .padding(.horizontal, TVPanels.textStart)
              .padding(.top, 12)
          }
          if loading {
            Spinner(size: 56, tint: palette.mutedForeground)
              .frame(maxWidth: .infinity)
              .padding(.top, 80)
            Spacer(minLength: 0)
          } else {
            ScrollView {
              VStack(spacing: TVListItems.gap) { content() }
                .padding(.horizontal, TVPanels.listPadding)
                .padding(.top, 40)
                .padding(.bottom, TVOverscan.vertical + 32)
            }
            .scrollIndicators(.hidden)
            // Rows scrolled up go under the title, fading out over the room above the first row.
            .mask {
              VStack(spacing: 0) {
                LinearGradient(colors: [.clear, .black], startPoint: .top, endPoint: .bottom).frame(height: 40)
                Color.black
              }
            }
          }
        }
        .foregroundStyle(palette.foreground)
        .padding(.top, TVOverscan.vertical + 32)
        .frame(width: TVPanels.width, alignment: .topLeading)
        .frame(maxHeight: .infinity, alignment: .top)
        .background(palette.popover.ignoresSafeArea())
        .clipped()
        .compositingGroup()
        .shadow(color: .black.opacity(visible ? 0.4 : 0), radius: 40)
        // It slides in from the edge, its last stretch on screen and fully
        // drawn from the start, since the focus engine gives the first
        // focus only to what it can see as the panel opens.
        .offset(x: visible ? 0 : 160)
        .focusSection()
      }
      .ignoresSafeArea()
      .closesOnExit(close)
    }
  }

  /// A choice in a `tvOptionsPanel`: `detail` at its end, like a count.
  public struct TVOption<Value: Hashable>: Identifiable {
    public let value: Value
    public let label: String
    public let detail: String?

    public var id: Value { value }

    public init(_ value: Value, _ label: String, detail: String? = nil) {
      self.value = value
      self.label = label
      self.detail = detail
    }
  }

  extension View {
    /// A `tvSidePanel` to pick one of `options`, as a sort, a filter, or a
    /// setting, focus starting on the one `selection` holds, which is
    /// checked. Picking one closes the panel, then sets `selection`.
    public func tvOptionsPanel<Value: Hashable>(
      isPresented: Binding<Bool>, title: String, description: String? = nil, selection: Binding<Value>,
      options: [TVOption<Value>], loading: Bool = false
    ) -> some View {
      tvSidePanel(isPresented: isPresented, title: title, description: description, loading: loading) {
        OptionRows(selection: selection, options: options)
      }
    }
  }

  private struct OptionRows<Value: Hashable>: View {
    @Binding var selection: Value
    let options: [TVOption<Value>]
    @FocusState private var focused: Value?
    @Environment(\.overlayDismiss) private var dismiss

    var body: some View {
      ForEach(options) { option in
        TVListItem(
          option.label, quiet: true, checked: option.value == selection,
          action: {
            let value = option.value
            dismiss { if selection != value { selection = value } }
          }
        ) {
          if let detail = option.detail { TVListValue(detail, chevron: false) }
        }
        .focused($focused, equals: option.value)
        .accessibilityAddTraits(option.value == selection ? .isSelected : [])
      }
      .defaultFocus($focused, selection)
    }
  }

  /// An entry in a `tvActionsPanel`: an icon and a label, `destructive` in
  /// the danger color. Choosing it closes the panel, then runs `action`.
  public struct TVAction: Identifiable {
    public let id: String
    public let label: String
    public let icon: Lucide?
    public let destructive: Bool
    public let action: @MainActor () -> Void

    public init(
      _ label: String, icon: Lucide? = nil, destructive: Bool = false, id: String? = nil,
      action: @escaping @MainActor () -> Void
    ) {
      self.id = id ?? label
      self.label = label
      self.icon = icon
      self.destructive = destructive
      self.action = action
    }
  }

  extension View {
    /// A `tvSidePanel` of `actions` for something, as a card's long press
    /// opens on Apple TV in place of the phone's actions sheet: its name as
    /// the title, `subtitle` under it, focus on the first action.
    public func tvActionsPanel(
      isPresented: Binding<Bool>, title: String, subtitle: String? = nil, actions: [TVAction]
    ) -> some View {
      tvSidePanel(isPresented: isPresented, title: title, description: subtitle) {
        ActionRows(actions: actions)
      }
    }

    /// The same, for an `item`: the panel shows while it's set, with the
    /// actions `actions` gives for it.
    public func tvActionsPanel<Item: Identifiable>(
      item: Binding<Item?>, title: @escaping (Item) -> String, subtitle: @escaping (Item) -> String? = { _ in nil },
      actions: @escaping (Item) -> [TVAction]
    ) -> some View {
      tvSidePanel(item: item, title: title, description: subtitle) { item in
        ActionRows(actions: actions(item))
      }
    }
  }

  private struct ActionRows: View {
    let actions: [TVAction]
    @FocusState private var focused: String?
    @Environment(\.overlayDismiss) private var dismiss

    var body: some View {
      ForEach(actions) { entry in
        TVListItem(entry.label, icon: entry.icon, quiet: true, destructive: entry.destructive) {
          dismiss(then: entry.action)
        }
        .focused($focused, equals: entry.id)
      }
      .defaultFocus($focused, actions.first?.id)
    }
  }
#endif
