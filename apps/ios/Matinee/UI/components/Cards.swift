import MatineeCore
import SwiftUI

/*
 * Cards.kt: the cards rails and grids are made of, their art and captions,
 * and the rails and grid themselves. A card opens its page through the
 * environment's `Navigator`, and a long press offers its context menu
 * through `.cardMenu` (Actions.swift).
 */

/// The window's size, which rails and grids size their cards by. The root
/// measures it with `.measuresWindow()`.
extension EnvironmentValues {
  @Entry var windowSize = CGSize(width: 390, height: 844)
}

extension View {
  /// Puts the size of the space this view fills, the whole window on the
  /// root, in the environment as `windowSize`.
  func measuresWindow() -> some View { modifier(MeasuresWindow()) }
}

private struct MeasuresWindow: ViewModifier {
  @State private var size = CGSize(width: 390, height: 844)

  func body(content: Content) -> some View {
    content
      .environment(\.windowSize, size)
      .onGeometryChange(for: CGSize.self) { proxy in
        CGSize(
          width: proxy.size.width + proxy.safeAreaInsets.leading + proxy.safeAreaInsets.trailing,
          height: proxy.size.height + proxy.safeAreaInsets.top + proxy.safeAreaInsets.bottom)
      } action: { size = $0 }
  }
}

/// True on iPads and wide windows, which get the web's fixed card sizes.
func isWide(_ window: CGSize) -> Bool { window.width >= 600 }

enum RailArt {
  case landscape, poster, person

  var aspect: CGFloat {
    switch self {
    case .landscape: 16 / 9
    case .poster: 2 / 3
    case .person: 1
    }
  }

  /// How wide a card is in a rail: a share of a phone's width, so the next
  /// card peeks in, and the web's fixed sizes on bigger screens. Stills are
  /// narrower than the web's on phones, so two rails fit under Home's banner.
  func width(in window: CGSize) -> CGFloat {
    if isWide(window) {
      switch self {
      case .landscape: return 300
      case .poster: return 176
      case .person: return 116
      }
    }
    let inner = window.width - 2 * Gutter
    switch self {
    case .landscape: return min(inner * 0.66, window.height * 0.34 * 16 / 9)
    case .poster: return inner * 0.44
    case .person: return inner * 0.28
    }
  }
}

/// A titled row of cards that scrolls sideways past the page's edge. Give
/// each card its width with `.frame(width: art.width(in: windowSize))`, or
/// use `RailItem`.
struct Rail<Content: View>: View {
  let title: String
  var onTitleTap: (() -> Void)?
  @ViewBuilder let content: () -> Content

  init(_ title: String, onTitleTap: (() -> Void)? = nil, @ViewBuilder content: @escaping () -> Content) {
    self.title = title
    self.onTitleTap = onTitleTap
    self.content = content
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      SectionTitle(title, action: onTitleTap).padding(.horizontal, Gutter)
      ScrollView(.horizontal) {
        LazyHStack(alignment: .top, spacing: 12) { content() }
          .scrollTargetLayout()
      }
      .contentMargins(.horizontal, Gutter, for: .scrollContent)
      .scrollIndicators(.hidden)
      .scrollTargetBehavior(.viewAligned)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}

/// A card in a rail, as wide as `art` cards are there.
struct RailItem<Content: View>: View {
  let art: RailArt
  @ViewBuilder let content: () -> Content
  @Environment(\.windowSize) private var window

  init(_ art: RailArt, @ViewBuilder content: @escaping () -> Content) {
    self.art = art
    self.content = content
  }

  var body: some View { content().frame(width: art.width(in: window)) }
}

/// Posters in as many columns as fit, two on a phone and more on an iPad,
/// as Android's `PosterGrid` lays them out. Its content goes in a lazy grid,
/// so a long list only builds what shows.
struct CardGrid<Content: View>: View {
  var minimum: CGFloat = 150
  @ViewBuilder let content: () -> Content

  init(minimum: CGFloat = 150, @ViewBuilder content: @escaping () -> Content) {
    self.minimum = minimum
    self.content = content
  }

