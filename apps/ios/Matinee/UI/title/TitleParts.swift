import MatineeCore
import MatineeKit
import SwiftUI

/*
 * TitleParts.kt: the pieces the title, season, and episode pages are made
 * of, drawn as the web's title-header.tsx, credits.tsx, media-info.tsx,
 * episodes.tsx, and seasons-rail.tsx draw them. What they decide from the
 * server's answers is MatineeCore's (Title/), and their words TitleData.swift's.
 *
 * On a phone a page's heading sits low on its art and spans the width; from
 * the web's `sm` up, 640 points, the poster or the still stands beside it
 * all, with the buttons level with its foot.
 */

// MARK: Layout

/// How a title's page lays out in a window: the web's phone layout, or from
/// `sm` up its poster beside the details.
struct TitleLayout {
  let window: CGSize

  /// The web's `sm`: the poster or still beside the details.
  var wide: Bool { window.width >= 640 }
  /// The web's `lg`.
  var large: Bool { window.width >= 1024 }

  /// The backdrop: `min(46vh, 420)` on a phone, `min(54vh, 520)` wider, as
  /// the web's title and season headers; an episode's is taller from `sm`
  /// up, `min(64vh, 600)`, for its still to sit on.
  func backdropHeight(episode: Bool = false) -> CGFloat {
    if !wide { return min(window.height * 0.46, 420) }
    return episode ? min(window.height * 0.64, 600) : min(window.height * 0.54, 520)
  }

  /// Where the heading starts, from the screen's top. A phone's title and
  /// episode start low, `max(10rem, 30vh)`, for more of the art; a season's,
  /// with its poster beside the name, 150 above the backdrop's end, as
  /// Android's; wider, the poster's top, `max(8rem, 14vh)`, or an episode's
  /// still's, `max(12rem, 32vh)`.
  func headingTop(season: Bool = false, episode: Bool = false) -> CGFloat {
    if wide { return episode ? max(192, window.height * 0.32) : max(128, window.height * 0.14) }
    return season ? backdropHeight() - 150 : max(160, window.height * 0.3)
  }

  /// The header poster: 112 beside a phone's season name, as Android's, `w-48`, `lg:w-56`.
  var posterWidth: CGFloat { !wide ? 112 : large ? 224 : 192 }

  /// An episode's still beside its details: `w-80`, `lg:w-[28rem]`, `xl:w-[32rem]`.
  var stillWidth: CGFloat { window.width >= 1280 ? 512 : large ? 448 : 320 }

  /// The page's name: Android's `headlineLarge` on a phone, 30 bold;
  /// `text-4xl`, `lg:text-5xl` semibold wider, as the web's.
  var nameSize: TextSize { !wide ? .xl3 : large ? .xl5 : .xl4 }
  var nameWeight: Font.Weight { wide ? .semibold : .bold }

  /// A page's description: Android's `bodyLarge` on a phone, `text-15px` wider.
  var overviewSize: TextSize { wide ? .px15 : .base }

  /// Room between a page's sections: `gap-6 sm:gap-8`.
  var sectionSpacing: CGFloat { wide ? Space.s8 : Space.s6 }
}

// MARK: Backdrop

/// How a backdrop is shaded into the page.
enum BackdropShade {
  /// A title's or season's, as Home's banner: from the start where the
  /// details sit, and up from the bottom.
  case title
  /// An episode's, a little deeper, for the still and the details over it.
  case episode
}

/// The art across the top of a title's pages, faded into the page under
/// the heading. The first of `sources` that loads; with none, `blurred`,
/// the poster, softly, so the page doesn't go flat, as the web's; else the
/// title's tone.
struct Backdrop: View {
  let sources: [ImageSource]
  var blurred: ImageSource?
  let toneKey: String
  let height: CGFloat
  var shade: BackdropShade = .title
  var wide = false
  @Environment(\.palette) private var palette

  var body: some View {
    ZStack(alignment: .bottom) {
      Tone(toneKey)
      if sources.isEmpty, let blurred {
        Picture(blurred).scaleEffect(1.1).blur(radius: 40).opacity(0.5)
      } else {
        Picture(sources, alignment: .top)
      }
      shading
    }
    .frame(maxWidth: .infinity)
    .frame(height: height)
    .clipped()
    .accessibilityHidden(true)
  }

