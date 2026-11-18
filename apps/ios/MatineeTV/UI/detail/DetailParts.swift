import MatineeCore
import MatineeKit
import SwiftUI

/*
 * DetailParts.kt: what the title, season, and episode pages share. The
 * page as a header over the backdrop and rows under it (`DetailScroll`),
 * the header's column, its facts, overview, and file, the buttons under
 * it (`DetailActions`), and the page while it loads or failed.
 *
 * While the header's buttons have focus the page sits at its top; once a
 * row has it, the row scrolls up to a fixed line clear of the clock, as
 * Home's rows do, and the header goes up out of the way.
 */

/// Where the header starts, level with the clock.
let DETAIL_HEADER_TOP: CGFloat = TVOverscan.vertical + 8
/// How wide the header's running text goes, clear of the art at the right.
let DETAIL_TEXT_WIDTH: CGFloat = 1120
/// How far down the focused row's heading rests once the header is away: clear of the clock.
private let ROW_PIVOT: CGFloat = 136
/// How far down rows that scroll past the top fade out.
private let TOP_FADE: CGFloat = 132
/// The scroll view's id for the page's top.
private let DETAIL_TOP = "detail-top"

/// Focus memory keys shared by the pages.
enum DetailKey {
  /// The header's buttons, and Play, the one first focus lands on.
  static let actions = "actions"
  static let play = "play"
  static let watched = "watched"
  /// A show's seasons as tabs, on a season's page.
  static let tabs = "tabs"
}

// MARK: The page

/// A detail page: `header` over the backdrop, then `rows`, reached with
/// Down. While a row in `headerRows` has focus the page sits at its top;
/// once another row has it, that row scrolls to rest under the clock, as
/// Home's rows do. Give each row `.detailRow(key)`. A row in `freeRows`,
/// like a season's list of episodes stacked one under another, scrolls
/// only as far as its focused card needs, as a list does on Apple TV.
struct DetailScroll<Header: View, Rows: View>: View {
  let memory: TVFocusMemory
  var headerRows: Set<String> = [DetailKey.actions]
  var freeRows: Set<String> = []
  /// Room after the last row, so it too can rise to where the focused row rests.
  var bottomRoom: CGFloat = 880
  /// Rows that rest where another does, as a notice standing in for a row.
  var restsAs: [String: String] = [:]
  /// Rests the row again as focus moves within it, for rows the focus engine
  /// scrolls itself, as across a chart's squares, which can carry the row up
  /// under the clock.
  var followsItems = false
  @ViewBuilder let header: () -> Header
  @ViewBuilder let rows: () -> Rows
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  var body: some View {
    // The page has scrolled once a row below the header has focus.
    let scrolled = memory.lastRow.map { !headerRows.contains($0) } ?? false
    ScrollViewReader { reader in
      ScrollView(.vertical) {
        VStack(alignment: .leading, spacing: TVSpace.rows) {
          header().id(DETAIL_TOP)
          rows()
        }
        .padding(.bottom, bottomRoom)
        .frame(maxWidth: .infinity, alignment: .leading)
      }
      .scrollIndicators(.hidden)
      .onChange(of: memory.lastRow) { _, row in scroll(reader, row: row) }
      .onChange(of: followsItems ? memory.lastItem : nil) {
        let row = memory.lastRow
        DispatchQueue.main.async { scroll(reader, row: row) }
      }
    }
    // Rows that go up past the top fade out there rather than end at a hard edge under the clock.
    .mask {
      VStack(spacing: 0) {
        // Gone above the clock's line, then in by the focused row's heading.
        LinearGradient(
          stops: [.init(color: .clear, location: 0), .init(color: .clear, location: 0.55), .init(color: .black, location: 1)],
          startPoint: .top, endPoint: .bottom
        )
        .frame(height: scrolled ? TOP_FADE : 0)
        Color.black
      }
    }
  }

  private func scroll(_ reader: ScrollViewProxy, row: String?) {
    guard let row, !freeRows.contains(row) else { return }
    let target = headerRows.contains(row) ? DETAIL_TOP : detailAnchor(restsAs[row] ?? row)
    withAnimation(Motion.animation(Motion.move, reduceMotion: reduceMotion)) {
      reader.scrollTo(target, anchor: .top)
    }
  }
}

private func detailAnchor(_ row: String) -> String { "pivot/\(row)" }

extension View {
  /// A row of a `DetailScroll` under `key`: where it rests once it has
  /// focus, `ROW_PIVOT` below the top, marked by a point that far above it.
  func detailRow(_ key: String) -> some View {
    VStack(alignment: .leading, spacing: 0) {
      Color.clear.frame(height: ROW_PIVOT).id(detailAnchor(key)).accessibilityHidden(true)
      self
    }
    .padding(.top, -ROW_PIVOT)
  }
}

/// A page that shows nothing until its load: a spinner while it loads, why
/// it failed with Try again, focused, or `content` once it's there.
struct DetailState<T: Sendable, Content: View>: View {
  let loader: Loader<T>
  let error: String
  @ViewBuilder let content: (T) -> Content
  @FocusState private var retryFocused: Bool