  var body: some View {
    LazyVGrid(
      columns: [GridItem(.adaptive(minimum: minimum), spacing: 16, alignment: .top)], alignment: .leading,
      spacing: 20, content: content
    )
    .padding(.horizontal, Gutter)
  }
}

/// The 2:3 or 16:9 frame art sits in, on its tone, with a border.
struct ArtFrame<Content: View>: View {
  let toneKey: String
  let aspect: CGFloat
  @ViewBuilder let content: () -> Content
  @Environment(\.palette) private var palette

  init(_ toneKey: String, aspect: CGFloat, @ViewBuilder content: @escaping () -> Content) {
    self.toneKey = toneKey
    self.aspect = aspect
    self.content = content
  }

  var body: some View {
    Tone(toneKey)
      .aspectRatio(aspect, contentMode: .fit)
      .frame(maxWidth: .infinity)
      .overlay { ZStack { content() } }
      .clipShape(CardShape)
      .overlay { CardShape.strokeBorder(palette.border) }
  }
}

/// Play in the middle of a still: a frosted circle.
struct PlayGlyph: View {
  let label: String
  var size: CGFloat = 56
  let action: () -> Void

  var body: some View {
    RoundIconButton(
      .play, label: label, size: size, iconSize: size * 0.38, tint: .white, background: .black.opacity(0.35),
      action: action)
  }
}

/// Play over a card's still while a pointer hovers it, as the web shows it
/// on a desktop: an iPad with a trackpad. A touch has no hover, so cards
/// stay clean; a tap opens the item, and its page has Play.
private struct HoverPlay: ViewModifier {
  let label: String
  let action: () -> Void
  @State private var hovered = false

  func body(content: Content) -> some View {
    content
      .overlay {
        if hovered { PlayGlyph(label: label, action: action).transition(Motion.fade) }
      }
      .onHover { hovered = $0 }
  }
}

/// Name and detail under a card, one line each.
struct CardText: View {
  let primary: String
  let secondary: String?
  var untitled = false
  @Environment(\.palette) private var palette

  init(_ primary: String, _ secondary: String?, untitled: Bool = false) {
    self.primary = primary
    self.secondary = secondary
    self.untitled = untitled
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      Text(primary).textStyle(.bodyMedium, weight: untitled ? .regular : .medium).lineLimit(1)
        .foregroundStyle(palette.foreground)
      if let secondary {
        Text(secondary).textStyle(.bodySmall).foregroundStyle(palette.muted).lineLimit(1)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.top, 8)
  }
}

/// A card's press: it dims a little under the finger, as a list row does.
struct CardPress: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .opacity(configuration.isPressed ? 0.7 : 1)
      .motion(Motion.color, value: configuration.isPressed)
  }
}

/// A card's tap and long press. Offline, a card's page and actions are the
/// server's, so it only shows.
private struct CardButton<Label: View>: View {
  let target: ActionTarget
  let action: () -> Void
  @ViewBuilder let label: () -> Label
  @Environment(\.offline) private var offline

  var body: some View {
    Button(action: action) { label().contentShape(Rectangle()) }
      .buttonStyle(CardPress())
      .disabled(offline)
      .cardMenu(target)
  }
}

/// An episode or movie to start or resume, for Continue watching and Next
/// up. The picture is the episode, the show leads the text, and the episode
/// follows. The card opens the episode's page, a long press offers the
/// rest. Without `showName`, as in a season's row, the episode leads and
/// its number and length follow.
struct EpisodeCard: View {
  let item: MediaItem
  var showName = true

  @Environment(\.api) private var api
  @Environment(\.navigator) private var nav
  @Environment(\.offline) private var offline
  @Environment(ViewerState.self) private var viewer: ViewerState?
  @Environment(\.palette) private var palette

  init(_ item: MediaItem, showName: Bool = true) {
    self.item = item
    self.showName = showName
  }

