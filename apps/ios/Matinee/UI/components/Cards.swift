import MatineeCore
import MatineeKit
import SwiftUI

/*
 * Cards.kt: the cards rails and grids are made of, their art and captions,
 * and the rails and grid themselves, as the web's media-item.tsx draws
 * them. A card opens its page through the environment's `Navigator`; a
 * long press opens its actions (Actions.swift), as the web does on a phone.
 *
 *     Rail(Str.browseNextUp) {
 *       ForEach(items, id: \.id) { item in RailItem(.landscape) { EpisodeCard(item) } }
 *     }
 *     CardGrid { ForEach(titles, id: \.id) { PosterCard($0, detail: formatYear($0.year)) } }
 */

// MARK: Layout

extension EnvironmentValues {
  /// The window's size, which rails and grids size their cards by. The root
  /// measures it with `.measuresWindow()`.
  @Entry var windowSize = CGSize(width: 390, height: 844)

  /// The page's side margin for the window it's in, as the web's page column:
  /// 16 on a phone, 24 on a tablet, 56 once it's 1024 wide. Rails, grids, and
  /// headings line up on it; the shell sets it.
  @Entry var gutter = Space.gutter
}

extension View {
  /// Puts the size of the space this view fills, the whole window on the
  /// root, in the environment as `windowSize`, and the margin for it as `gutter`.
  func measuresWindow() -> some View { modifier(MeasuresWindow()) }
}

private struct MeasuresWindow: ViewModifier {
  @State private var size = CGSize(width: 390, height: 844)

  func body(content: Content) -> some View {
    content
      .environment(\.windowSize, size)
      .environment(\.gutter, pageGutter(width: size.width))
      .onGeometryChange(for: CGSize.self) { proxy in
        CGSize(
          width: proxy.size.width + proxy.safeAreaInsets.leading + proxy.safeAreaInsets.trailing,
          height: proxy.size.height + proxy.safeAreaInsets.top + proxy.safeAreaInsets.bottom)
      } action: { size = $0 }
  }
}

/// The web's `px-4 sm:px-6 lg:px-14`.
func pageGutter(width: CGFloat) -> CGFloat {
  width < 640 ? Space.gutter : width < 1024 ? Space.s6 : 56
}

/// True on iPads and wide windows, which get the web's fixed card sizes.
func isWide(_ window: CGSize) -> Bool { window.width >= 600 }

/// The shape of a card's picture.
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
    let inner = window.width - 2 * Space.gutter
    switch self {
    case .landscape: return min(inner * 0.66, window.height * 0.34 * 16 / 9)
    case .poster: return inner * 0.44
    case .person: return inner * 0.28
    }
  }
}

/// A titled row of cards that scrolls sideways past the page's edge, as the
/// web's `Rail`: the title in `text-xl font-semibold`, 12 under it, cards 12
/// apart (16 on a tablet), snapping to a card. With `onTitleTap` the title
/// is a link to the whole list. Give each card its width with `RailItem`.
struct Rail<Content: View>: View {
  let title: String
  var onTitleTap: (() -> Void)?
  @ViewBuilder let content: () -> Content
  @Environment(\.gutter) private var gutter
  @Environment(\.windowSize) private var window

  init(_ title: String, onTitleTap: (() -> Void)? = nil, @ViewBuilder content: @escaping () -> Content) {
    self.title = title
    self.onTitleTap = onTitleTap
    self.content = content
  }

  var body: some View {
    VStack(alignment: .leading, spacing: Space.s3) {
      SectionTitle(title, action: onTitleTap).padding(.horizontal, gutter)
      CardRow(content: content)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityElement(children: .contain)
  }
}

/// A rail's cards without its title, for a row under a heading of its own.
struct CardRow<Content: View>: View {
  @ViewBuilder let content: () -> Content
  @Environment(\.gutter) private var gutter
  @Environment(\.windowSize) private var window

