import MatineeCore
import MatineeKit
import SwiftUI

/*
 * Controls.kt: the small marks cards and pages share. The controls
 * themselves, buttons, chips, switches, are the kit's.
 */

/// The round check on something watched, in the accent, as the web's
/// `WatchedBadge`: `size-5`, a bold check, a small shadow so it holds on
/// a light picture.
struct WatchedBadge: View {
  var size: CGFloat = 20
  @Environment(\.palette) private var palette

  var body: some View {
    LucideIcon(.checkBold, size: (size * 0.6).rounded(), tint: palette.accentForeground, scales: false)
      .frame(width: size, height: size)
      .background(palette.accent, in: Circle())
      .kitShadow(.small)
      .accessibilityElement()
      .accessibilityLabel(Str.mediaWatched)
      .accessibilityAddTraits(.isImage)
  }
}

/// How far into a file the person is, over its picture, as the web's cards
/// draw it: clear of the edges by `inset`, the accent on a dark track that
/// holds on a light picture as on a dark one. For a bar on the page itself,
/// use the kit's `ProgressBar`.
struct ArtProgressBar: View {
  let progress: Double
  var inset: CGFloat = Space.s2

  var body: some View {
    ProgressBar(progress, height: 4, track: .black.opacity(0.45))
      .padding([.horizontal, .bottom], inset)
      .frame(maxHeight: .infinity, alignment: .bottom)
      .accessibilityElement()
      .accessibilityLabel(Str.iosProgressWatched(Int((min(max(progress, 0), 1) * 100).rounded())))
  }
}

/// A rail's or a page section's heading, the web's `text-xl font-semibold
/// tracking-tight`, and with `action` a link to the whole list, with a
/// chevron after it. With `count`, how many titles it holds follows on its
/// baseline, `text-sm` muted, as the web's search and person pages have it.
struct SectionTitle: View {
  let title: String
  var count: Int?
  var action: (() -> Void)?
  @Environment(\.palette) private var palette

  init(_ title: String, count: Int? = nil, action: (() -> Void)? = nil) {
    self.title = title
    self.count = count
    self.action = action
  }

  var body: some View {
    if let action {
      Pressable(shape: RoundedRectangle.kit(Radius.sm), wash: false, action: action) {
        heading.frame(minHeight: TouchTarget)
      }
      .accessibilityAddTraits(.isHeader)
    } else {
      heading.accessibilityAddTraits(.isHeader)
    }
  }

  @ViewBuilder private var heading: some View {
    if let count {
      HStack(alignment: .firstTextBaseline, spacing: Space.s2) {
        Text(title)
          .textStyle(.xl, weight: .semibold, tracking: .tight)
          .foregroundStyle(palette.foreground)
        Text(Str.browseTitleCount(count)).textStyle(.sm).foregroundStyle(palette.mutedForeground)
      }
    } else {
      HStack(spacing: Space.s1) {
        Text(title)
          .textStyle(.xl, weight: .semibold, tracking: .tight)
          .lineLimit(1)
          .foregroundStyle(palette.foreground)
        if action != nil { LucideIcon(.chevronRight, size: 20, tint: palette.mutedForeground) }
      }
    }
  }
}

/// A tab's first page's name on an iPad, as the web's `PageHeader` from `sm`
/// up: `text-26px md:text-32px font-semibold tracking-tight`, with what the
/// page can do at its end.
struct PageHeading<Actions: View>: View {
  let title: String
  @ViewBuilder let actions: () -> Actions
  @Environment(\.palette) private var palette
  @Environment(\.gutter) private var gutter
  @Environment(\.windowSize) private var window

  init(_ title: String, @ViewBuilder actions: @escaping () -> Actions) {
    self.title = title
    self.actions = actions
  }

  var body: some View {
    HStack(alignment: .center, spacing: Space.s4) {
      Text(title)
        .textStyle(window.width >= 768 ? .px32 : .px26, weight: .semibold, tracking: .tight)
        .foregroundStyle(palette.foreground)
        .lineLimit(2)
        .accessibilityAddTraits(.isHeader)
      Spacer(minLength: 0)
      actions()
    }
    .padding(.horizontal, gutter)
    .padding(.top, Space.s4)
    .padding(.bottom, window.width >= 768 ? Space.s6 : Space.s4)
  }
}

extension PageHeading where Actions == EmptyView {
  init(_ title: String) { self.init(title) { EmptyView() } }
}

/// Someone's picture from the server, or their initials until it loads or
/// when they have none: the kit's `Avatar` with the picture filled in.
struct ProfileAvatar: View {
  let name: String
  let url: String?
  var size: CGFloat = 36
  var dot = false

  init(_ name: String, url: String?, size: CGFloat = 36, dot: Bool = false) {
    self.name = name
    self.url = url
    self.size = size
    self.dot = dot
  }

  var body: some View {
    Avatar(name, size: size, dot: dot) {
      Picture(url.flatMap { ImageSource($0) })
    }
  }
}
