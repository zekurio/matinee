import MatineeCore
import MatineeKit
import SwiftUI

/*
 * CatalogScreen.kt, after the web's catalog-page.tsx: a title the server
 * doesn't have, on a page built like a library title's so it reads as the
 * same page. The backdrop; the poster beside the name and facts, carrying
 * the state in its corner; the overview and the crew; then where a library
 * title has Play, the request and the trailer; a show's seasons, each with
 * its own state; the cast; and the related rows. Every state is the
 * server's, followed live while the page shows, so an approval or an
 * arrival shows at once; when the title arrives, the library title's page
 * takes this one's place. The pieces shared with the library title's page
 * are title/TitleParts.swift's.
 */

struct CatalogScreen: View {
  let ref: CatalogRef
  let library: String?
  @State private var details = Loader<CatalogTitleDetail>()

  var body: some View {
    Group {
      switch details.state {
      case .loading:
        LoadingBox().overlay(alignment: .top) { ItemTopBar() }
      case .failed(let message, let disconnected):
        ErrorBox(Str.titleLoadError, message, disconnected: disconnected, onRetry: details.reload)
          .overlay(alignment: .top) { ItemTopBar() }
      case .ready(let detail):
        CatalogPage(detail: detail, library: library, loader: details)
      }
    }
    .loads(details) { [ref, library] api in
      try await api.catalog.details(catalogInput: CatalogInput(ref: ref, libraryId: library))
    }
    .reloadsOnAsk(details)
    .hidesSystemNavigationBar()
  }
}

private struct CatalogPage: View {
  let detail: CatalogTitleDetail
  let library: String?
  let loader: Loader<CatalogTitleDetail>
  @State private var related = RelatedLoads()
  @Environment(\.requests) private var hub
  @Environment(\.navigator) private var nav
  @Environment(\.windowSize) private var window

  var body: some View {
    let layout = TitleLayout(window: window)
    let ref = detail.ref
    let destination = detail.destinations.first(where: \.selected)?.id ?? library
    let availability = hub?.availability(ref, detail.availability) ?? detail.availability
    let seasons = hub?.seasons(ref, detail.seasons) ?? requestSeasonsInOrder(detail.seasons)
    ScrollView {
      VStack(alignment: .leading, spacing: layout.sectionSpacing) {
        CatalogHeader(detail: detail, availability: availability, seasons: seasons, layout: layout) { only in
          openSheet(only: only, availability: availability, seasons: seasons, destination: destination)
        }
        if ref.kind == TitleKind.show, !seasons.isEmpty {
          Rail(Str.titleSeasons) {
            ForEach(seasons, id: \.number) { season in
              RailItem(.poster) {
                CatalogSeasonCard(showName: detail.name, showPoster: detail.poster, season: season) {
                  openSheet(only: season.number, availability: availability, seasons: seasons, destination: destination)
                }
              }
            }
          }
        }
        CastRail(credits: detail.credits)
        CatalogRelatedRows(ref: ref, library: library, loads: related)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.bottom, Space.s10)
    }
    .ignoresSafeArea(edges: .top)
    .refreshable {
      loader.reload()
      related.reload()
      try? await Task.sleep(for: .milliseconds(600))
    }
    .overlay(alignment: .top) { ItemTopBar() }
    .overlay(alignment: .topTrailing) {
      DisconnectedAction([loader]).padding(.horizontal, Space.s2).padding(.vertical, Space.s1_5 + 2)
    }
    // One stream for the page: the title, then its related titles once their rows have loaded.
    .followsRequests([CatalogInput(ref: ref, libraryId: destination)] + related.followed)
    // Once it's in a library the viewer can see, this page becomes that title's.
    .onChange(of: availability.arrivedTitleId, initial: true) { _, here in
      if let here { nav.arrived(here) }
    }
  }

  /// The request sheet, with the season a card asked for, or the row's request.
  private func openSheet(only: Int?, availability: Availability, seasons: [CatalogSeason], destination: String?) {
    hub?.open(
      RequestSheetModel(
        ref: detail.ref, name: detail.name, seasons: seasons, first: availability.asks,
        defaultFuture: detail.defaultScope?.future ?? false, libraryId: destination, only: only,
        availability: availability))
  }
}

/// The top of a catalog page: the backdrop across the window and, over its
/// faded end, the poster with the state beside the name and facts, then the
/// overview, the crew, and the buttons. On a phone the poster sits beside
/// the name, as a season's does; from `sm` up beside it all.
private struct CatalogHeader: View {
  let detail: CatalogTitleDetail
  let availability: Availability
  let seasons: [CatalogSeason]
  let layout: TitleLayout
  let openSheet: (Int?) -> Void
  @Environment(\.api) private var api
  @Environment(\.requests) private var hub
  @Environment(\.gutter) private var gutter
  @Environment(\.palette) private var palette
  @Environment(\.dynamicTypeSize) private var dynamicType

