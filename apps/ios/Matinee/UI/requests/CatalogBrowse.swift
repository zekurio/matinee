import MatineeCore
import MatineeKit
import SwiftUI

/*
 * Browse.kt, after the web's browse-page.tsx and browse-filters.tsx: all
 * of the provider's movies or shows, narrowed by filters and in the order
 * the viewer picks. A grid that loads more as it scrolls, the filters in
 * the sheet the libraries share, and the sort in the bar's menu. What each
 * filter offers, the sorts, and how a card is described come from the
 * server. Titles that are here are the library's cards; the rest are
 * catalog cards, as on Discover.
 *
 *     CatalogBrowseScreen(kind: TitleKind.movie)   // nav.catalogBrowse(kind)
 */

struct CatalogBrowseScreen: View {
  let kind: String
  @State private var options = Loader<CatalogBrowseOptions>()
  @State private var filters = CatalogFilters.none
  @State private var sort = "popular"
  @State private var filtering = false
  @State private var sorting = false

  var body: some View {
    let ready = options.state.value.flatMap { $0.enabled ? $0 : nil }
    Group {
      switch options.state {
      case .loading: LoadingBox()
      case .failed(_, let disconnected):
        ErrorBox(Str.browseFiltersFailed, Str.webDiscoverFailedHint, disconnected: disconnected, onRetry: options.reload)
      case .ready(let value):
        if value.enabled {
          BrowseGrid(kind: kind, options: value, filters: $filters, sort: sort) { filtering = true }
        } else {
          EmptyState(icon: .compass, title: Str.webDiscoverOff, description: Str.webDiscoverOffHint)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
      }
    }
    .topBar(browseName(kind)) {
      if let ready {
        FilterButton(active: filters.count) { filtering = true }
        RoundIconButton(
          .arrowUpDown, label: Str.browseSortCurrent(browseSortName(sort)), look: .ghost, size: 48, iconSize: 22
        ) { sorting = true }
        .dropdownMenu(isPresented: $sorting, align: .trailing) {
          ForEach(ready.sorts, id: \.self) { value in
            MenuItem(browseSortName(value), selected: value == sort) { sort = value }
          }
        }
      }
    }
    .loads(options) { [kind] api in try await requestApi(api).discover.browseOptions(kind: kind) }
    #if DEBUG
      // `-requests.open filters|sort|scored`: the filters, the sort's menu, or the best-scored first, for a screenshot.
      .task(id: ready != nil) {
        guard ready != nil, let what = UserDefaults.standard.string(forKey: "requests.open") else { return }
        try? await Task.sleep(for: .seconds(1.5))
        switch what {
        case "filters":
          filters.genres = [878]
          filtering = true
        case "sort": sorting = true
        case "scored":
          sort = "scoreHigh"
          filters.yearFrom = 2018
        default: break
        }
      }
    #endif
    .filterSheet(isPresented: $filtering, active: filters.count, onClear: { filters = .none }) {
      if let ready { BrowseFilters(kind: kind, options: ready, filters: $filters) }
    }
  }
}

/// The sorts' words, by the server's ids.
func browseSortName(_ sort: String) -> String {
  switch sort {
  case "scoreHigh": Str.webFiltersSortScoreHigh
  case "scoreLow": Str.webFiltersSortScoreLow
  case "votes": Str.webDiscoverBrowseSortVotes
  case "newest": Str.webFiltersSortNewest
  case "oldest": Str.webFiltersSortOldest
  case "nameAsc": Str.webFiltersSortNameAsc
  case "nameDesc": Str.webFiltersSortNameDesc
  default: Str.webDiscoverBrowseSortPopular
  }
}

private struct BrowseGrid: View {
  let kind: String
  let options: CatalogBrowseOptions
  @Binding var filters: CatalogFilters
  let sort: String
  let onFilters: () -> Void
  @State private var pages = RequestPages<CatalogBrowseTitle> { $0.ref.requestKey }
  @State private var visible: Set<Int> = []
  @Environment(\.api) private var api
  @Environment(\.gutter) private var gutter
  @Environment(\.palette) private var palette