  @ViewBuilder private var shading: some View {
    let deep = shade == .episode
    if wide {
      // `from-background/95 via-background/60 to-transparent` across, and up from the bottom.
      LinearGradient(
        stops: [
          .init(color: palette.background.opacity(0.95), location: 0),
          .init(color: palette.background.opacity(deep ? 0.5 : 0.6), location: 0.5),
          .init(color: palette.background.opacity(0), location: 1),
        ], startPoint: .leading, endPoint: .trailing)
      LinearGradient(
        stops: [
          .init(color: palette.background.opacity(0), location: 0),
          .init(color: palette.background.opacity(deep ? 0.7 : 0.4), location: deep ? 0.6 : 0.65),
          .init(color: palette.background, location: 1),
        ], startPoint: .top, endPoint: .bottom)
    } else {
      // A phone's heading spans the width at the bottom, so its shade is
      // there and not down the side, which hid half the picture, as Home's
      // banner on a phone.
      GeometryReader { proxy in
        LinearGradient(
          stops: [
            .init(color: palette.background.opacity(0), location: 0),
            .init(color: palette.background.opacity(deep ? 0.75 : 0.7), location: 0.45),
            .init(color: palette.background, location: 1),
          ], startPoint: .top, endPoint: .bottom
        )
        .frame(height: proxy.size.height * 0.7)
        .frame(maxHeight: .infinity, alignment: .bottom)
      }
    }
  }
}

// MARK: Heading

/// The poster beside a heading, 2:3, lifted off the art by a deep shadow,
/// as the web's `HeaderPoster`: the name on the tone until it loads.
struct HeaderPoster: View {
  let name: String
  let poster: ImageSource?

  var body: some View {
    PosterArt(name: name, poster: poster)
      .kitShadow(.dialog)
      .accessibilityHidden(true)
  }
}

/// The facts under a name, in a line that wraps: the facts themselves,
/// and after them the age rating outlined and the score by its star, as
/// Android's episode and catalog headings have them. A title's page gives
/// its badges a line of their own, `RatingBadges`.
struct FactsRow: View {
  let facts: [String]
  var contentRating: String?
  var rating: Double?
  @Environment(\.palette) private var palette

  var body: some View {
    if !facts.isEmpty || contentRating != nil || rating != nil {
      FlowRow(spacing: Space.s2_5, lineSpacing: Space.s1_5) {
        if !facts.isEmpty {
          Text(facts.joined(separator: " · ")).textStyle(.sm).foregroundStyle(palette.foreground.opacity(0.8))
        }
        if let contentRating { Badge(contentRating, look: .metaOutline) }
        if let rating { RatingStar(rating: rating) }
      }
    }
  }
}

/// The score by its star.
private struct RatingStar: View {
  let rating: Double
  @Environment(\.palette) private var palette

  var body: some View {
    HStack(spacing: Space.s1) {
      LucideIcon(.star, size: 14, tint: palette.star)
      Text(formatRating(rating)).textStyle(.sm).foregroundStyle(palette.foreground.opacity(0.8))
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("\(Str.mediaHeroRated) \(formatRating(rating))")
  }
}

/// The age rating outlined, the score by its star, and a movie's file's
/// badges, on a line of their own under a title's facts, as Android's
/// `TitleHeading` sets them, 8 apart; nothing when there are none.
struct RatingBadges: View {
  var contentRating: String?
  var rating: Double?
  var flags: [String] = []

  var body: some View {
    if contentRating != nil || rating != nil || !flags.isEmpty {
      FlowRow(spacing: Space.s2, lineSpacing: Space.s1_5) {
        if let contentRating { Badge(contentRating, look: .metaOutline) }
        if let rating { RatingStar(rating: rating) }
        ForEach(flags, id: \.self) { Badge($0, look: .meta) }
      }
    }
  }
}

/// A page's name, in words: Android types it, and the owner wants it so on
/// every screen, the provider's logo left out.
struct HeadingMark: View {
  let name: String
  let size: TextSize
  var weight: Font.Weight = .semibold
  @Environment(\.palette) private var palette

