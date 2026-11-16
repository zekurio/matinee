import MatineeCore
import MatineeKit
import SwiftUI

/*
 * CatalogCards.kt, after the web's catalog-card.tsx and
 * catalog-season-card.tsx: a title the server doesn't have, the size of a
 * `PosterCard` so it sits in the same rails and grids, its state in a
 * glass mark in the corner, where a library title's watched check sits,
 * and on its second line. Phones have no controls on posters: a tap opens
 * the title's page, where Request is. When the title arrives, the mark
 * fills and goes, and the card becomes the library's on the same poster.
 *
 *     RailItem(.poster) { CatalogCard(title) }
 *     CardGrid { ForEach(titles, id: \.ref) { CatalogCard($0) } }
 */

/// How long the mark takes to go when a title arrives, before the card becomes the library's.
private let ARRIVAL: Duration = .milliseconds(200)

/// The round glass mark in a catalog card's corner, once the title has a
/// state; nothing before, so a card carries no permanent plus. Glass means
/// not here; the accent check means watched, and the two never meet.
/// `leaving` fills the ring and lets it go, for an arrival.
struct CatalogBadge: View {
  let availability: Availability
  var leaving = false
  var size: CGFloat = 24
  @Environment(\.palette) private var palette
  @State private var gone = false

  var body: some View {
    let badge = leaving ? RequestBadge(.ring, progress: 1) : availability.badge
    if let badge {
      glyph(badge)
        .frame(width: size, height: size)
        .glassBackground(in: Circle())
        .overlay { Circle().strokeBorder(palette.foreground.opacity(0.1)) }
        .opacity(gone ? 0 : 1)
        .scaleEffect(gone ? 0.5 : 1)
        .onAppear {
          guard leaving else { return }
          withMotion(Motion.exit) { gone = true }
        }
        .accessibilityElement()
        .accessibilityLabel(
          leaving ? Str.webCatalogBadgeHere : availability.stateWord(today: todayDay(), percent: true).map(requestStateText) ?? "")
    }
  }

  @ViewBuilder private func glyph(_ badge: RequestBadge) -> some View {
    let glyph = (size * 0.58).rounded()
    switch badge.glyph {
    case .clock: LucideIcon(.clock, size: glyph, tint: palette.foreground)
    case .calendar: LucideIcon(.calendar, size: glyph, tint: palette.foreground)
    case .slash: LucideIcon(.circleSlash, size: glyph, tint: palette.mutedForeground)
    case .ring: ProgressRing(badge.progress, size: (size * 0.84).rounded())
    }
  }
}

/// The accent dot on a title that came through the viewer's own ask, until they've watched it.
struct FreshDot: View {
  @Environment(\.palette) private var palette

  var body: some View {
    Circle().fill(palette.accent).frame(width: Space.s2, height: Space.s2)
      .accessibilityElement()
      .accessibilityLabel(Str.webCatalogBadgeFresh)
  }
}

/// A title the server doesn't have, as its poster: the state in the corner
/// and on the second line, live from the server while its page follows it.
/// A tap opens its page. When it arrives, the mark goes and the card becomes
/// the library's. `detail` stands in for the year and kind while there's no
/// state, as Coming soon's day does; `hereAtFirst` is a title already here
/// when the list loaded, the library's card at once; `fresh`, one the viewer
/// asked for, which keeps the accent dot until they've watched it;
/// `recommended`, a recommendation, whose long press offers "Not interested".
struct CatalogCard: View {
  let title: CatalogTitleSummary
  var detail: String?
  var library: String?
  var hereAtFirst = false
  var fresh = false
  var recommended = false
  @Environment(\.requests) private var hub
  @State private var faded = false

  init(
    _ title: CatalogTitleSummary, detail: String? = nil, library: String? = nil, hereAtFirst: Bool = false,
    fresh: Bool = false, recommended: Bool = false
  ) {
    self.title = title
    self.detail = detail
    self.library = library
    self.hereAtFirst = hereAtFirst
    self.fresh = fresh
    self.recommended = recommended
  }

  var body: some View {
    let availability = hub?.availability(title.ref, title.availability) ?? title.availability
    let here = availability.arrivedTitleId
    Group {
      if let here, faded || hereAtFirst {
        ArrivedCard(title: title, titleId: here, fresh: fresh || (!hereAtFirst && availability.askedBySelf))
      } else {
        CatalogPosterCard(
          title: title, availability: availability, detail: detail, library: library, leaving: here != nil,
          recommended: recommended)
      }
    }
    .task(id: here) {
      guard here != nil, !faded else { return }
      try? await Task.sleep(for: ARRIVAL)
      withMotion(Motion.enter) { faded = true }
    }
  }
}

