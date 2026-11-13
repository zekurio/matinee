import MatineeCore
import SwiftUI

/*
 * TitleParts.kt: the pieces the title, season, and episode pages are made
 * of, as the web's title header, crew lines, seasons rail, and media info
 * draw them.
 */

/// How tall a title's backdrop is: most of a phone's upper half, never more than 420.
func backdropHeight(_ window: CGSize) -> CGFloat { min(window.height * 0.46, 420) }

/// How far down the backdrop a page's heading starts, so it overlaps the art's faded end.
func headingTop(_ window: CGSize) -> CGFloat { backdropHeight(window) - 150 }

/// Where a phone starts a heading without its poster or still, lower, for
/// more of the backdrop, as the web's `max(10rem, 30vh)`.
func phoneHeadingTop(_ window: CGSize) -> CGFloat { max(160, window.height * 0.3) }

/// The art across the top of a title's pages, faded into the page under the header.
struct Backdrop: View {
  let sources: [ImageSource]
  let toneKey: String
  @Environment(\.windowSize) private var window
  @Environment(\.palette) private var palette

  init(_ sources: [ImageSource?], toneKey: String) {
    self.sources = sources.compactMap(\.self)
    self.toneKey = toneKey
  }

  var body: some View {
    Tone(toneKey)
      .overlay { Picture(sources, alignment: .top) }
      // The web's two shades: from the start, where the text sits, and up
      // from the bottom into the page. The art stays a backdrop, so what
      // sits on it, a poster or an episode's still, stands out.
      .overlay {
        LinearGradient(
          stops: [
            .init(color: palette.background.opacity(0.95), location: 0),
            .init(color: palette.background.opacity(0.5), location: 0.5),
            .init(color: .clear, location: 1),
          ], startPoint: .leading, endPoint: .trailing)
      }
      .overlay {
        LinearGradient(
          stops: [
            .init(color: .clear, location: 0),
            .init(color: palette.background.opacity(0.7), location: 0.6),
            .init(color: palette.background, location: 1),
          ], startPoint: .top, endPoint: .bottom)
      }
      .frame(maxWidth: .infinity)
      .frame(height: backdropHeight(window))
      .clipped()
      .accessibilityHidden(true)
  }
}

/// Names joined as a sentence, each a link: "A, B and C". The sentence
/// wraps as text does, so a long list reads on as the web's does.
struct LinkedNames: View {
  let names: [String]
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
        var gap = AttributedString(index == names.count - 2 ? " \(Str.commonAnd) " : ", ")
        gap.foregroundColor = palette.muted
        text += gap
      }
    }
    return Text(text)
      .textStyle(.bodyMedium)
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

/// "Label  Value and Value", as the web lists directors, writers, and studios.
struct CreditLine: View {
  let label: String
  let names: [String]
  let onTap: (String) -> Void
  @Environment(\.palette) private var palette

  var body: some View {
    if !names.isEmpty {
      HStack(alignment: .firstTextBaseline, spacing: 8) {
        Text(label).textStyle(.bodyMedium).foregroundStyle(palette.muted)
        LinkedNames(names: names, color: palette.foreground, onTap: onTap)
          .frame(maxWidth: .infinity, alignment: .leading)
      }
    }
  }
}

/// An overview cut to a few lines, with More to read the rest.
struct Overview: View {
  let text: String
  var tagline: String?
  var lines = 3
  @State private var open = false
  @State private var cut: CGFloat = 0
  @State private var whole: CGFloat = 0
  @Environment(\.palette) private var palette

  init(_ text: String, tagline: String? = nil, lines: Int = 3) {
    self.text = text
    self.tagline = tagline
    self.lines = lines
  }