  var body: some View {
    Text(name)
      .textStyle(size, weight: weight, tracking: .tight)
      .foregroundStyle(palette.foreground)
      .lineLimit(3)
      .fixedSize(horizontal: false, vertical: true)
      .accessibilityAddTraits(.isHeader)
  }
}

/// Names in running text, each a link: "A, B and C", or with `sentence`
/// off, a plain list, "A, B, C", as the web lists genres. The text wraps as
/// text does.
struct LinkedNames: View {
  let names: [String]
  var sentence = true
  let color: Color
  let onTap: (String) -> Void
  @Environment(\.palette) private var palette

  var body: some View {
    var text = AttributedString()
    for (index, name) in names.enumerated() {
      var link = AttributedString(name)
      link.link = URL(string: "matinee-name:\(index)")
      text += link
      if index < names.count - 1 {
        var gap = AttributedString(sentence && index == names.count - 2 ? " \(Str.commonAnd) " : ", ")
        gap.foregroundColor = palette.mutedForeground
        text += gap
      }
    }
    return Text(text)
      .textStyle(.sm)
      .tint(color)
      .environment(
        \.openURL,
        OpenURLAction { url in
          guard url.scheme == "matinee-name", let index = Int(url.absoluteString.dropFirst("matinee-name:".count)),
            names.indices.contains(index)
          else { return .discarded }
          onTap(names[index])
          return .handled
        })
  }
}

/// Who made the title and where, as label and names: creators, directors,
/// writers, then studios, each name opening its page, in one wrapping
/// block, as the web's `CrewFacts`.
struct CrewLines: View {
  let credits: [Credit]
  let studios: [String]
  @Environment(\.navigator) private var nav
  @Environment(\.palette) private var palette

  var body: some View {
    let kinds = [CreditKind.creator, CreditKind.director, CreditKind.writer]
    let lines = kinds.map { ($0, creditNames(credits, $0)) }.filter { !$0.1.isEmpty }
    if !lines.isEmpty || !studios.isEmpty {
      FlowRow(spacing: Space.s6, lineSpacing: Space.s1) {
        ForEach(lines, id: \.0) { kind, names in
          line(titleCreditLabel(kind, count: names.count), names, onTap: { nav.person($0, nil) })
        }
        if !studios.isEmpty {
          line(Str.peopleStudio(studios.count), studios, onTap: nav.studio)
        }
      }
      .frame(maxWidth: 896, alignment: .leading)
    }
  }

  private func line(_ label: String, _ names: [String], onTap: @escaping (String) -> Void) -> some View {
    HStack(alignment: .firstTextBaseline, spacing: Space.s2) {
      Text(label).textStyle(.sm).foregroundStyle(palette.mutedForeground)
      LinkedNames(names: names, color: palette.foreground.opacity(0.85), onTap: onTap)
    }
  }
}

/// A tagline and description cut to a few lines, with More to read the
/// rest, there, as on Android: the text grows in place.
struct Overview: View {
  let text: String
  var tagline: String?
  var lines = 3
  var size: TextSize = .sm
  @State private var open = false
  @State private var cut: CGFloat = 0
  @State private var whole: CGFloat = 0
  @Environment(\.palette) private var palette

  var body: some View {
    let overflows = whole > cut + 1
    VStack(alignment: .leading, spacing: Space.s1) {
      words(lines: open ? nil : lines)
        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { if !open { cut = $0 } }
        // The whole text, unseen, to know whether the cut one leaves some out.
        .background(alignment: .topLeading) {
          words(lines: nil)
            .fixedSize(horizontal: false, vertical: true)
            .hidden()
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { whole = $0 }
        }
      if overflows || open {
        Text(open ? Str.titleLess : Str.titleMore)
          .textStyle(.sm, weight: .medium)
          .foregroundStyle(palette.mutedForeground)
          .accessibilityHidden(true)
      }
    }
    .frame(maxWidth: 720, alignment: .leading)
    .contentShape(Rectangle())
    .onTapGesture { if overflows || open { withMotion(Motion.move) { open.toggle() } } }
    .accessibilityElement(children: .combine)
    .accessibilityAction(named: open ? Str.titleLess : Str.titleMore) {
      if overflows || open { open.toggle() }
    }
  }