  var body: some View {
    ScrollView(.horizontal) {
      LazyHStack(alignment: .top, spacing: isWide(window) ? Space.s4 : Space.s3) { content() }
        .scrollTargetLayout()
    }
    .contentMargins(.horizontal, gutter, for: .scrollContent)
    .scrollIndicators(.hidden)
    .scrollTargetBehavior(.viewAligned)
    .scrollClipDisabled()
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

/// Posters in a grid, as the web's `posterGrid`: two columns on a phone,
/// then as many of at least 176 as fit, 16 apart and 24 between rows. Its
/// content goes in a lazy grid, so a long list only builds what shows.
struct CardGrid<Content: View>: View {
  var minimum: CGFloat = 176
  @ViewBuilder let content: () -> Content
  @Environment(\.gutter) private var gutter
  @Environment(\.windowSize) private var window

  init(minimum: CGFloat = 176, @ViewBuilder content: @escaping () -> Content) {
    self.minimum = minimum
    self.content = content
  }

  var body: some View {
    let columns =
      window.width < 640
      ? Array(repeating: GridItem(.flexible(), spacing: Space.s4, alignment: .top), count: 2)
      : [GridItem(.adaptive(minimum: minimum), spacing: Space.s4, alignment: .top)]
    LazyVGrid(columns: columns, alignment: .leading, spacing: Space.s6, content: content)
      .padding(.horizontal, gutter)
  }
}

// MARK: Parts

/// The 2:3 or 16:9 frame a card's picture sits in, as the web's: `rounded-md`,
/// a hairline border, on the title's tone until the picture covers it.
/// `content` stacks over the tone, centered.
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
    let shape = RoundedRectangle.kit(Radius.md)
    Tone(toneKey)
      .aspectRatio(aspect, contentMode: .fit)
      .frame(maxWidth: .infinity)
      .overlay { ZStack { content() } }
      .clipShape(shape)
      .overlay { shape.strokeBorder(palette.border) }
  }
}

/// Play in the middle of a still, as the web's play control: a frosted
/// circle, white whatever the theme, over the picture.
struct PlayGlyph: View {
  let label: String
  var size: CGFloat = 56
  let action: () -> Void

  var body: some View {
    RoundIconButton(.play, label: label, look: .glass, size: size, iconSize: (size * 0.4).rounded(), action: action)
  }
}

/// Play over a card's still while a pointer hovers it, as the web shows it
/// on a desktop: an iPad with a trackpad. A touch has no hover, so cards
/// stay clean; a tap opens the item, and its page has Play.
struct HoverPlay: ViewModifier {
  let label: String
  var size: CGFloat = 56
  let action: () -> Void
  @State private var hovered = false
  @Environment(\.offline) private var offline

  func body(content: Content) -> some View {
    content
      .overlay {
        if hovered && !offline { PlayGlyph(label: label, size: size, action: action).transition(Motion.fade) }
      }
      .onHover { hovered = $0 }
  }
}

/// Name and detail under a card, one line each, as the web's `CardText`:
/// the name in `text-sm font-medium`, the detail in `text-13px`, muted. At
/// the accessibility text sizes the name gets two lines, as the card is no
/// wider for it.
struct CardText: View {
  let primary: String
  let secondary: String?
  var untitled = false
  @Environment(\.palette) private var palette
  @Environment(\.dynamicTypeSize) private var dynamicType