  var body: some View {
    let overflows = whole > cut + 1
    VStack(alignment: .leading, spacing: 0) {
      body(lines: open ? nil : lines)
        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { if !open { cut = $0 } }
        // The whole text, unseen, to know whether the cut one leaves some out.
        .background(alignment: .topLeading) {
          body(lines: nil)
            .fixedSize(horizontal: false, vertical: true)
            .hidden()
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { whole = $0 }
        }
      if overflows || open {
        Text(open ? Str.titleLess : Str.titleMore).textStyle(.bodyLarge).foregroundStyle(palette.muted)
          .accessibilityHidden(true)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .contentShape(Rectangle())
    .onTapGesture { if overflows || open { withMotion(Motion.move) { open.toggle() } } }
    .accessibilityElement(children: .combine)
    .accessibilityAction(named: open ? Str.titleLess : Str.titleMore) {
      if overflows || open { open.toggle() }
    }
  }

  private func body(lines: Int?) -> some View {
    let body = palette.foreground.opacity(0.85)
    let words: Text =
      if let tagline {
        Text("\(Text(tagline).fontWeight(.medium).foregroundStyle(palette.foreground))\n\(Text(text).foregroundStyle(body))")
      } else {
        Text(text).foregroundStyle(body)
      }
    return words.textStyle(.bodyLarge).lineLimit(lines)
  }
}

/// Play, then the trailer and the round watched, favorite, and more
/// buttons, as under a title's or episode's heading. Resume says the time
/// left beside it. The tick, as the web's, marks unwatched at once and asks
/// when the person watched `name` before marking it watched.
struct ActionRow: View {
  let play: MediaItem?
  let resume: Bool
  let name: String
  let watched: Bool
  let favorite: Bool
  var trailer: Trailer?
  let onWatched: (_ watched: Bool, _ watchedAt: String?) async throws -> Void
  let onFavorite: () async throws -> Void
  /// The page's menu; it leaves itself out when it would be empty.
  let more: ActionTarget

  @Environment(\.navigator) private var nav
  @Environment(\.actions) private var actions
  @Environment(\.snackbar) private var snackbar
  @Environment(\.openURL) private var openURL
  @Environment(\.windowSize) private var window
  @Environment(\.palette) private var palette

  var body: some View {
    let wide = isWide(window)
    HStack(spacing: 10) {
      playButton(wide: wide)
      if let trailer, let url = URL(string: trailer.url) {
        TrailerButton(wide: wide) { openURL(url) }
      }
      RoundIconButton(
        .check, label: watched ? Str.mediaMarkUnwatched : Str.mediaMarkWatched,
        tint: watched ? palette.accent : palette.foreground
      ) {
        if watched {
          launchShowing(snackbar, Str.mediaMarkUnwatchedFailed) { try await onWatched(false, nil) }
        } else {
          actions?.askWatched(name) { at in try await onWatched(true, at) }
        }
      }
      .accessibilityAddTraits(watched ? .isSelected : [])
      RoundIconButton(
        favorite ? .heartFilled : .heart, label: favorite ? Str.mediaRemoveFavorite : Str.mediaAddFavorite,
        tint: favorite ? palette.danger : palette.foreground
      ) {
        launchShowing(snackbar, Str.mediaFavoriteFailed) { try await onFavorite() }
      }
      ActionsButton(more)
      if wide { Spacer(minLength: 0) }
    }
    .padding(.horizontal, Gutter)
  }

  private func playButton(wide: Bool) -> some View {
    let label = resume ? Str.titleResume : Str.titlePlay
    let left = resume ? play.flatMap(timeLeft) : nil
    return Button {
      if let play { nav.play(play.id, nil) }
    } label: {
      HStack(spacing: 8) {
        LucideIcon(.play, size: 16)
        Text(label).layoutPriority(1)
        // On one line, as on a TV. The label stays whole; what's left over goes to the time.
        if let left {
          Text(left).foregroundStyle(palette.accentForeground.opacity(0.6)).lineLimit(1)
        }
      }
      // The button's width, not the words', is what's drawn.
      .frame(maxWidth: .infinity)
    }
    .buttonStyle(.matinee(.primary))
    .frame(width: wide ? 260 : nil)
    .disabled(play == nil)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel([label, left].compactMap(\.self).joined(separator: ", "))
    .accessibilityAddTraits(.isButton)
  }
}

/// The title's trailer, on YouTube: just the icon on phones, where Play
/// takes the row, and named beside it wider, as the web's.
private struct TrailerButton: View {
  let wide: Bool
  let action: () -> Void
  @Environment(\.palette) private var palette

  var body: some View {
    if wide {
      Button(action: action) {
        LucideIcon(.clapperboard, size: 16)
        Text(Str.iosTitleTrailer)
      }
      .buttonStyle(.matinee(.frosted))
      .accessibilityHint(Str.iosTitleTrailerHint)
    } else {
      RoundIconButton(.clapperboard, label: Str.iosTitleTrailer, action: action)
        .accessibilityHint(Str.iosTitleTrailerHint)
    }
  }
}

/// The title's name and facts, with its poster beside them when `poster`
/// says, as the web's title header.
struct TitleHeading: View {
  let title: Title
  let flags: [String]
  var poster = true
  @Environment(\.api) private var api
  @Environment(\.navigator) private var nav
  @Environment(\.windowSize) private var window
  @Environment(\.palette) private var palette

  var body: some View {
    HStack(alignment: .bottom, spacing: 16) {
      if poster {
        PosterArt(name: title.name, poster: api?.art(title.images.poster, size: .small))
          .frame(width: isWide(window) ? 180 : 112)
      }
      VStack(alignment: .leading, spacing: 0) {
        Text(title.name).textStyle(.headlineLarge).lineLimit(3).foregroundStyle(palette.foreground)
          .accessibilityAddTraits(.isHeader)
        if let original = title.originalName, original != title.name {
          Text(original).textStyle(.bodyLarge).foregroundStyle(palette.muted).lineLimit(1)
        }
        let facts = titleFacts(title)
        if !facts.isEmpty {
          Text(facts.joined(separator: " · ")).textStyle(.bodyMedium)
            .foregroundStyle(palette.foreground.opacity(0.8))
            .padding(.top, 8)
        }
        // The rating and the file's badges on a line of their own, so a
        // narrow screen doesn't strand the last one under the facts.
        if title.contentRating != nil || title.rating != nil || !flags.isEmpty {
          FlowRow(spacing: 8, lineSpacing: 6) {
            if let rating = title.contentRating { Badge(rating, outlined: true) }
            if let rating = title.rating {
              HStack(spacing: 4) {
                LucideIcon(.star, size: 14, tint: palette.star)
                Text(formatRating(rating)).textStyle(.bodyMedium).foregroundStyle(palette.foreground)
              }
              .accessibilityElement(children: .ignore)
              .accessibilityLabel("\(Str.mediaHeroRated) \(formatRating(rating))")
            }
            ForEach(flags, id: \.self) { Badge($0) }
          }
          .padding(.top, 6)
        }
        if !title.genres.isEmpty {
          LinkedNames(names: title.genres, color: palette.muted, onTap: nav.genre).padding(.top, 6)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.bottom, 4)
    }
    .padding(.horizontal, Gutter)
  }
}

/// Views side by side, wrapping onto more lines as they need, each line's
/// views centred on each other: Compose's `FlowRow`.
struct FlowRow: Layout {
  var spacing: CGFloat = 8
  var lineSpacing: CGFloat = 6

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    let lines = arrange(subviews, width: proposal.width ?? .infinity)
    let width = lines.map(\.width).max() ?? 0
    let height = lines.map(\.height).reduce(0, +) + lineSpacing * CGFloat(max(lines.count - 1, 0))
    return CGSize(width: proposal.width.map { min($0, width) } ?? width, height: height)
  }

  func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
    var y = bounds.minY
    for line in arrange(subviews, width: bounds.width) {
      var x = bounds.minX
      for index in line.indices {
        let size = subviews[index].sizeThatFits(.unspecified)
        subviews[index].place(
          at: CGPoint(x: x, y: y + (line.height - size.height) / 2), proposal: ProposedViewSize(size))
        x += size.width + spacing
      }
      y += line.height + lineSpacing
    }
  }

  private struct Line {
    var indices: [Int] = []
    var width: CGFloat = 0
    var height: CGFloat = 0
  }

  private func arrange(_ subviews: Subviews, width: CGFloat) -> [Line] {
    var lines: [Line] = []
    var line = Line()
    for index in subviews.indices {
      let size = subviews[index].sizeThatFits(.unspecified)
      let needed = line.indices.isEmpty ? size.width : line.width + spacing + size.width
      if !line.indices.isEmpty && needed > width {
        lines.append(line)
        line = Line()
      }
      line.width = line.indices.isEmpty ? size.width : line.width + spacing + size.width
      line.height = max(line.height, size.height)
      line.indices.append(index)
    }
    if !line.indices.isEmpty { lines.append(line) }
    return lines
  }
}

/// Directors, creators, writers, and studios, each a link to their page.
struct CrewLines: View {
  let credits: [Credit]
  let studios: [String]
  @Environment(\.navigator) private var nav