  private func words(lines: Int?) -> some View {
    let body = palette.foreground.opacity(0.85)
    let words: Text =
      if let tagline {
        Text("\(Text(tagline).fontWeight(.medium).foregroundStyle(palette.foreground))\n\(Text(text).foregroundStyle(body))")
      } else {
        Text(text).foregroundStyle(body)
      }
    // `leading-6`: 24 points a line, whatever the size.
    return words.textStyle(size).lineSpacing(size == .sm ? 4 : 2).lineLimit(lines)
  }
}

// MARK: Actions

/// Play, then the trailer, the tick, the heart, and the page's "more", as
/// under the web's title heading. Resume says the time left beside it.
/// The tick marks unwatched at once and asks when the person watched
/// `name` before marking it watched. Without `onFavorite`, for what can't
/// be a favorite, the heart stays out; without `onWatched`, the tick.
/// On a phone Play takes what the round buttons leave of the row; at the
/// accessibility text sizes it takes a row of its own.
struct ActionRow: View {
  let play: MediaItem?
  let name: String
  let watched: Bool
  let favorite: Bool
  var trailer: Trailer?
  let onWatched: ((_ watched: Bool, _ watchedAt: String?) async throws -> Void)?
  let onFavorite: (() async throws -> Void)?
  /// The page's sheet; its button leaves itself out when it would be empty.
  let more: ActionTarget
  var wide = false

  @Environment(\.navigator) private var nav
  @Environment(\.actions) private var actions
  @Environment(\.snackbar) private var snackbar
  @Environment(\.openURL) private var openURL
  @Environment(\.dynamicTypeSize) private var dynamicType
  @Environment(\.palette) private var palette

  var body: some View {
    Group {
      if dynamicType.isAccessibilitySize && !wide {
        VStack(alignment: .leading, spacing: Space.s2) {
          playButton
          HStack(spacing: Space.s2) { buttons }
        }
      } else {
        HStack(spacing: Space.s2) {
          playButton
          buttons
        }
      }
    }
    #if DEBUG
      // `-title.open actions` or `watched`: the page's sheet, or the question
      // of when, once a launch, for a screenshot of it.
      .task {
        guard let open = UserDefaults.standard.string(forKey: "title.open"), !ActionRow.opened else { return }
        try? await Task.sleep(for: .seconds(2.5))
        ActionRow.opened = true
        if open == "actions" { actions?.open(more) }
        if open == "watched", let onWatched { actions?.askWatched(name) { at in try await onWatched(true, at) } }
      }
    #endif
  }

  #if DEBUG
    private static var opened = false
  #endif

  @ViewBuilder private var playButton: some View {
    if let play {
      let resume = isResuming(play)
      let label = resume ? Str.titleResume : Str.titlePlay
      let left = resume ? timeLeft(play) : nil
      MatineeButton(look: .primary, fullWidth: true) {
        nav.play(play.id, nil)
      } label: {
        LucideIcon(.play, size: 16)
        // The time left when it fits whole beside the label, else the label alone.
        ViewThatFits(in: .horizontal) {
          HStack(spacing: Space.s2) {
            Text(label)
            if let left { Text(left).textStyle(.sm).opacity(0.7) }
          }
          Text(label)
        }
      }
      // Wider, as wide as its words, and at least a good target.
      .frame(minWidth: wide ? 168 : nil)
      .fixedSize(horizontal: wide, vertical: false)
      .accessibilityLabel([label, left].compactMap(\.self).joined(separator: ", "))
    }
  }

  @ViewBuilder private var buttons: some View {
    if let trailer, let url = URL(string: trailer.url) {
      if wide {
        MatineeButton(Str.iosTitleTrailer, icon: .clapperboard, look: .frosted) { openURL(url) }
          .accessibilityHint(Str.iosTitleTrailerHint)
      } else {
        RoundIconButton(.clapperboard, label: Str.iosTitleTrailer, look: .frosted, size: TouchTarget, iconSize: 20) {
          openURL(url)
        }
        .accessibilityHint(Str.iosTitleTrailerHint)
      }
    }
    if let onWatched {
      RoundIconButton(
        watched ? .checkBold : .check, label: watched ? Str.mediaMarkUnwatched : Str.mediaMarkWatched,
        look: .frosted, size: TouchTarget, iconSize: 20, tint: watched ? palette.accent : nil, selected: watched
      ) {
        if watched {
          launchShowing(snackbar, Str.mediaMarkUnwatchedFailed) { try await onWatched(false, nil) }
        } else {
          actions?.askWatched(name) { at in try await onWatched(true, at) }
        }
      }
    }
    if let onFavorite {
      RoundIconButton(
        favorite ? .heartFilled : .heart, label: favorite ? Str.mediaRemoveFavorite : Str.mediaAddFavorite,
        look: .frosted, size: TouchTarget, iconSize: 20, tint: favorite ? palette.destructive : nil, selected: favorite
      ) {
        launchShowing(snackbar, Str.mediaFavoriteFailed) { try await onFavorite() }
      }
      .motion(Motion.enter, value: favorite)
    }
    ActionsButton(more, look: .frosted)
  }
}

// MARK: Files

/// What a file holds, each part after its icon: the picture, the audio's
/// languages with the main track's layout, and the subtitles' languages, a
/// line each on a phone, as Android's `MediaInfo`, in a row that wraps
/// wider, as the web's. The languages are the server's track lists once
/// they load, the probe's until then.
struct MediaInfo: View {
  let item: MediaItem
  @State private var tracks = Loader<FileTracks>()
  @Environment(\.windowSize) private var window