  init(_ primary: String, _ secondary: String?, untitled: Bool = false) {
    self.primary = primary
    self.secondary = secondary
    self.untitled = untitled
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      Text(primary).textStyle(.sm, weight: untitled ? .regular : .medium)
        .lineLimit(dynamicType.isAccessibilitySize ? 2 : 1)
        .foregroundStyle(palette.foreground)
      if let secondary {
        Text(secondary).textStyle(.px13).foregroundStyle(palette.mutedForeground).lineLimit(1)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.top, Space.s2)
  }
}

/// A card: `art` is what's pressed, with the kit's wash and focus ring, and
/// a long press opens `target`'s actions; the text under it opens the same.
/// To VoiceOver it's one button, named by its text, with the actions as an
/// action of its own. Offline it only shows: what it opens is the server's.
struct CardButton<Art: View, Caption: View>: View {
  let target: ActionTarget?
  let action: () -> Void
  @ViewBuilder let art: () -> Art
  @ViewBuilder let caption: () -> Caption
  @Environment(\.offline) private var offline
  @Environment(\.actions) private var actions

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      Pressable(
        shape: .kit(Radius.md), action: open, onLongPress: longPress, longPressLabel: Str.titleMoreActions, label: art)
      caption()
        .contentShape(Rectangle())
        .onTapGesture(perform: open)
        .onLongPressGesture(minimumDuration: 0.45) { longPress?() }
        // Its name before what's drawn on the picture, as how far in it is.
        .accessibilitySortPriority(1)
    }
    .accessibilityElement(children: .combine)
  }

  private func open() { if !offline { action() } }

  private var longPress: (() -> Void)? {
    guard let target, let actions, !offline else { return nil }
    return { actions.open(target) }
  }
}

// MARK: Cards

/// An episode or movie to start or resume, for Continue watching and Next
/// up: the episode's still, the show leading the text and the episode after
/// it. It opens the episode's page, or a movie's; Play shows on the still
/// under a pointer. Without `showName`, as in a season's row, the episode
/// leads and its number and length follow.
struct EpisodeCard: View {
  let item: MediaItem
  var showName = true

  @Environment(\.api) private var api
  @Environment(\.navigator) private var nav
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
      ArtFrame(label.showName, aspect: 16 / 9) {
        LucideIcon(.film, size: 20, tint: palette.mutedForeground.opacity(0.4))
        Picture(api?.landscape(item) ?? [])
        if watched {
          WatchedBadge().padding(Space.s1_5).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
        } else if let ratio, ratio > 0 {
          ArtProgressBar(progress: ratio)
        }
      }
      .modifier(
        HoverPlay(label: left != nil ? Str.mediaResumeNamed(name) : Str.mediaPlayNamed(name)) {
          nav.play(item.id, nil)
        })
    } caption: {
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
}

/// A 2:3 poster, with the name on the title's tone until the poster or its
/// placeholder covers it, as the web's `PosterArt`.
struct PosterArt: View {
  let name: String
  let poster: ImageSource?
  var watched = false
  @Environment(\.palette) private var palette

  var body: some View {
    ArtFrame(name, aspect: 2 / 3) {
      Text(name)
        .textStyle(.sm, weight: .medium)
        .foregroundStyle(palette.foreground.opacity(0.7))
        .multilineTextAlignment(.center)
        .lineLimit(4)
        .padding(Space.s3)
        .accessibilityHidden(true)
      if let poster { Picture(poster) }
      if watched {
        WatchedBadge().padding(Space.s1_5).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
      }
    }
  }
}

/// A movie or show as its poster, opening its page, or doing `onTap`.
/// `recommended` is the title at the provider when a recommendation row
/// shows it, so its actions offer "Not interested".
struct PosterCard: View {
  let title: TitleSummary
  let detail: String?
  let poster: Artwork?
  var onTap: (() -> Void)?
  var recommended: CatalogRef?

  @Environment(\.api) private var api
  @Environment(\.navigator) private var nav
  @Environment(ViewerState.self) private var viewer: ViewerState?

  /// With the title's own poster.
  init(_ title: TitleSummary, detail: String?, recommended: CatalogRef? = nil, onTap: (() -> Void)? = nil) {
    self.init(title, detail: detail, poster: title.images.poster, recommended: recommended, onTap: onTap)
  }