  var body: some View {
    let chips = activeFilters
    ScrollView {
      VStack(alignment: .leading, spacing: Space.s4) {
        if !chips.isEmpty {
          ActiveFilterChips(chips: chips) { filters = .none }
        }
        if let floor = pages.voteFloor {
          VStack(alignment: .leading, spacing: Space.s2) {
            Text(
              sort == "scoreHigh" || sort == "scoreLow"
                ? Str.webDiscoverBrowseFloorScore(formatCount(floor)) : Str.webDiscoverBrowseFloorList(formatCount(floor))
            )
            .textStyle(.sm).foregroundStyle(palette.mutedForeground)
            MatineeButton(Str.webDiscoverBrowseFloorChange, icon: .listFilter, look: .outline, size: .md, action: onFilters)
          }
          .padding(.horizontal, gutter)
        }
        if pages.stale { StaleNote(text: Str.webDiscoverStale) }
        if pages.items.isEmpty {
          first(chips: chips)
        } else {
          CardGrid {
            ForEach(Array(pages.items.enumerated()), id: \.element.ref) { index, item in
              BrowseCard(item: item, detail: browseDetailText(browseCardDetail(pages.detail, item)))
                .onAppear { visible.insert(index) }
                .onDisappear { visible.remove(index) }
            }
          }
          PageEnd(
            loading: pages.loading, failed: pages.failure != nil, more: pages.nextPage != nil, end: Str.webDiscoverEnd,
            onMore: pages.more)
        }
      }
      .padding(.bottom, Space.s8)
    }
    .onAppear(perform: configure)
    .onChange(of: filters) { configure() }
    .onChange(of: sort) { configure() }
    // Library cards play; only the rest can change.
    .followsRequests(
      Array(pages.items[requestFollowWindow(visible: visible, count: pages.items.count)])
        .filter { $0.title == nil }.map { CatalogInput(ref: $0.ref, libraryId: nil) })
  }

  /// The grid's first page: loading, failed, or nothing to show.
  @ViewBuilder private func first(chips: [ActiveFilter]) -> some View {
    Group {
      if let failure = pages.failure {
        ErrorState(Str.gridLoadFailed, Str.webDiscoverFailedHint, icon: .cloudOff, disconnected: failure.isDisconnect, onRetry: pages.more)
      } else if pages.loading || pages.nextPage != nil {
        Spinner(size: 32, tint: palette.accent)
      } else if !chips.isEmpty {
        EmptyState(
          icon: .searchX, title: kind == TitleKind.show ? Str.webDiscoverBrowseNoneShow : Str.webDiscoverBrowseNoneMovie,
          description: Str.webFiltersNoneHint
        ) {
          MatineeButton(Str.browseClearFilters, look: .outline) { filters = .none }
        }
      } else {
        EmptyState(icon: .searchX, title: Str.webDiscoverBrowseNothing)
      }
    }
    .frame(maxWidth: .infinity)
    .padding(.vertical, Space.s12)
  }

  private func configure() {
    guard let api else { return }
    let data = RequestData(api: requestApi(api))
    let input = CatalogBrowseInput(kind: kind, filters: filters, sort: sort, page: nil)
    let key = (try? String(decoding: JSONEncoder().encode(input), as: UTF8.self)) ?? "\(kind)\(sort)"
    visible = []
    pages.configure(key: key) { page in try await data.browseBatch(input, page: page) }
  }

