import MatineeCore
import MatineeKit
import SwiftUI

/*
 * ShowGaps.kt, for the title and season pages: what the server lacks of a
 * show in the library, as its provider lists it. The seasons that aren't
 * here end the seasons rail, each with its state; a season only partly
 * here ends its episodes with the ask for the rest. As the web's
 * show-gaps.ts and rest-of-season.tsx. Loading, the retries while a new
 * show isn't matched yet, and the live state are MatineeCore's
 * `RequestShowGaps` and `RequestLiveController` (Requests/); the words for
 * a state, requests/RequestWords.swift's.
 *
 * The request sheet, Android's `RequestSheet`, is the requests screens'
 * (requests/RequestSheet.swift): a missing season's card opens it through
 * `openSeasonRequest`.
 */

/// A show's gaps on its page, with each season's state as the server
/// streams it while the page shows. Nothing for a film, until they load,
/// and when the provider can't say, so the page shows only what's here.
@Observable final class TitleGaps {
  let gaps = RequestShowGaps()
  /// The seasons asked for from this page, while the ask is out.
  private(set) var asking: Set<Int> = []
  @ObservationIgnored private var live: RequestLiveController?
  @ObservationIgnored private var titleId: String?
  @ObservationIgnored private var libraryId: String?

  private var state: RequestAvailabilityState { live?.state ?? RequestAvailabilityState() }

  var ref: CatalogRef? { gaps.data?.ref }
  var missing: [CatalogSeason] { gaps.data == nil ? [] : gaps.missing(using: state) }
  /// Nothing of the show is asked for yet, so an ask may be taken back.
  var first: Bool { gaps.first(using: state) }

  func partial(_ number: Int?) -> CatalogSeason? {
    guard gaps.data != nil, let number else { return nil }
    return gaps.partial(using: state).first { $0.number == number }
  }

  /// Loads `title`'s gaps, retrying while it isn't matched yet, and follows
  /// their state. `recovered` runs when a retry succeeds, for the page to
  /// fetch the title again, which has its details by then.
  func load(_ api: MatineeApi, title: Title, recovered: @escaping @MainActor () -> Void) async {
    guard title.isShow else { return }
    titleId = title.id
    libraryId = title.libraryId
    if live == nil {
      live = RequestLiveController(api: api) { [weak self] in await self?.reload(api) }
    }
    let id = title.id
    await gaps.load(fetch: { try await api.catalog.missingSeasons(titleId: id) }, recovered: { recovered() })
    follow()
  }

  /// Fetches the gaps again, as the live state asks after a change it
  /// can't say: a season that arrived, or one more episode.
  private func reload(_ api: MatineeApi) async {
    guard let titleId else { return }
    await gaps.load(fetch: { try await api.catalog.missingSeasons(titleId: titleId) })
    follow()
  }

  private func follow() {
    live?.updateVisible(gaps.data.map { [CatalogInput(ref: $0.ref, libraryId: libraryId)] } ?? [])
  }

  /// Stops following, as the page goes.
  func hide() { live?.hide() }

  /// Asks for the rest of `season`, which is only partly here.
  func askRest(_ season: CatalogSeason, name: String, api: MatineeApi, snackbar: Snackbar) {
    guard let ref, !asking.contains(season.number) else { return }
    let input = CatalogInput(ref: ref, libraryId: libraryId)
    asking.insert(season.number)
    Task {
      defer { asking.remove(season.number) }
      do {
        _ = try await RequestActions(api: api).ask(input, scope: ShowScope(seasons: [season.number], future: false))
        snackbar.show(Str.webAskToastAsked(name))
        await reload(api)
      } catch {
        launchShowing(snackbar, Str.webAskToastFailed(name)) { throw error }
      }
    }
  }
}

/// Opens the request sheet for `season` of the show `gaps` is of, as a
/// missing season's card does on Android (`RequestSheet` with `only`).
@MainActor func openSeasonRequest(title: Title, season: CatalogSeason, gaps: TitleGaps, requests: RequestsHub?) {
  guard let ref = gaps.ref else { return }
  requests?.open(
    RequestSheetModel(
      ref: ref, name: title.name, seasons: gaps.missing, first: gaps.first, defaultFuture: false,
      libraryId: title.libraryId, only: season.number, availability: season.availability.asTitle))
}