  var body: some View {
    let kinds = [CreditKind.creator, CreditKind.director, CreditKind.writer]
    let lines = kinds.map { ($0, creditNames(credits, $0)) }.filter { !$0.1.isEmpty }
    if !lines.isEmpty || !studios.isEmpty {
      VStack(alignment: .leading, spacing: 6) {
        ForEach(lines, id: \.0) { kind, names in
          CreditLine(label: creditKindName(kind, count: names.count), names: names, onTap: nav.person)
        }
        if !studios.isEmpty {
          CreditLine(label: Str.peopleStudio(studios.count), names: studios, onTap: nav.studio)
        }
      }
      .padding(.horizontal, Gutter)
    }
  }
}

/// The cast, by their portraits, each opening their page.
struct CastRail: View {
  let credits: [Credit]
  @Environment(\.api) private var api

  var body: some View {
    let cast = credits.filter { $0.kind == CreditKind.actor }
    if !cast.isEmpty {
      Rail(Str.titleCast) {
        ForEach(Array(cast.enumerated()), id: \.offset) { _, credit in
          RailItem(.person) {
            PersonCard(credit.name, role: credit.role, photo: api?.art(credit.photo, size: .thumb))
          }
        }
      }
    }
  }
}

/// A show's seasons by their posters, with how many episodes are left in
/// each. On a season's page, `current` leaves that season out.
struct SeasonsRail: View {
  let title: Title
  var current: Season?
  @Environment(\.navigator) private var nav