  /// The filters on, as chips that take themselves off.
  private var activeFilters: [ActiveFilter] {
    var active: [ActiveFilter] = []
    let genres = filters.genres ?? []
    for id in genres {
      guard let genre = options.genres.first(where: { $0.id == id }) else { continue }
      active.append(ActiveFilter(key: "genre-\(id)", label: genre.name) { filters.genres = genres.filter { $0 != id } })
    }
    if filters.yearFrom != nil || filters.yearTo != nil {
      let label = rangeText(filters.yearFrom.map(Double.init), filters.yearTo.map(Double.init), format: yearText, any: "", words: .year)
      active.append(ActiveFilter(key: "years", label: label) {
        filters.yearFrom = nil
        filters.yearTo = nil
      })
    }
    if filters.scoreMin != nil || filters.scoreMax != nil {
      let label = rangeText(filters.scoreMin, filters.scoreMax, format: formatRating, any: "", words: .scoreChip)
      active.append(ActiveFilter(key: "score", label: label) {
        filters.scoreMin = nil
        filters.scoreMax = nil
      })
    }
    if let votes = filters.votesMin {
      active.append(ActiveFilter(key: "votes", label: Str.webDiscoverBrowseChipVotes(votes)) { filters.votesMin = nil })
    }
    if let rating = filters.rating {
      active.append(ActiveFilter(key: "rating", label: Str.webFiltersChipRating(rating)) { filters.rating = nil })
    }
    if let language = filters.language {
      let name = options.languages.first { $0.id == language }?.name ?? language
      active.append(ActiveFilter(key: "language", label: name) { filters.language = nil })
    }
    if filters.runtimeMin != nil || filters.runtimeMax != nil {
      let label = rangeText(
        filters.runtimeMin.map(Double.init), filters.runtimeMax.map(Double.init), format: runtimeText, any: "",
        words: .runtimeChip)
      active.append(ActiveFilter(key: "runtime", label: label) {
        filters.runtimeMin = nil
        filters.runtimeMax = nil
      })
    }
    return active
  }
}

/// A title the viewer can watch is the library's card; the rest are catalog
/// cards with what the stream says now, turning into the library's in place.
private struct BrowseCard: View {
  let item: CatalogBrowseTitle
  let detail: String?
  @Environment(\.requests) private var hub

  var body: some View {
    let availability = hub?.availability(item.ref, item.availability) ?? item.availability
    if let library = browseLibraryTitle(item.title, availability) {
      PosterCard(library, detail: detail)
    } else {
      CatalogCard(
        CatalogTitleSummary(ref: item.ref, name: item.name, year: item.year, poster: item.poster, availability: item.availability),
        detail: detail)
    }
  }
}

/// The filters, in the sheet the libraries share, each offering what the server says it may.
private struct BrowseFilters: View {
  let kind: String
  let options: CatalogBrowseOptions
  @Binding var filters: CatalogFilters
  @State private var choosingLanguage = false

  var body: some View {
    // One stack, so the language list opens over the filters, from inside their sheet.
    VStack(alignment: .leading, spacing: Space.s6) { sections }
      .optionSheet(
        isPresented: $choosingLanguage, title: Str.webFiltersLanguage, any: Str.webFiltersAnyLanguage,
        findPlaceholder: Str.browseFindLanguage,
        choices: options.languages.map { FilterChoice(value: $0.id, label: $0.name) }, current: filters.language
      ) { language in
        choosingLanguage = false
        filters.language = language
      }
  }

  @ViewBuilder private var sections: some View {
    if !options.genres.isEmpty {
      FilterSection(Str.webFiltersGenres) {
        ToggleChips(
          choices: options.genres.map { FilterChoice(value: String($0.id), label: $0.name) },
          value: Binding(
            get: { (filters.genres ?? []).map(String.init) },
            set: { filters.genres = $0.compactMap(Int.init) }))
      }
    }
    RangeField(
      title: Str.webFiltersYears, span: span(options.years), low: filters.yearFrom.map(Double.init),
      high: filters.yearTo.map(Double.init),
      words: { rangeText($0, $1, format: yearText, any: Str.webFiltersAnyYear, words: .year) }
    ) { low, high in
      filters.yearFrom = low.map { Int($0.rounded()) }
      filters.yearTo = high.map { Int($0.rounded()) }
    }
    RangeField(
      title: Str.webFiltersScore, hint: Str.webDiscoverBrowseScoreHint, span: span(options.scores), low: filters.scoreMin,
      high: filters.scoreMax, words: { rangeText($0, $1, format: formatRating, any: Str.webFiltersAnyScore, words: .panel) }
    ) { low, high in
      filters.scoreMin = low
      filters.scoreMax = high
    }
    if !options.votes.isEmpty {
      FilterSection(Str.webDiscoverBrowseVotes) {
        ChoiceChips(
          choices: options.votes.map { FilterChoice(value: $0, label: Str.webDiscoverBrowseVotesStep(formatCount($0))) },
          value: $filters.votesMin)
      }
    }
    if let ratings = options.ratings {
      FilterSection(
        Str.webFiltersRating,
        hint: Str.webFiltersRatingHint(Locale.app.localizedString(forRegionCode: ratings.country) ?? ratings.country)
      ) {
        ChoiceChips(choices: ratings.ratings.map { FilterChoice(value: $0, label: $0) }, value: $filters.rating)
      }
    }
    if !options.languages.isEmpty {
      FilterSection(Str.webFiltersLanguage) {
        OptionRow(label: options.languages.first { $0.id == filters.language }?.name ?? Str.webFiltersAnyLanguage) {
          choosingLanguage = true
        }
      }
    }
    RangeField(
      title: Str.webFiltersRuntime,
      hint: kind == TitleKind.show ? Str.webFiltersRuntimeHintShow : Str.webFiltersRuntimeHintMovie,
      span: span(options.runtime), low: filters.runtimeMin.map(Double.init), high: filters.runtimeMax.map(Double.init),
      words: { rangeText($0, $1, format: runtimeText, any: Str.webFiltersAnyLength, words: .panel) }
    ) { low, high in
      filters.runtimeMin = low.map { Int($0.rounded()) }
      filters.runtimeMax = high.map { Int($0.rounded()) }
    }
  }