  /// With another poster, like a season's.
  init(
    _ title: TitleSummary, detail: String?, poster: Artwork?, recommended: CatalogRef? = nil,
    onTap: (() -> Void)? = nil
  ) {
    self.title = title
    self.detail = detail
    self.poster = poster
    self.recommended = recommended
    self.onTap = onTap
  }

  var body: some View {
    CardButton(
      target: .title(title, file: nil, here: false, recommended: recommended), action: onTap ?? { nav.title(title) }
    ) {
      PosterArt(name: title.name, poster: api?.art(poster), watched: viewer?.isWatched(title) ?? title.watched)
    } caption: {
      CardText(title.name, detail)
    }
  }
}

/// A season of a show as a poster, for a row of posters: the season's
/// poster, or the show's, the show's name over the season's, opening the
/// season's page. A long press offers the season's actions.
struct SeasonPosterCard: View {
  let title: TitleSummary
  let season: Season
  @Environment(\.api) private var api
  @Environment(\.navigator) private var nav

  var body: some View {
    let name = seasonName(season.number)
    CardButton(target: .season(title, season, here: false), action: { nav.season(title.id, season.number) }) {
      PosterArt(
        name: Str.titleSeasonOf(title.name, name), poster: api?.art(season.poster ?? title.images.poster),
        watched: season.itemCount > 0 && season.watchedCount >= season.itemCount)
    } caption: {
      CardText(title.name, name)
    }
  }
}

/// An episode as its show's poster, for a row of posters: the show's name
/// over the episode's, opening the episode's page.
struct EpisodePosterCard: View {
  let item: MediaItem
  @Environment(\.api) private var api
  @Environment(\.navigator) private var nav
  @Environment(ViewerState.self) private var viewer: ViewerState?

  init(_ item: MediaItem) { self.item = item }

  var body: some View {
    let label = itemLabel(item)
    let code = episodeCode(item)
    CardButton(target: .item(item, here: false), action: { nav.item(item) }) {
      PosterArt(
        name: label.showName, poster: api?.art(item.title?.images.poster),
        watched: viewer?.isWatched(item) ?? (item.progress?.completed ?? false))
    } caption: {
      CardText(label.showName, code.map { Str.mediaCodeTitle($0, label.title) } ?? label.title)
    }
  }
}

/// A favorite of any kind as a poster, so a row that mixes them lines up:
/// a movie, a show, a season, or an episode on its show's poster.
struct FavoriteCard: View {
  let favorite: Favorite

  init(_ favorite: Favorite) { self.favorite = favorite }

  var body: some View {
    switch favorite {
    case .movie(let movie): PosterCard(movie.title, detail: formatYear(movie.title.year))
    case .show(let show): PosterCard(show.title, detail: formatYear(show.title.year))
    case .showSeason(let season): SeasonPosterCard(title: season.title, season: season.season)
    case .episode(let episode): EpisodePosterCard(episode.item)
    }
  }
}