  var body: some View {
    let label = itemLabel(item)
    let code = episodeCode(item)
    let watched = viewer?.isWatched(item) ?? (item.progress?.completed ?? false)
    let ratio = progressRatio(item)
    let left = item.progress?.completed == false ? timeLeft(item) : nil
    let name = code.map { Str.mediaShowCodeTitle(label.showName, $0, label.title) } ?? label.title
    CardButton(target: .item(item, here: false), action: { nav.item(item) }) {
      VStack(alignment: .leading, spacing: 0) {
        ArtFrame(label.showName, aspect: 16 / 9) {
          LucideIcon(.film, size: 20, tint: palette.muted.opacity(0.4))
          Picture(api?.landscape(item) ?? [])
          if watched {
            WatchedBadge().padding(6).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
          } else if let ratio, ratio > 0 {
            ProgressBar(progress: ratio).frame(maxHeight: .infinity, alignment: .bottom)
          }
        }
        .modifier(
          HoverPlay(label: left != nil ? Str.mediaResumeNamed(name) : Str.mediaPlayNamed(name)) {
            nav.play(item.id, nil)
          })
        if showName {
          let detail =
            code.map { [Str.mediaCodeTitle($0, label.title), left].compactMap(\.self).joined(separator: " · ") }
            ?? left ?? label.year
          CardText(label.showName, detail)
        } else {
          let detail = [episodeNumber(item), left ?? formatRuntime(runtimeMinutes(item))].compactMap(\.self)
            .joined(separator: " · ")
          CardText(label.title, detail.isEmpty ? nil : detail, untitled: label.untitled)
        }
      }
    }
    .accessibilityElement(children: .combine)
  }
}

/// A 2:3 poster, with the name on the title's tone until the poster shows.
struct PosterArt: View {
  let name: String
  let poster: ImageSource?
  var watched = false
  @Environment(\.palette) private var palette

  var body: some View {
    ArtFrame(name, aspect: 2 / 3) {
      Text(name)
        .textStyle(.bodyMedium, weight: .medium)
        .foregroundStyle(palette.foreground.opacity(0.7))
        .multilineTextAlignment(.center)
        .lineLimit(4)
        .padding(12)
        .accessibilityHidden(true)
      if let poster { Picture(poster) }
      if watched {
        WatchedBadge().padding(6).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
      }
    }
  }
}

/// A movie or show as its poster, opening its page.
struct PosterCard: View {
  let title: TitleSummary
  let detail: String?
  let poster: Artwork?
  var onTap: (() -> Void)?

  @Environment(\.api) private var api
  @Environment(\.navigator) private var nav
  @Environment(ViewerState.self) private var viewer: ViewerState?

  /// With the title's own poster.
  init(_ title: TitleSummary, detail: String?, onTap: (() -> Void)? = nil) {
    self.init(title, detail: detail, poster: title.images.poster, onTap: onTap)
  }

  /// With another poster, like a season's.
  init(_ title: TitleSummary, detail: String?, poster: Artwork?, onTap: (() -> Void)? = nil) {
    self.title = title
    self.detail = detail
    self.poster = poster
    self.onTap = onTap
  }

  var body: some View {
    CardButton(target: .title(title, file: nil, here: false), action: onTap ?? { nav.title(title) }) {
      VStack(alignment: .leading, spacing: 0) {
        PosterArt(
          name: title.name, poster: api?.art(poster), watched: viewer?.isWatched(title) ?? title.watched)
        CardText(title.name, detail)
      }
    }
    .accessibilityElement(children: .combine)
  }
}

/// What a shelf entry's card shows and opens: a movie by its year, a show by
/// what it got last, with the season's poster and page, or the one new
/// episode's, where that's what's new.
struct ShelfCardModel {
  let poster: Artwork?
  let detail: String?
  let open: (Navigator) -> Void
}

func shelfCardModel(_ entry: ShelfEntry) -> ShelfCardModel {
  let title = entry.title
  let openTitle: (Navigator) -> Void = { $0.title(title) }
  if title.kind == TitleKind.movie {
    return ShelfCardModel(poster: title.images.poster, detail: formatYear(title.year), open: openTitle)
  }
  guard let added = entry.added else {
    return ShelfCardModel(poster: title.images.poster, detail: Str.mediaEpisodeCount(entry.count), open: openTitle)
  }
  if added.count == 1 {
    let code = episodeCode(added.item)
    let name = itemLabel(added.item).title
    let itemId = added.item.id
    return ShelfCardModel(
      poster: added.season?.poster ?? title.images.poster,
      detail: code.map { Str.mediaCodeTitle($0, name) } ?? name
    ) { $0.episode(itemId) }
  }
  let fresh = Str.mediaNewEpisodes(added.count)
  guard let season = added.season else {
    return ShelfCardModel(poster: title.images.poster, detail: fresh, open: openTitle)
  }
  return ShelfCardModel(poster: season.poster ?? title.images.poster, detail: "\(seasonName(season.number)) · \(fresh)") {
    $0.season(title.id, season.number)
  }
}