  init(_ item: MediaItem) { self.item = item }

  var body: some View {
    Group {
      if let info = fileInfo(item, tracks: tracks.state.value) {
        let wide = TitleLayout(window: window).wide
        let layout =
          wide
          ? AnyLayout(FlowRow(spacing: Space.s5, lineSpacing: Space.s1))
          : AnyLayout(VStackLayout(alignment: .leading, spacing: Space.s1_5))
        layout {
          if let video = info.video { InfoLine(icon: .film, label: Str.mediaInfoVideo, text: video, lines: wide ? 1 : 3) }
          if let audio = info.audio { InfoLine(icon: .audioLines, label: Str.mediaInfoAudio, text: audio, lines: wide ? 1 : 3) }
          if let subtitles = info.subtitles {
            InfoLine(icon: .captions, label: Str.mediaInfoSubtitles, text: subtitles, lines: wide ? 1 : 3)
          }
        }
        .frame(maxWidth: 672, alignment: .leading)
      }
    }
    .loads(tracks) { [id = item.id] api in try await FileTracks.load(api, id) }
  }
}

private struct InfoLine: View {
  let icon: Lucide
  let label: String
  let text: String
  var lines = 1
  @Environment(\.palette) private var palette

  var body: some View {
    // The icon level with the first line, which may wrap on a phone.
    HStack(alignment: .firstTextBaseline, spacing: lines > 1 ? Space.s2_5 : Space.s2) {
      LucideIcon(icon, label: label, size: 16, tint: palette.mutedForeground)
        .alignmentGuide(.firstTextBaseline) { $0[VerticalAlignment.center] + 5 }
      Text(text).textStyle(.sm).foregroundStyle(palette.foreground.opacity(0.8)).lineLimit(lines)
    }
    .accessibilityElement(children: .combine)
  }
}

/// What a file holds in one quiet line, for a row in a list, from its probe
/// alone, as the web's `MediaInfoLine`: the picture, then the audio, then
/// the subtitles, the last giving way first.
struct StreamLine: View {
  let item: MediaItem
  @Environment(\.palette) private var palette

  var body: some View {
    if let info = fileInfo(item, tracks: nil) {
      // What fits whole, the subtitles giving way first, then the audio.
      ViewThatFits(in: .horizontal) {
        parts(info, audio: true, subtitles: true)
        parts(info, audio: true, subtitles: false)
        parts(info, audio: false, subtitles: false)
      }
      .foregroundStyle(palette.mutedForeground.opacity(0.8))
      .lineLimit(1)
    }
  }

  private func parts(_ info: FileInfo, audio: Bool, subtitles: Bool) -> some View {
    HStack(spacing: Space.s3) {
      if let video = info.video { part(.film, Str.mediaInfoVideo, video) }
      if audio, let text = info.audio { part(.audioLines, Str.mediaInfoAudio, text) }
      if subtitles, let text = info.subtitles { part(.captions, Str.mediaInfoSubtitles, text) }
    }
  }

  private func part(_ icon: Lucide, _ label: String, _ text: String) -> some View {
    HStack(spacing: Space.s1) {
      LucideIcon(icon, label: label, size: 14, tint: palette.mutedForeground.opacity(0.8))
      Text(text).textStyle(.xs)
    }
    .accessibilityElement(children: .combine)
  }
}

// MARK: People

/// The actors, in billing order, by their portraits, each opening their page.
struct CastRail: View {
  let credits: [Credit]
  @Environment(\.api) private var api