  private func span(_ range: CatalogRange) -> FilterSpan { FilterSpan(min: range.min, max: range.max, step: range.step) }
}

/// The ways into the catalog for the Media tab, under the libraries: Browse
/// movies and Browse shows, for the kinds the server says this viewer may
/// browse, and only while Discover is on, so the tab looks as it always did
/// on a server without it. Neither Android's Media screen nor the web's has
/// them (both reach Browse from Discover's popular rows); here they sit
/// under a "Discover" heading as two quiet tiles in the library grid's
/// columns, so they read as somewhere to go, not as two more libraries.
struct CatalogBrowseEntries: View {
  @State private var discover = Loader<DiscoverRails>()
  @Environment(\.navigator) private var nav
  @Environment(\.gutter) private var gutter
  @Environment(\.windowSize) private var window
  @Environment(\.dynamicTypeSize) private var typeSize

  var body: some View {
    let kinds = discover.state.value.map { $0.enabled ? $0.browse : [] } ?? []
    let shown = [TitleKind.movie, TitleKind.show].filter(kinds.contains)
    Group {
      if shown.isEmpty {
        // Something to show, so it loads.
        Color.clear.frame(height: 0)
      } else {
        VStack(alignment: .leading, spacing: Space.s3) {
          SectionTitle(Str.webDiscoverTitle).padding(.horizontal, gutter)
          // The library grid's columns: 160 and up on a phone, 288 from `sm`, a row each at the largest sizes.
          let wide = window.width >= 640
          let minimum: CGFloat = typeSize.isAccessibilitySize ? 280 : wide ? 288 : 160
          LazyVGrid(
            columns: [GridItem(.adaptive(minimum: minimum), spacing: wide ? Space.s6 : Space.s4, alignment: .top)],
            alignment: .leading, spacing: Space.s3
          ) {
            ForEach(shown, id: \.self) { kind in
              BrowseEntry(kind: kind) { nav.catalogBrowse(kind) }
            }
          }
          .padding(.horizontal, gutter)
        }
        .padding(.bottom, Space.s6)
        .transition(Motion.fade)
      }
    }
    .loadsDiscover(discover)
  }
}

/// One way into the catalog: the kind's icon in a tile and "Browse movies",
/// in the web's bordered block.
private struct BrowseEntry: View {
  let kind: String
  let action: () -> Void
  @Environment(\.palette) private var palette

  var body: some View {
    let shape = RoundedRectangle.kit(Radius.xl)
    Pressable(shape: shape, action: action) {
      HStack(spacing: Space.s3) {
        LucideIcon(kind == TitleKind.show ? .tv : .film, size: 18, tint: palette.foreground)
          .frame(width: 36, height: 36)
          .background(palette.secondary, in: RoundedRectangle.kit(Radius.md))
          .accessibilityHidden(true)
        Text(browseName(kind))
          .textStyle(.sm, weight: .medium)
          .foregroundStyle(palette.foreground)
          .lineLimit(2)
          .frame(maxWidth: .infinity, alignment: .leading)
      }
      .padding(.horizontal, Space.s3)
      .frame(minHeight: 60)
      .background(palette.foreground.opacity(0.02), in: shape)
      .overlay { shape.strokeBorder(palette.border) }
      .contentShape(shape)
    }
    .accessibilityElement(children: .combine)
    .accessibilityAddTraits(.isButton)
  }
}