extension Favorite {
  /// Tells favorites apart in a row that mixes their kinds.
  var key: String {
    switch self {
    case .movie(let movie): "title/\(movie.title.id)"
    case .show(let show): "title/\(show.title.id)"
    case .showSeason(let season): "season/\(season.title.id)/\(season.season.number.map(String.init) ?? "")"
    case .episode(let episode): "episode/\(episode.item.id)"
    }
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

/// Someone in the cast or crew: a round portrait, or their initials, the
/// name, and the part. Long words shrink rather than break at large text
/// sizes, as the card is only as wide as the rail makes it.
struct PersonCard: View {
  let name: String
  let role: String?
  let photo: ImageSource?
  /// The provider's id for the person page, when the credit has one.
  let tmdbId: String?
  @Environment(\.navigator) private var nav
  @Environment(\.palette) private var palette

  init(_ name: String, role: String?, photo: ImageSource?, tmdbId: String? = nil) {
    self.name = name
    self.role = role
    self.photo = photo
    self.tmdbId = tmdbId
  }

  var body: some View {
    Pressable(shape: .kit(Radius.md), wash: false, action: { nav.person(name) }) {
      VStack(spacing: 0) {
        Circle()
          .fill(palette.secondary)
          .aspectRatio(1, contentMode: .fit)
          .overlay {
            Text(initials(name)).textStyle(.px22, weight: .medium).foregroundStyle(palette.mutedForeground)
              .accessibilityHidden(true)
          }
          .overlay { Picture(photo) }
          .clipShape(Circle())
          .overlay { Circle().strokeBorder(palette.border) }
        Text(name)
          .textStyle(.sm, weight: .medium)
          .foregroundStyle(palette.foreground)
          .multilineTextAlignment(.center)
          .lineLimit(2)
          .keepsWordsWhole(name, .sm, weight: .medium, alignment: .center)
          .padding(.top, Space.s2)
        if let role {
          Text(role).textStyle(.px13).foregroundStyle(palette.mutedForeground).multilineTextAlignment(.center)
            .lineLimit(2)
            .keepsWordsWhole(role, .px13, alignment: .center)
        }
      }
      .frame(maxWidth: .infinity)
      // Its own height, whatever the row offers: a lazy row offers each card
      // the first one's, which would shrink the portrait of a name on two lines.
      .fixedSize(horizontal: false, vertical: true)
      .contentShape(Rectangle())
    }
    .accessibilityElement(children: .combine)
  }
}

/// A list row for a file: its still, name, and details, opening its page,
/// with Play at its end. A long press offers the rest.
struct EpisodeRow: View {
  let item: MediaItem
  @Environment(\.api) private var api
  @Environment(\.navigator) private var nav
  @Environment(\.actions) private var actions
  @Environment(\.offline) private var offline
  @Environment(ViewerState.self) private var viewer: ViewerState?
  @Environment(\.palette) private var palette

  init(_ item: MediaItem) { self.item = item }

  var body: some View {
    let label = itemLabel(item)
    let watched = viewer?.isWatched(item) ?? (item.progress?.completed ?? false)
    let ratio = progressRatio(item)
    HStack(spacing: Space.s3_5) {
      Pressable(
        shape: .kit(Radius.md), action: { if !offline { nav.item(item) } },
        onLongPress: offline ? nil : { actions?.open(.item(item, here: false)) },
        longPressLabel: Str.titleMoreActions
      ) {
        HStack(spacing: Space.s3_5) {
          ArtFrame(label.showName, aspect: 16 / 9) {
            Picture(api?.landscape(item, size: .thumb) ?? [])
            if watched {
              WatchedBadge(size: 18).padding(5)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
            } else if let ratio, ratio > 0 {
              ArtProgressBar(progress: ratio, inset: Space.s1_5)
            }
          }
          .frame(width: 144)
          VStack(alignment: .leading, spacing: 0) {
            Text(label.title).textStyle(.sm, weight: label.untitled ? .regular : .medium).lineLimit(2)
              .foregroundStyle(palette.foreground)
            let detail = [
              episodeNumber(item),
              item.progress?.completed == false ? timeLeft(item) : formatRuntime(runtimeMinutes(item)),
            ].compactMap(\.self).joined(separator: " · ")
            if !detail.isEmpty {
              Text(detail).textStyle(.px13).foregroundStyle(palette.mutedForeground).lineLimit(1)
            }
            if let overview = item.episode?.overview {
              Text(overview).textStyle(.px13).foregroundStyle(palette.foregroundFaint).lineLimit(2)
            }
          }
          .frame(maxWidth: .infinity, alignment: .leading)
          .multilineTextAlignment(.leading)
        }
        .padding(.vertical, Space.s1_5)
        .accessibilityElement(children: .combine)
      }
      RoundIconButton(.play, label: Str.mediaPlayNamed(label.title), look: .ghost, size: 40, iconSize: 16) {
        nav.play(item.id, nil)
      }
    }
  }
}