  var body: some View {
    let cast = credits.filter { $0.kind == CreditKind.actor }
    if !cast.isEmpty {
      Rail(Str.titleCast) {
        // The same actor can play two parts.
        ForEach(Array(cast.enumerated()), id: \.offset) { _, credit in
          RailItem(.person) {
            PersonCard(credit.name, role: credit.role, photo: api?.art(credit.photo, size: .thumb), tmdbId: credit.tmdbId)
          }
        }
      }
    }
  }
}

// MARK: Seasons

/// A show's seasons by their posters, with how many episodes are left in
/// each, then the seasons the server lacks, each with its state and ask,
/// from `gaps`. On a season's page `current` leaves that season out; on the
/// page of a show with one season, whose episodes are listed above,
/// `extraOnly` leaves the library's out, so the rail is there only for what
/// the server lacks.
struct SeasonsRail: View {
  let title: Title
  var current: Season?
  var gaps: TitleGaps?
  var extraOnly = false
  @Environment(\.navigator) private var nav

  var body: some View {
    let seasons = titleSeasons(title, current: current, extraOnly: extraOnly)
    let missing = gaps?.missing ?? []
    if !seasons.isEmpty || !missing.isEmpty {
      Rail(current != nil || extraOnly ? Str.titleSeasonsMore : Str.titleSeasons) {
        ForEach(seasons, id: \.number) { season in
          RailItem(.poster) {
            SeasonCard(title: title, season: season, partial: gaps?.partial(season.number))
          }
        }
        if let gaps {
          ForEach(missing, id: \.number) { season in
            RailItem(.poster) { MissingSeasonCard(title: title, season: season, gaps: gaps) }
          }
        }
      }
    }
  }
}

/// A season by its poster, or the show's, with how many episodes are left
/// to watch in its corner, or the check once none are. A long press offers
/// its tick, its heart, its download, and an admin's images.
private struct SeasonCard: View {
  let title: Title
  let season: Season
  let partial: CatalogSeason?
  @Environment(\.api) private var api
  @Environment(\.navigator) private var nav

  var body: some View {
    let name = seasonName(season.number)
    let watched = season.itemCount > 0 && season.watchedCount >= season.itemCount
    let left = season.itemCount - season.watchedCount
    CardButton(target: .season(title.summary, season, here: false), action: { nav.season(title.id, season.number) }) {
      PosterArt(name: Str.titleSeasonOf(title.name, name), poster: api?.art(season.poster ?? title.images.poster))
        .overlay(alignment: .topTrailing) {
          Group {
            if watched {
              WatchedBadge()
            } else {
              LeftCount(count: left > 0 ? left : season.itemCount)
            }
          }
          .padding(Space.s1_5)
        }
    } caption: {
      CardText(
        name,
        partial.map { Str.requestsSeasonPartial($0.availability.episodesHere, $0.availability.episodesAired) }
          ?? Str.mediaEpisodeCount(season.itemCount))
    }
  }
}

/// How many episodes are left, in the accent, as the web's season count.
private struct LeftCount: View {
  let count: Int
  @Environment(\.palette) private var palette

  var body: some View {
    Text(formatCount(count))
      .textStyle(.px11, weight: .semibold)
      .monospacedDigit()
      .foregroundStyle(palette.accentForeground)
      .padding(.horizontal, Space.s1_5)
      .frame(minWidth: 20, minHeight: 20)
      .background(palette.accent, in: Capsule())
      .kitShadow(.small)
      .accessibilityHidden(true)
  }
}

// MARK: Episodes

/// A row of a season's episodes, by their stills, that starts on `start`,
/// as the web's: kept from when it first showed, so marking one watched
/// doesn't scroll the row away under the finger. `rest` comes last, for the
/// episodes the server lacks.
struct EpisodesRail: View {
  let title: String
  let items: [MediaItem]
  var onTitleTap: (() -> Void)?
  var rest: AnyView?
  @Environment(\.gutter) private var gutter
  @Environment(\.windowSize) private var window
  @State private var position = ScrollPosition(idType: String.self)
  @State private var placed = false
  private let startId: String?