/// A season the server lacks, at the end of the seasons rail: its poster,
/// or the show's, with its state in the corner and under its name. While
/// it can be asked for, a tap asks (`openSeasonRequest`).
struct MissingSeasonCard: View {
  let title: Title
  let season: CatalogSeason
  let gaps: TitleGaps
  @Environment(\.api) private var api
  @Environment(\.requests) private var requests

  var body: some View {
    let label = seasonName(season.number)
    let line = requestSeasonLine(season)
    let asks = season.availability.asks
    let card = VStack(alignment: .leading, spacing: 0) {
      PosterArt(name: Str.titleSeasonOf(title.name, label), poster: api?.art(season.poster ?? title.images.poster))
        .opacity(0.55)
        .overlay(alignment: .topTrailing) {
          if let badge = season.availability.badge { RequestStateBadge(badge: badge).padding(Space.s1_5) }
        }
      CardText(label, line)
    }
    Group {
      if asks {
        Pressable(shape: .kit(Radius.md), wash: false, action: { openSeasonRequest(title: title, season: season, gaps: gaps, requests: requests) }) {
          card
        }
      } else {
        card
      }
    }
    .accessibilityElement(children: .combine)
    .accessibilityLabel("\(Str.titleSeasonOf(title.name, label)), \(line)")
  }
}

/// What the server says of a title or season it lacks, over its poster, as
/// the web's catalog badge: asked, coming with how far, a release date, or
/// not to be had.
struct RequestStateBadge: View {
  let badge: RequestBadge
  @Environment(\.palette) private var palette

  var body: some View {
    Group {
      switch badge.glyph {
      case .ring: ProgressRing(badge.progress, size: 16)
      case .clock: LucideIcon(.clock, size: 14, tint: palette.foreground)
      case .calendar: LucideIcon(.calendar, size: 14, tint: palette.foreground)
      case .slash: LucideIcon(.circleSlash, size: 14, tint: palette.mutedForeground)
      }
    }
    .frame(width: 24, height: 24)
    .glassBackground(in: Circle())
    .accessibilityHidden(true)
  }
}

/// The end of a season's episodes when only some are here: how many more
/// there are, in a dashed frame the size of an episode's still, with the
/// season's state once there is one, and "Request the rest" while it can be
/// asked for.
struct SeasonRestCard: View {
  let title: Title
  let season: CatalogSeason
  let gaps: TitleGaps
  @Environment(\.api) private var api
  @Environment(\.snackbar) private var snackbar
  @Environment(\.palette) private var palette

  var body: some View {
    let more = requestRestCount(season)
    let name = Str.requestsRestName(Str.titleSeasonOf(title.name, seasonName(season.number)))
    let word = season.availability.stateWord(today: todayDay())
    VStack(alignment: .leading, spacing: 0) {
      RoundedRectangle.kit(Radius.md)
        .fill(palette.foreground.opacity(0.03))
        .overlay {
          RoundedRectangle.kit(Radius.md)
            .strokeBorder(palette.foreground.opacity(0.2), style: StrokeStyle(lineWidth: 1, dash: [6, 4]))
        }
        .aspectRatio(16 / 9, contentMode: .fit)
        .overlay {
          VStack(spacing: Space.s2) {
            if let word {
              Text(requestStateText(word)).textStyle(.xs, weight: .medium).foregroundStyle(palette.mutedForeground)
            }
            if season.availability.asks, let api {
              MatineeButton(
                Str.requestsRestAsk, icon: .plus, look: .secondary, size: .sm,
                pending: gaps.asking.contains(season.number)
              ) {
                gaps.askRest(season, name: name, api: api, snackbar: snackbar)
              }
            }
          }
          .padding(Space.s3)
        }
      CardText(Str.requestsRestMore(more), nil)
    }
    .accessibilityElement(children: .contain)
  }
}