/// A catalog card's poster and lines.
private struct CatalogPosterCard: View {
  let title: CatalogTitleSummary
  let availability: Availability
  let detail: String?
  let library: String?
  let leaving: Bool
  let recommended: Bool
  @Environment(\.api) private var api
  @Environment(\.navigator) private var nav
  @Environment(\.actions) private var actions
  @Environment(\.snackbar) private var snackbar
  @Environment(\.offline) private var offline

  var body: some View {
    let line = requestCardLine(year: title.year, ref: title.ref, availability: availability, detail: detail)
    let notInterested: (() -> Void)? =
      recommended && !offline
      ? {
        guard let api else { return }
        actions?.hideRecommendation(title.ref, name: title.name, api: api, snackbar: snackbar)
      } : nil
    VStack(alignment: .leading, spacing: 0) {
      Pressable(
        shape: .kit(Radius.md), action: { if !offline { nav.catalog(title.ref, library) } },
        onLongPress: notInterested, longPressLabel: Str.webDiscoverNotInterestedNamed(title.name)
      ) {
        PosterArt(name: title.name, poster: api?.art(title.poster))
          .overlay(alignment: .topTrailing) {
            CatalogBadge(availability: availability, leaving: leaving).padding(Space.s1_5)
          }
      }
      CardText(title.name, line)
        .contentShape(Rectangle())
        .onTapGesture { if !offline { nav.catalog(title.ref, library) } }
        .accessibilitySortPriority(1)
    }
    .accessibilityElement(children: .combine)
    .accessibilityAddTraits(.isButton)
  }
}

/// A title that came in through a request, as the library's card on the
/// poster the request had, so the picture doesn't change; while it's
/// `fresh`, the accent dot until the viewer has watched it.
struct ArrivedCard: View {
  let title: CatalogTitleSummary
  let titleId: String
  let fresh: Bool
  @State private var library = Loader<Title>()
  @Environment(\.api) private var api
  @Environment(\.navigator) private var nav
  @Environment(ViewerState.self) private var viewer: ViewerState?

  var body: some View {
    Group {
      if let summary = library.state.value?.summary {
        PosterCard(summary, detail: formatYear(summary.year), poster: title.poster ?? summary.images.poster)
          .overlay(alignment: .topTrailing) {
            if fresh && !(viewer?.isWatched(summary) ?? summary.watched) { FreshDot().padding(10) }
          }
      } else {
        Pressable(shape: .kit(Radius.md), wash: false, action: { nav.titleId(titleId) }) {
          VStack(alignment: .leading, spacing: 0) {
            PosterArt(name: title.name, poster: api?.art(title.poster))
            CardText(title.name, formatYear(title.year))
          }
        }
        .accessibilityElement(children: .combine)
      }
    }
    .loads(library) { [titleId] api in try await api.titles.get(id: titleId) }
  }
}

/// A season of a show the server lacks, by its poster, with its own state
/// in the corner and on the second line. While it can be asked for, a tap
/// calls `onRequest`, which opens the request sheet with that season ticked.
struct CatalogSeasonCard: View {
  let showName: String
  let showPoster: Artwork?
  let season: CatalogSeason
  let onRequest: () -> Void
  @Environment(\.api) private var api

  var body: some View {
    let availability = season.availability.asTitle
    let label = seasonName(season.number)
    let line = requestSeasonLine(season)
    let card = VStack(alignment: .leading, spacing: 0) {
      PosterArt(name: requestSeasonOf(showName, season.number), poster: api?.art(season.poster ?? showPoster))
        .overlay(alignment: .topTrailing) { CatalogBadge(availability: availability).padding(Space.s1_5) }
      CardText(label, line)
    }
    Group {
      if availability.posterAction == .request {
        Pressable(shape: .kit(Radius.md), wash: false, action: onRequest) { card }
          .accessibilityHint(Str.webAskAsk)
      } else {
        card
      }
    }
    .accessibilityElement(children: .combine)
    .accessibilityLabel("\(requestSeasonOf(showName, season.number)), \(line)")
  }
}

/// A bar of how much is in, with the share beside it, as Android's `ProgressLine`.
struct RequestProgressLine: View {
  let progress: Double
  @Environment(\.palette) private var palette

  var body: some View {
    HStack(spacing: Space.s3) {
      ProgressBar(progress, height: 6)
      Text(formatPercent(progress)).textStyle(.sm).foregroundStyle(palette.mutedForeground).monospacedDigit()
    }
  }
}