  init(title: String, items: [MediaItem], start: Int, onTitleTap: (() -> Void)? = nil, rest: AnyView? = nil) {
    self.title = title
    self.items = items
    self.onTitleTap = onTitleTap
    self.rest = rest
    startId = start > 0 && items.indices.contains(start) ? items[start].id : nil
  }

  var body: some View {
    VStack(alignment: .leading, spacing: Space.s3) {
      SectionTitle(title, action: onTitleTap).padding(.horizontal, gutter)
      ScrollView(.horizontal) {
        LazyHStack(alignment: .top, spacing: isWide(window) ? Space.s4 : Space.s3) {
          ForEach(items, id: \.id) { item in
            RailItem(.landscape) { EpisodeCard(itemShown(item), showName: false) }.id(item.id)
          }
          if let rest { RailItem(.landscape) { rest } }
        }
        .scrollTargetLayout()
      }
      .contentMargins(.horizontal, gutter, for: .scrollContent)
      .scrollIndicators(.hidden)
      .scrollTargetBehavior(.viewAligned)
      .scrollClipDisabled()
      .scrollPosition($position, anchor: .leading)
      // Once laid out, on to where it starts; never again, so it stays where the finger leaves it.
      .task {
        guard !placed, let startId else { return }
        placed = true
        try? await Task.sleep(for: .milliseconds(80))
        position.scrollTo(id: startId, anchor: .leading)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityElement(children: .contain)
  }
}

/// Play on a picture, not a button of its own: the kit's glass circle,
/// white over a dark blur whatever the theme, as `PlayGlyph` draws it, for
/// a picture that plays when it's pressed.
private struct PlayMark: View {
  let size: CGFloat
  @Environment(\.accessibilityReduceTransparency) private var reduceTransparency

  var body: some View {
    LucideIcon(.play, size: (size * 0.4).rounded(), tint: .white, scales: false)
      .frame(width: size, height: size)
      .background {
        if !reduceTransparency { Circle().fill(.ultraThinMaterial).environment(\.colorScheme, .dark) }
      }
      .background(reduceTransparency ? .black.opacity(0.6) : .white.opacity(0.15), in: Circle())
      .overlay { Circle().strokeBorder(.white.opacity(0.15), lineWidth: 1) }
      .accessibilityHidden(true)
  }
}

/// An episode as the web's `EpisodeRow`: its still, which opens its page,
/// with Play on it; its number and name, air date and length, and streams
/// beside it; what happens in it beside it from `sm` up, under it on a
/// phone. `marker` names it Play's: Next up, or Continue watching. A long
/// press offers the rest.
struct EpisodeEntry: View {
  let item: MediaItem
  var compact = false
  var marker: String?
  @Environment(\.api) private var api
  @Environment(\.navigator) private var nav
  @Environment(\.actions) private var actions
  @Environment(ViewerState.self) private var viewer: ViewerState?
  @Environment(\.windowSize) private var window
  @Environment(\.palette) private var palette

  var body: some View {
    let layout = TitleLayout(window: window)
    let label = itemLabel(item)
    let watched = viewer?.isWatched(item) ?? (item.progress?.completed ?? false)
    let overview = item.episode?.overview
    let code = compact ? (label.untitled ? nil : item.label.shortCode) : episodeCode(item)
    let still: CGFloat = layout.wide ? (layout.large ? 288 : 256) : (compact ? 152 : 184)
    VStack(alignment: .leading, spacing: Space.s2) {
      HStack(alignment: .top, spacing: layout.wide ? Space.s4 : Space.s3) {
        StillButton(item: item, watched: watched, glyph: compact ? 36 : 44)
          .frame(width: still)
        VStack(alignment: .leading, spacing: Space.s0_5) {
          if let marker {
            Text(marker).textStyle(.xs, weight: .semibold).foregroundStyle(palette.accent).lineLimit(1)
          }
          Pressable(
            shape: .kit(Radius.sm), wash: false, action: { nav.episode(item.id) },
            onLongPress: { actions?.open(.item(item, here: false)) }, longPressLabel: Str.titleMoreActions
          ) {
            VStack(alignment: .leading, spacing: Space.s0_5) {
              HStack(alignment: .firstTextBaseline, spacing: Space.s2) {
                if let code {
                  Text(code).textStyle(.sm).monospacedDigit().foregroundStyle(palette.mutedForeground)
                    .fixedSize()
                }
                Text(label.title)
                  .textStyle(layout.wide ? .px15 : .sm, weight: label.untitled ? .regular : .medium)
                  .foregroundStyle(palette.foreground)
                  .lineLimit(2)
              }
              let facts = episodeFacts(item, watched: watched)
              if !facts.isEmpty {
                Text(facts.joined(separator: " · ")).textStyle(.px13).monospacedDigit()
                  .foregroundStyle(palette.mutedForeground).lineLimit(1)
              }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .multilineTextAlignment(.leading)
            .contentShape(Rectangle())
          }
          StreamLine(item: item).padding(.top, Space.s0_5)
          if layout.wide, let overview {
            Text(overview).textStyle(.sm).foregroundStyle(palette.mutedForeground).lineLimit(3)
              .frame(maxWidth: 640, alignment: .leading)
              .padding(.top, Space.s1_5)
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      }
      // A phone puts what happens under the still, across the row.
      if !layout.wide, let overview {
        Text(overview).textStyle(.px13).foregroundStyle(palette.mutedForeground).lineLimit(compact ? 2 : 3)
      }
    }
    .accessibilityElement(children: .contain)
  }
}

/// An episode's still, opening its page, with Play on it, how far in the
/// person is, or the check.
private struct StillButton: View {
  let item: MediaItem
  let watched: Bool
  var glyph: CGFloat = 44
  @Environment(\.api) private var api
  @Environment(\.navigator) private var nav
  @Environment(\.actions) private var actions

  var body: some View {
    let label = itemLabel(item)
    let ratio = progressRatio(item)
    let resume = isResuming(item) && !watched
    Pressable(
      shape: .kit(Radius.md), action: { nav.episode(item.id) },
      onLongPress: { actions?.open(.item(item, here: false)) }, longPressLabel: Str.titleMoreActions
    ) {
      ArtFrame(label.showName, aspect: 16 / 9) {
        Picture(api?.landscape(item, size: .medium) ?? [])
        if watched {
          WatchedBadge().padding(Space.s1_5).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
        } else if let ratio, ratio > 0 {
          ArtProgressBar(progress: ratio)
        }
      }
    }
    .accessibilityLabel(label.title)
    .overlay {
      PlayGlyph(label: resume ? Str.mediaResumeNamed(label.title) : Str.mediaPlayNamed(label.title), size: glyph) {
        nav.play(item.id, nil)
      }
    }
  }
}

/// The episode Play starts on a show's page, as the web's `NextUp`:
/// "Continue watching" while it's in progress, "Next up" otherwise.
struct NextUpEpisode: View {
  let item: MediaItem
  @Environment(\.gutter) private var gutter

  var body: some View {
    VStack(alignment: .leading, spacing: Space.s3) {
      SectionTitle(item.progress != nil ? Str.titleNextUpContinue : Str.titleNextUpNext)
      EpisodeEntry(item: item).frame(maxWidth: 1024, alignment: .leading)
    }
    .padding(.horizontal, gutter)
  }
}

/// An episode's still beside its details, which plays it, lifted off the
/// backdrop by a deep shadow, as the web's.
struct StillFrame: View {
  let item: MediaItem
  let watched: Bool
  @Environment(\.api) private var api
  @Environment(\.navigator) private var nav
  @Environment(\.palette) private var palette

  var body: some View {
    let label = itemLabel(item)
    let ratio = progressRatio(item)
    let resume = isResuming(item) && !watched
    let name = resume ? Str.mediaResumeNamed(label.title) : Str.mediaPlayNamed(label.title)
    let shape = RoundedRectangle.kit(Radius.lg)
    Pressable(shape: .kit(Radius.lg), action: { nav.play(item.id, nil) }) {
      Tone(label.showName)
        .overlay { Picture(api?.landscape(item, size: .large) ?? []) }
        .overlay(alignment: .topTrailing) { if watched { WatchedBadge(size: 24).padding(Space.s2_5) } }
        .overlay(alignment: .bottom) {
          if !watched, let ratio, ratio > 0 { ArtProgressBar(progress: ratio, inset: Space.s3) }
        }
        .overlay { PlayMark(size: 64) }
        .aspectRatio(16 / 9, contentMode: .fit)
        .clipShape(shape)
        .overlay { shape.strokeBorder(palette.border) }
    }
    .kitShadow(.dialog)
    .accessibilityLabel(name)
  }
}