  var body: some View {
    let seasons = current.map { current in title.seasons.filter { $0.number != current.number } } ?? title.seasons
    if !seasons.isEmpty {
      Rail(current != nil ? Str.titleSeasonsMore : Str.titleSeasons) {
        ForEach(seasons, id: \.number) { season in
          RailItem(.poster) {
            SeasonCard(title: title, season: season) { nav.season(title.id, season.number) }
          }
        }
      }
    }
  }
}

private struct SeasonCard: View {
  let title: Title
  let season: Season
  let onTap: () -> Void
  @Environment(\.api) private var api
  @Environment(\.palette) private var palette

  var body: some View {
    let left = season.itemCount - season.watchedCount
    Button(action: onTap) {
      VStack(alignment: .leading, spacing: 0) {
        PosterArt(
          name: Str.titleSeasonOf(title.name, seasonName(season.number)),
          poster: api?.art(season.poster ?? title.images.poster)
        )
        .overlay(alignment: .topTrailing) {
          if left == 0 {
            WatchedBadge().padding(6)
          } else {
            Text(String(left)).textStyle(.labelSmall, weight: .semibold)
              .foregroundStyle(palette.accentForeground)
              .padding(.horizontal, 6)
              .padding(.vertical, 1)
              .background(palette.accent, in: Capsule())
              .padding(6)
          }
        }
        CardText(seasonName(season.number), Str.mediaEpisodeCount(season.itemCount))
      }
      .contentShape(Rectangle())
    }
    .buttonStyle(CardPress())
    .cardMenu(.season(title.summary, season, here: false))
    .accessibilityElement(children: .combine)
  }
}

/// Play over a still while a pointer hovers it, as the web shows it on a
/// desktop: an iPad with a trackpad. A touch has no hover; the still plays.
private struct HoverPlay: ViewModifier {
  let label: String
  let action: () -> Void
  @State private var hovered = false

  func body(content: Content) -> some View {
    content
      .overlay {
        if hovered { PlayGlyph(label: label, size: 64, action: action).transition(Motion.fade) }
      }
      .onHover { hovered = $0 }
  }
}

/// The episode up next on a show's page, as the web's EpisodeRow: a big
/// still that opens it, with Play on hover, its number and name, air date
/// and runtime, and what happens in it.
struct NextUpEpisode: View {
  let item: MediaItem
  @Environment(\.api) private var api
  @Environment(\.navigator) private var nav
  @Environment(ViewerState.self) private var viewer: ViewerState?
  @Environment(\.palette) private var palette