  var body: some View {
    switch loader.state {
    case .loading: TVLoadingRow().frame(maxHeight: .infinity)
    case .failed(let message, _):
      TVMessage(
        error, message: message, action: TVNoticeAction(Str.commonRetry, icon: .refreshCw, action: loader.reload),
        actionFocus: $retryFocused
      )
      .tvPageFocus($retryFocused)
    case .ready(let value): content(value)
    }
  }
}

/// The page's backdrop: the first of `sources` that loads, behind everything.
struct DetailBackdrop: View {
  let sources: [ImageSource]

  var body: some View {
    TVBackdrop(sources.isEmpty ? nil : sources) { sources in Picture(sources, alignment: .topTrailing) }
  }
}

// MARK: The header

/// The header's column, from the top of the page at its start.
struct HeaderColumn<Content: View>: View {
  @ViewBuilder let content: () -> Content

  var body: some View {
    VStack(alignment: .leading, spacing: 0) { content() }
      .padding(.leading, TVPage.start)
      .padding(.trailing, TVPage.end)
      .padding(.top, DETAIL_HEADER_TOP)
      .frame(maxWidth: .infinity, alignment: .leading)
  }
}

/// Year, length, and the like, then the age rating in a box, the score by
/// its star, and the file's badges, as Android's `DetailFacts`.
struct DetailFacts: View {
  let facts: [String]
  var contentRating: String?
  var rating: Double?
  var flags: [String] = []
  @Environment(\.palette) private var palette

  var body: some View {
    if !facts.isEmpty || contentRating != nil || rating != nil || !flags.isEmpty {
      HStack(spacing: 32) {
        TVFacts(
          TVItemInfo(name: "", facts: facts, contentRating: contentRating, rating: rating.map(formatRating)),
          ratingLabel: Str.mediaHeroRated)
        ForEach(flags, id: \.self) { flag in
          Text(flag).textStyle(.caption).lineLimit(1)
            .foregroundStyle(palette.foreground.opacity(0.85))
            .padding(.horizontal, 16)
            .padding(.vertical, 2)
            .overlay { RoundedRectangle.kit(TVRadius.sm).strokeBorder(palette.foreground.opacity(0.4), lineWidth: 2) }
        }
      }
    }
  }
}

/// An overview cut to `lines`, with the tagline over it.
struct DetailOverview: View {
  let text: String
  var tagline: String?
  var lines = 3
  @Environment(\.palette) private var palette

  var body: some View {
    VStack(alignment: .leading, spacing: 4) {
      if let tagline {
        Text(tagline).textStyle(.facts).foregroundStyle(palette.foreground).lineLimit(1)
      }
      Text(text).textStyle(.body).foregroundStyle(palette.foreground.opacity(0.78)).lineLimit(lines)
    }
    .frame(width: DETAIL_TEXT_WIDTH, alignment: .leading)
  }
}

/// The overview, and beside it what the file holds: the header's middle.
struct DetailAbout: View {
  let overview: String?
  var tagline: String?
  var lines = 3
  /// The file whose picture, audio, and subtitles show beside the overview.
  var file: MediaItem?

  var body: some View {
    if overview != nil || file != nil {
      HStack(alignment: .top, spacing: TVSpace.s8) {
        if let overview { DetailOverview(text: overview, tagline: tagline, lines: lines) }
        if let file { FileInfoLines(item: file).frame(width: 420, alignment: .leading) }
      }
    }
  }
}

/// What a file holds, a line each with its icon, set small beside the
/// overview: the server's track lists once they load, the probe's until then.
struct FileInfoLines: View {
  let item: MediaItem
  @State private var tracks = Loader<FileTracks>()