/// A movie or show from a library's shelf, saying what it got last.
struct ShelfCard: View {
  let entry: ShelfEntry
  @Environment(\.navigator) private var nav

  init(_ entry: ShelfEntry) { self.entry = entry }

  var body: some View {
    let card = shelfCardModel(entry)
    PosterCard(entry.title, detail: card.detail, poster: card.poster) { card.open(nav) }
  }
}

/// Someone in the cast or crew: a round portrait, the name, and the part.
struct PersonCard: View {
  let name: String
  let role: String?
  let photo: ImageSource?
  @Environment(\.navigator) private var nav
  @Environment(\.palette) private var palette

  init(_ name: String, role: String?, photo: ImageSource?) {
    self.name = name
    self.role = role
    self.photo = photo
  }

  var body: some View {
    Button { nav.person(name) } label: {
      VStack(spacing: 0) {
        Circle()
          .fill(palette.secondary)
          .aspectRatio(1, contentMode: .fit)
          .overlay {
            Text(initials(name)).textStyle(.headlineSmall, weight: .medium).foregroundStyle(palette.muted)
              .accessibilityHidden(true)
          }
          .overlay { Picture(photo) }
          .clipShape(Circle())
        Text(name)
          .textStyle(.bodyMedium, weight: .medium)
          .foregroundStyle(palette.foreground)
          .multilineTextAlignment(.center)
          .lineLimit(2)
          .padding(.top, 8)
        if let role {
          Text(role).textStyle(.bodySmall).foregroundStyle(palette.muted).multilineTextAlignment(.center)
            .lineLimit(2)
        }
      }
      .frame(maxWidth: .infinity)
      .contentShape(Rectangle())
    }
    .buttonStyle(CardPress())
    .accessibilityElement(children: .combine)
  }
}

/// A list row for a file: its still, name, and details, with Play at its end.
struct EpisodeRow: View {
  let item: MediaItem
  @Environment(\.api) private var api
  @Environment(\.navigator) private var nav
  @Environment(ViewerState.self) private var viewer: ViewerState?
  @Environment(\.palette) private var palette

  init(_ item: MediaItem) { self.item = item }

  var body: some View {
    let label = itemLabel(item)
    let watched = viewer?.isWatched(item) ?? (item.progress?.completed ?? false)
    let ratio = progressRatio(item)
    HStack(spacing: 14) {
      CardButton(target: .item(item, here: false), action: { nav.item(item) }) {
        HStack(spacing: 14) {
          ArtFrame(label.showName, aspect: 16 / 9) {
            Picture(api?.landscape(item, size: .thumb) ?? [])
            if watched {
              WatchedBadge(size: 18).padding(5)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
            } else if let ratio, ratio > 0 {
              ProgressBar(progress: ratio, inset: 6).frame(maxHeight: .infinity, alignment: .bottom)
            }
          }
          .frame(width: 144)
          VStack(alignment: .leading, spacing: 0) {
            Text(label.title).textStyle(.bodyMedium, weight: label.untitled ? .regular : .medium).lineLimit(2)
              .foregroundStyle(palette.foreground)
            let detail = [
              episodeNumber(item),
              item.progress?.completed == false ? timeLeft(item) : formatRuntime(runtimeMinutes(item)),
            ].compactMap(\.self).joined(separator: " · ")
            if !detail.isEmpty {
              Text(detail).textStyle(.bodySmall).foregroundStyle(palette.muted).lineLimit(1)
            }
            if let overview = item.episode?.overview {
              Text(overview).textStyle(.bodySmall).foregroundStyle(palette.faint).lineLimit(2)
            }
          }
          .frame(maxWidth: .infinity, alignment: .leading)
          .multilineTextAlignment(.leading)
        }
        .padding(.vertical, 6)
        .accessibilityElement(children: .combine)
      }
      RoundIconButton(
        .play, label: Str.mediaPlayNamed(label.title), size: 40, iconSize: 16, background: .clear
      ) { nav.play(item.id, nil) }
    }
  }
}