  var body: some View {
    ZStack(alignment: .topLeading) {
      Backdrop(
        sources: [api?.art(detail.backdrop, size: .large)].compactMap(\.self), blurred: api?.art(detail.poster),
        toneKey: detail.ref.requestKey, height: layout.backdropHeight(), wide: layout.wide
      )
      .ignoresSafeArea(edges: .horizontal)
      Group {
        if layout.wide {
          HStack(alignment: .top, spacing: Space.s8) {
            poster.frame(width: layout.posterWidth)
            VStack(alignment: .leading, spacing: 0) {
              heading
              details.padding(.top, Space.s4)
              Spacer(minLength: 0)
              actions.padding(.top, Space.s6)
            }
            .frame(minHeight: layout.posterWidth * 1.5, alignment: .top)
          }
        } else {
          VStack(alignment: .leading, spacing: Space.s5) {
            if dynamicType.isAccessibilitySize {
              // The name gets the width; the poster stands over it.
              poster.frame(width: 132)
              heading
            } else {
              HStack(alignment: .bottom, spacing: Space.s4) {
                poster.frame(width: 132)
                heading.padding(.bottom, Space.s1)
              }
            }
            details
            actions
          }
        }
      }
      .padding(.top, layout.wide ? layout.headingTop() : layout.headingTop(season: true))
      .padding(.horizontal, gutter)
    }
  }

  /// The poster, carrying the state in its corner; for an admin with the
  /// title's request to answer, a tap on the state says who asked.
  private var poster: some View {
    HeaderPoster(name: detail.name, poster: api?.art(detail.poster, size: .medium))
      .overlay(alignment: .topTrailing) {
        PosterBadge(
          availability: availability, tip: hub?.waiting(availability).map(requestRequestedText), large: layout.wide
        )
        .padding(layout.wide ? Space.s2_5 : Space.s1_5)
        .frame(maxWidth: .infinity, alignment: .trailing)
      }
      .animation(Motion.enter, value: availability.state)
  }

  private var heading: some View {
    let numbered = seasons.filter { $0.number > 0 }.count
    let facts = [
      formatYear(detail.year),
      detail.ref.kind == TitleKind.show && numbered > 0 ? Str.requestsSeasonCount(numbered) : nil,
    ].compactMap(\.self)
    return VStack(alignment: .leading, spacing: 0) {
      HeadingMark(name: detail.name, size: layout.nameSize, weight: layout.nameWeight)
      FactsRow(facts: facts, contentRating: detail.contentRating, rating: detail.rating).padding(.top, Space.s2)
      // Plain text: genre pages list the library's titles.
      if !detail.genres.isEmpty {
        Text(detail.genres.prefix(4).map(genreName).joined(separator: ", "))
          .textStyle(.sm).foregroundStyle(palette.mutedForeground).padding(.top, Space.s1_5)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  @ViewBuilder private var details: some View {
    VStack(alignment: .leading, spacing: Space.s4) {
      if detail.stale {
        Text(Str.webCatalogPageStale).textStyle(.px13).foregroundStyle(palette.mutedForeground)
      }
      if let overview = detail.overview {
        Overview(text: overview, size: layout.overviewSize)
      }
      CrewLines(credits: detail.credits, studios: Array(detail.studios.prefix(2)))
    }
  }

  private var actions: some View {
    CatalogActions(detail: detail, availability: availability, seasons: seasons, wide: layout.wide, openSheet: openSheet)
  }
}

/// The page's row, as a library title's has Play first: the one thing the
/// viewer may do, then the trailer. A show's request and "Request more"
/// open the sheet; a film's asks at once. For an admin with the title's
/// request to answer, Add and Decline take the action's place until it's
/// answered. Nothing when there's neither an action nor a trailer.
private struct CatalogActions: View {
  let detail: CatalogTitleDetail
  let availability: Availability
  let seasons: [CatalogSeason]
  let wide: Bool
  let openSheet: (Int?) -> Void
  @Environment(\.requests) private var hub
  @Environment(\.openURL) private var openURL
  @Environment(\.dynamicTypeSize) private var dynamicType

  var body: some View {
    let ref = detail.ref
    let action = catalogPageAction(ref: ref, availability: availability, seasons: seasons)
    let answering = hub?.answerable(availability)
    let trailer = preferredTrailer(detail.trailers, language: Locale.app.identifier)
    if answering != nil || action != .none || trailer != nil {
      let stacked = dynamicType.isAccessibilitySize && !wide
      let layout = stacked ? AnyLayout(VStackLayout(alignment: .leading, spacing: Space.s2)) : AnyLayout(HStackLayout(spacing: Space.s2_5))
      layout {
        if let answering {
          AddButton(item: answering, fullWidth: true).frame(maxWidth: wide ? 200 : .infinity)
          DeclineButton(item: answering)
        } else if action != .none {
          PosterActionButton(
            availability: availability, name: detail.name, busy: hub?.busy.contains(ref.requestKey) == true,
            action: action == .more ? .request : nil, label: action == .more ? Str.webAskMore : nil, fullWidth: !wide
          ) {
            if catalogAsksAtOnce(ref: ref, action: action) {
              Task { await askFilm() }
            } else {
              openSheet(nil)
            }
          }
          .frame(minWidth: wide ? 168 : nil)
          .fixedSize(horizontal: wide, vertical: false)
        }
        if let trailer, let url = URL(string: trailer.url) {
          if wide || stacked {
            MatineeButton(Str.iosTitleTrailer, icon: .clapperboard, look: .frosted) { openURL(url) }
              .accessibilityHint(Str.iosTitleTrailerHint)
          } else {
            RoundIconButton(.clapperboard, label: Str.iosTitleTrailer, look: .frosted, size: TouchTarget, iconSize: 20) {
              openURL(url)
            }
            .accessibilityHint(Str.iosTitleTrailerHint)
          }
        }
      }
    }
  }

  /// A film asks at once, to where the server picked.
  private func askFilm() async {
    guard let hub else { return }
    let chooser = RequestChooser(detail: detail, availability: availability)
    await hub.ask(chooser, name: detail.name, availability: availability)
  }
}