  var body: some View {
    Group {
      if let info = fileInfo(item, tracks: tracks.state.value) {
        VStack(alignment: .leading, spacing: 12) {
          if let video = info.video { InfoLine(icon: .film, label: Str.mediaInfoVideo, text: video) }
          if let audio = info.audio { InfoLine(icon: .audioLines, label: Str.mediaInfoAudio, text: audio) }
          if let subtitles = info.subtitles {
            InfoLine(icon: .captions, label: Str.mediaInfoSubtitles, text: subtitles)
          }
        }
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
    HStack(alignment: .top, spacing: 16) {
      LucideIcon(icon, label: label, size: 32, tint: palette.mutedForeground, scales: false).padding(.top, 4)
      Text(text).textStyle(.caption).foregroundStyle(palette.foreground.opacity(0.8)).lineLimit(2)
    }
    .accessibilityElement(children: .combine)
  }
}

// MARK: The buttons

/// What a page's watched mark and heart do, and what Play starts.
struct DetailMarks {
  /// The file Play starts, nil when there's nothing to play.
  var play: MediaItem?
  /// What Play says after its label: the episode it starts, the time left.
  var playDetail: String?
  /// Play from the start beside Play, for a file in progress.
  var restart = false
  var trailer: Trailer?
  /// The name the watched question asks about.
  let name: String
  let watched: Bool
  /// Nil leaves the tick out, for what has nothing to mark.
  let onWatched: ((_ watched: Bool, _ watchedAt: String?) async throws -> Void)?
  /// Nil leaves the heart out, for what can't be a favorite.
  let favorite: Bool?
  let onFavorite: (() async throws -> Void)?
}

/// A page's buttons in one remembered row: Play, or Resume with what it
/// starts, Play from the start while it's in progress, the trailer, the
/// tick, which asks when before marking watched, the heart, the ways up
/// to the season and the show, and `more`, what else the page offers, in
/// a panel of its own.
struct DetailActions: View {
  let marks: DetailMarks
  let memory: TVFocusMemory
  /// Ways to the pages above this one, as icons after the heart: its season, its show.
  var links: [TVAction] = []
  var more: [DetailMoreRow] = []
  var moreTitle: String = ""
  var moreSubtitle: String?
  @FocusState private var focused: String?
  @State private var showingMore = false
  @Environment(\.navigator) private var nav
  @Environment(\.snackbar) private var snackbar
  @Environment(\.tvActions) private var actions
  @Environment(\.openURL) private var openURL
  @Environment(\.palette) private var palette

  /// Where focus starts in the row: Play, else the tick.
  static func first(_ marks: DetailMarks) -> String { marks.play != nil ? DetailKey.play : DetailKey.watched }

  var body: some View {
    HStack(spacing: TVButtons.gap) {
      if let play = marks.play {
        TVButton(isResuming(play) ? Str.titleResume : Str.titlePlay, icon: .play, detail: marks.playDetail) {
          nav.play(play.id, nil)
        }
        .focused($focused, equals: DetailKey.play)
        if marks.restart {
          TVIconButton(.rotateCcw, label: Str.actionsPlayFromStart) { nav.play(play.id, 0) }
            .focused($focused, equals: "restart")
        }
      }
      if let trailer = marks.trailer, let url = URL(string: trailer.url) {
        TVIconButton(.clapperboard, label: Str.iosTitleTrailer) {
          // A TV may have nothing that opens the link, YouTube's app or another.
          openURL(url) { opened in
            if !opened { snackbar.show(Str.iosTvTitleTrailerFailed) }
          }
        }
        .focused($focused, equals: "trailer")
      }
      if let onWatched = marks.onWatched {
        let watched = marks.watched
        TVIconButton(
          watched ? .circleCheck : .check, label: watched ? Str.mediaMarkUnwatched : Str.mediaMarkWatched,
          tint: watched ? palette.accent : nil
        ) {
          if watched {
            launchShowing(snackbar, Str.mediaMarkUnwatchedFailed) { try await onWatched(false, nil) }
          } else {
            actions?.panel = .watched(TVWatchedAsk(name: marks.name) { at in try await onWatched(true, at) })
          }
        }
        .focused($focused, equals: DetailKey.watched)
      }
      if let favorite = marks.favorite, let onFavorite = marks.onFavorite {
        TVIconButton(
          favorite ? .heartFilled : .heart, label: favorite ? Str.mediaRemoveFavorite : Str.mediaAddFavorite,
          tint: favorite ? palette.destructive : nil
        ) {
          launchShowing(snackbar, Str.mediaFavoriteFailed) { try await onFavorite() }
        }
        .focused($focused, equals: "favorite")
      }
      ForEach(links) { link in
        TVIconButton(link.icon ?? .chevronRight, label: link.label, action: link.action)
          .focused($focused, equals: link.id)
      }
      if !more.isEmpty {
        TVIconButton(.ellipsis, label: Str.titleMoreActions) { showingMore = true }
          .focused($focused, equals: "more")
      }
    }
    .tvFocusRow(DetailKey.actions, memory: memory, focused: $focused, first: Self.first(marks))
    .tvSidePanel(isPresented: $showingMore, title: moreTitle, description: moreSubtitle) {
      DetailMoreRows(rows: more)
    }
  }
}

/// A row in a page's More panel: a title and a line under it, as a movie's
/// file with where it sits and how long it runs.
struct DetailMoreRow: Identifiable {
  let id: String
  let title: String
  var subtitle: String?
  var icon: Lucide?
  let action: @MainActor () -> Void
}

private struct DetailMoreRows: View {
  let rows: [DetailMoreRow]
  @FocusState private var focused: String?
  @Environment(\.overlayDismiss) private var dismiss

  var body: some View {
    ForEach(rows) { row in
      TVListItem(row.title, subtitle: row.subtitle, icon: row.icon, quiet: true) { dismiss(then: row.action) }
        .focused($focused, equals: row.id)
    }
    .defaultFocus($focused, rows.first?.id)
  }
}

/// What Play says after Resume or Play: the episode it starts, "S1, E3",
/// and while it's in progress the time left, "S1, E3 · 18 min left".
func playDetail(_ item: MediaItem?, showsEpisode: Bool) -> String? {
  guard let item else { return nil }
  let parts = [showsEpisode ? episodeCode(item) : nil, isResuming(item) ? timeLeft(item) : nil].compactMap(\.self)
  return parts.isEmpty ? nil : parts.joined(separator: " · ")
}