  var body: some View {
    let label = itemLabel(item)
    let ratio = progressRatio(item)
    let watched = viewer?.isWatched(item) ?? (item.progress?.completed ?? false)
    VStack(alignment: .leading, spacing: 0) {
      SectionTitle(item.progress != nil ? Str.titleNextUpContinue : Str.titleNextUpNext)
      Button { nav.episode(item.id) } label: {
        ArtFrame(label.showName, aspect: 16 / 9) {
          Picture(api?.landscape(item, size: .medium) ?? [])
          if watched {
            WatchedBadge().padding(8).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
          } else if let ratio, ratio > 0 {
            ProgressBar(progress: ratio).frame(maxHeight: .infinity, alignment: .bottom)
          }
        }
      }
      .buttonStyle(CardPress())
      .modifier(HoverPlay(label: Str.mediaPlayNamed(label.title)) { nav.play(item.id, nil) })
      .cardMenu(.item(item, here: false))
      .accessibilityLabel(label.title)
      .padding(.top, 12)
      Button { nav.episode(item.id) } label: {
        VStack(alignment: .leading, spacing: 0) {
          let heading = episodeNumber(item).map { Str.titleEpisodesCodedName($0, label.title) } ?? label.title
          Text(heading).textStyle(.titleMedium).lineLimit(2).foregroundStyle(palette.foreground)
          let detail = [
            formatDay(item.episode?.airDate),
            item.progress?.completed == false ? timeLeft(item) : formatRuntime(runtimeMinutes(item)),
          ].compactMap(\.self).joined(separator: " · ")
          if !detail.isEmpty {
            Text(detail).textStyle(.bodySmall).foregroundStyle(palette.muted)
          }
          if let overview = item.episode?.overview {
            Text(overview).textStyle(.bodyMedium).foregroundStyle(palette.foreground.opacity(0.8)).lineLimit(3)
              .padding(.top, 6)
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .multilineTextAlignment(.leading)
        .contentShape(Rectangle())
      }
      .buttonStyle(CardPress())
      .cardMenu(.item(item, here: false))
      .padding(.top, 10)
    }
    .padding(.horizontal, Gutter)
  }
}

/// An episode's still, which plays it, lifted off the backdrop by a shadow
/// as on the web. The whole still plays; Play shows on it on hover.
struct StillFrame: View {
  let item: MediaItem
  let watched: Bool
  @Environment(\.api) private var api
  @Environment(\.navigator) private var nav
  @Environment(\.windowSize) private var window
  @Environment(\.palette) private var palette

  var body: some View {
    let label = itemLabel(item)
    let ratio = progressRatio(item)
    let play = Str.mediaPlayNamed(label.title)
    Button { nav.play(item.id, nil) } label: {
      Tone(label.showName)
        .overlay { Picture(api?.landscape(item, size: .medium) ?? []) }
        .overlay(alignment: .topTrailing) { if watched { WatchedBadge(size: 24).padding(10) } }
        .overlay(alignment: .bottom) {
          if !watched, let ratio, ratio > 0 { ProgressBar(progress: ratio) }
        }
        .aspectRatio(16 / 9, contentMode: .fit)
        .clipShape(ControlShape)
        .overlay { ControlShape.strokeBorder(palette.border) }
        .shadow(color: .black.opacity(0.5), radius: 24, y: 8)
    }
    .buttonStyle(CardPress())
    .modifier(HoverPlay(label: play) { nav.play(item.id, nil) })
    // A still as wide as an iPad in landscape would be taller than the screen; it stops at half its height.
    .frame(maxWidth: window.height * 0.55 * 16 / 9)
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.horizontal, Gutter)
    .accessibilityLabel(play)
  }
}

/// What a file holds, a line each with its icon: the picture, the audio,
/// and the subtitles, from `fileInfo`.
struct MediaInfo: View {
  let item: MediaItem
  @State private var tracks = Loader<FileTracks>()

  init(_ item: MediaItem) { self.item = item }

  var body: some View {
    Group {
      if let info = fileInfo(item, tracks: tracks.state.value) {
        VStack(alignment: .leading, spacing: 6) {
          if let video = info.video { InfoLine(icon: .film, label: Str.mediaInfoVideo, text: video) }
          if let audio = info.audio { InfoLine(icon: .audioLines, label: Str.mediaInfoAudio, text: audio) }
          if let subtitles = info.subtitles {
            InfoLine(icon: .captions, label: Str.mediaInfoSubtitles, text: subtitles)
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      }
    }
    .loads(tracks) { [id = item.id] api in try await FileTracks.load(api, id) }
  }
}

private struct InfoLine: View {
  let icon: Lucide
  let label: String
  let text: String
  @Environment(\.palette) private var palette

  var body: some View {
    HStack(alignment: .firstTextBaseline, spacing: 10) {
      // Level with the first line of text, which may wrap.
      LucideIcon(icon, label: label, size: 16, tint: palette.muted)
        .alignmentGuide(.firstTextBaseline) { $0[VerticalAlignment.center] + 5 }
      Text(text).textStyle(.bodyMedium).foregroundStyle(palette.foreground.opacity(0.8)).lineLimit(3)
    }
    .accessibilityElement(children: .combine)
  }
}
