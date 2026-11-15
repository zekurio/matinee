@_spi(Gallery) import MatineeKit
import SwiftUI

/// A gallery page: a scrolling column under the kit's top bar.
struct GalleryPage<Content: View>: View {
  let title: String
  @ViewBuilder let content: () -> Content

  init(_ title: String, @ViewBuilder content: @escaping () -> Content) {
    self.title = title
    self.content = content
  }

  @Environment(GallerySettings.self) private var settings

  var body: some View {
    ScrollViewReader { reader in
      ScrollView {
        VStack(alignment: .leading, spacing: 32) { content() }
          .padding(.horizontal, Space.gutter)
          .padding(.top, 8)
          .padding(.bottom, 48)
          .frame(maxWidth: 720, alignment: .leading)
          .frame(maxWidth: .infinity)
      }
      .onAppear {
        if let target = settings.scroll {
          settings.scroll = nil
          DispatchQueue.main.async { reader.scrollTo(target, anchor: .top) }
        }
      }
    }
    .topBar(title)
  }
}

/// One component's demo: its name, a note, and the component.
struct Demo<Content: View>: View {
  let title: String
  let note: String?
  @ViewBuilder let content: () -> Content
  @Environment(\.palette) private var palette

  init(_ title: String, note: String? = nil, @ViewBuilder content: @escaping () -> Content) {
    self.title = title
    self.note = note
    self.content = content
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      VStack(alignment: .leading, spacing: 2) {
        Text(title).textStyle(.base, weight: .semibold, tracking: .tight)
        if let note { Text(note.replacingOccurrences(of: "`", with: "")).textStyle(.px13).foregroundStyle(palette.mutedForeground) }
      }
      content()
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .id(title)
  }
}

/// The states every control is shown in.
enum ShownState: String, CaseIterable, Identifiable {
  case normal = "Normal"
  case pressed = "Pressed"
  case focused = "Focused"
  case disabled = "Disabled"

  var id: String { rawValue }

  var forced: ForcedInteraction {
    switch self {
    case .pressed: .pressed
    case .focused: .focused
    default: .none
    }
  }
}

extension View {
  /// Pins this in `state`, as the gallery shows it.
  func shown(_ state: ShownState) -> some View {
    environment(\.forcedInteraction, state.forced).disabled(state == .disabled)
  }
}

/// A control side by side in each state, captioned.
struct StateStrip<Content: View>: View {
  var states = ShownState.allCases
  var spacing: CGFloat = 16
  @ViewBuilder let content: () -> Content
  @Environment(\.palette) private var palette

  var body: some View {
    ScrollView(.horizontal, showsIndicators: false) {
      HStack(alignment: .top, spacing: spacing) {
        ForEach(states) { state in
          VStack(alignment: .leading, spacing: 8) {
            content().shown(state)
            Caption(state.rawValue)
          }
        }
      }
      .padding(.vertical, 6)
      .padding(.horizontal, 6)
    }
    .padding(.horizontal, -6)
    .scrollClipDisabled()
  }
}

/// A control in a column of states, for wide ones.
struct StateColumn<Content: View>: View {
  var states = ShownState.allCases
  @ViewBuilder let content: (ShownState) -> Content

  var body: some View {
    VStack(alignment: .leading, spacing: 14) {
      ForEach(states) { state in
        VStack(alignment: .leading, spacing: 6) {
          Caption(state.rawValue)
          content(state).shown(state)
        }
      }
    }
  }
}

struct Caption: View {
  let text: String
  @Environment(\.palette) private var palette

  init(_ text: String) { self.text = text }

  var body: some View {
    Text(text).textStyle(.xs).foregroundStyle(palette.mutedForeground)
  }
}

/// Lays children in rows, wrapping, as the web's `flex-wrap`.
struct Flow: Layout {
  var spacing: CGFloat = 8
  var lineSpacing: CGFloat = 8

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    let width = proposal.width ?? .infinity
    var x: CGFloat = 0
    var y: CGFloat = 0
    var line: CGFloat = 0
    var widest: CGFloat = 0
    for view in subviews {
      let size = view.sizeThatFits(.unspecified)
      if x > 0, x + size.width > width {
        y += line + lineSpacing
        x = 0
        line = 0
      }
      x += size.width + spacing
      line = max(line, size.height)
      widest = max(widest, x - spacing)
    }
    return CGSize(width: min(widest, width), height: y + line)
  }

  func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
    var x = bounds.minX
    var y = bounds.minY
    var line: CGFloat = 0
    for view in subviews {
      let size = view.sizeThatFits(.unspecified)
      if x > bounds.minX, x + size.width > bounds.maxX {
        y += line + lineSpacing
        x = bounds.minX
        line = 0
      }
      view.place(at: CGPoint(x: x, y: y), proposal: .unspecified)
      x += size.width + spacing
      line = max(line, size.height)
    }
  }
}

/// A stand-in for a picture: the art tones, a gradient, as cards show while one loads.
struct FakeArt: View {
  var seed = 0
  @Environment(\.palette) private var palette

  var body: some View {
    LinearGradient(
      colors: [
        [Color(red: 0.95, green: 0.48, blue: 0.56), Color(red: 0.43, green: 0.55, blue: 0.96)],
        [Color(red: 1, green: 0.77, blue: 0.42), Color(red: 0.95, green: 0.48, blue: 0.56)],
        [Color(red: 0.2, green: 0.6, blue: 0.5), Color(red: 0.1, green: 0.2, blue: 0.35)],
      ][seed % 3], startPoint: .topLeading, endPoint: .bottomTrailing)
  }
}

