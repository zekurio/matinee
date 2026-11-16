import MatineeCore
import MatineeKit
import SwiftUI

/*
 * Browse.kt, after the web's browse-page.tsx and browse-filters.tsx: all
 * of the provider's movies or shows, or the viewer's recommendations of
 * them, narrowed by filters and in the order the viewer picks. A grid that
 * loads more as it scrolls, the filters in the sheet the libraries share,
 * and the sort in the bar's menu. Each Discover row's heading opens one
 * with the row's filters and sort. What each filter offers, the sorts, and
 * how a card is described come from the server. Titles that are here are
 * the library's cards; the rest are catalog cards, as on Discover.
 *
 *     CatalogBrowseScreen(start: CatalogBrowseStart(kind: TitleKind.movie))   // nav.catalogBrowse(start)
 */

/// Browsing `start`'s fixed kind with its filters and sort.
struct CatalogBrowseScreen: View {
  let start: CatalogBrowseStart
  @State private var filters: CatalogFilters
  @State private var sort: String

  init(start: CatalogBrowseStart) {
    self.start = start
    _filters = State(initialValue: start.filters)
    _sort = State(initialValue: start.sort)
  }

  var body: some View {
    #if DEBUG
      if start.kind == "_preview" {
        RequestsPreview()
      } else {
        page
      }
    #else
      page
    #endif
  }

  private var page: some View {
    BrowseKindPage(kind: start.kind, filters: $filters, sort: $sort)
  }
}

/// One kind's browse: what the server offers to filter it by, the sort's
/// menu, and the grid.
private struct BrowseKindPage: View {
  let kind: String
  @Binding var filters: CatalogFilters
  @Binding var sort: String
  @State private var options = Loader<CatalogBrowseOptions>()
  @State private var filtering = false
  @State private var sorting = false
  @State private var voteFloor: Int?

  var body: some View {
    let ready: CatalogBrowseOptions? = options.state.value.flatMap { $0.enabled ? $0 : nil }
    // Best match goes with the recommendations, and back to popular without them.
    let change = Binding<CatalogFilters>(
      get: { filters },
      set: { next in
        filters = next
        sort = catalogSort(sort, fitting: next)
      })
    Group {
      switch options.state {
      case .loading: LoadingBox()
      case .failed(_, let disconnected):
        ErrorBox(Str.browseFiltersFailed, Str.webDiscoverFailedHint, disconnected: disconnected, onRetry: options.reload)
      case .ready(let value):
        if value.enabled {
          BrowseGrid(kind: kind, filters: change, sort: sort, onFloor: { voteFloor = $0 })
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
          ForEach(ready.sorts.filter { catalogSortFits($0, filters) }, id: \.self) { value in
            MenuItem(browseSortName(value), selected: value == sort) { sort = value }
          }
        }
      }
    }
    .loads(options, fetch: fetchOptions)
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
    .filterSheet(isPresented: $filtering, active: filters.count, onClear: { change.wrappedValue = .none }) {
      if let ready { BrowseFilters(kind: kind, options: ready, filters: change, sort: sort, voteFloor: voteFloor) }
    }
  }
  private var fetchOptions: @Sendable (MatineeApi) async throws -> CatalogBrowseOptions {
    let kind = kind
    return { api in try await requestApi(api).discover.browseOptions(kind: kind) }
  }
}

/// The sorts' words, by the server's ids.
func browseSortName(_ sort: String) -> String {
  switch sort {
  case CatalogSort.forYou: Str.webDiscoverBrowseSortForYou
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
  @Binding var filters: CatalogFilters
  let sort: String
  let onFloor: (Int?) -> Void
  @State private var pages = RequestPages<CatalogBrowseTitle> { $0.ref.requestKey }
  @State private var visible: Set<Int> = []
  @Environment(\.api) private var api
  @Environment(\.actions) private var actions
  @Environment(\.gutter) private var gutter
  @Environment(\.palette) private var palette

  var body: some View {
    let filtered: Bool = filters.count > 0
    let recommended: Bool = filters.recommends
    let hidden = actions?.hidden.keys ?? []
    // What the viewer said they're not interested in leaves a list of recommendations.
    let shown: [CatalogBrowseTitle] = pages.items.filter { !recommended || !hidden.contains($0.ref.key) }
    let window: Range<Int> = requestFollowWindow(visible: visible, count: shown.count)
    let followed: [CatalogInput] = shown[window].filter { $0.title == nil }
      .map { CatalogInput(ref: $0.ref, libraryId: nil) }
    ScrollView {
      VStack(alignment: .leading, spacing: Space.s4) {
        if pages.stale { StaleNote(text: Str.webDiscoverStale) }
        if pages.items.isEmpty {
          first(filtered: filtered, recommended: recommended)
        } else {
          CardGrid {
            ForEach(Array(shown.enumerated()), id: \.element.ref) { index, item in
              BrowseCard(item: item, detail: browseDetailText(browseCardDetail(pages.detail, item)), recommended: recommended)
                .onAppear { visible.insert(index) }
                .onDisappear { visible.remove(index) }
            }
          }
          PageEnd(
            loading: pages.loading, failed: pages.failure != nil, more: pages.nextPage != nil, end: Str.webDiscoverEnd,
            onMore: { pages.more() })
        }
      }
      .padding(.bottom, Space.s8)
    }
    .onAppear { configure() }
    .onChange(of: pages.voteFloor) { onFloor(pages.voteFloor) }
    .onChange(of: filters) { configure() }
    .onChange(of: sort) { configure() }
    // Library cards play; only the rest can change.
    .followsRequests(followed)
  }

  /// The grid's first page: loading, failed, or nothing to show.
  @ViewBuilder private func first(filtered: Bool, recommended: Bool) -> some View {
    Group {
      if let failure = pages.failure {
        ErrorState(Str.gridLoadFailed, Str.webDiscoverFailedHint, icon: .cloudOff, disconnected: failure.isDisconnect, onRetry: { pages.more() })
      } else if pages.loading || pages.nextPage != nil {
        Spinner(size: 32, tint: palette.accent)
      } else if recommended {
        EmptyState(icon: .compass, title: Str.webDiscoverBrowseForYouNone, description: Str.webDiscoverBrowseForYouHint) {
          if filtered {
            MatineeButton(Str.browseClearFilters, look: .outline) { filters = .none }
          }
        }
      } else if filtered {
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
    let loadPage: @Sendable (Int) async throws -> RequestPageBatch<CatalogBrowseTitle> = { page in
      try await data.browseBatch(input, page: page)
    }
    pages.configure(key: key, fetch: loadPage)
  }
}

/// A title the viewer can watch is the library's card; the rest are catalog
/// cards with what the stream says now, turning into the library's in place.
/// A recommendation's long press offers "Not interested". Browse's grid and
/// Discover's rows draw their cards with it.
struct BrowseCard: View {
  let item: CatalogBrowseTitle
  let detail: String?
  var recommended = false
  @Environment(\.requests) private var hub

  var body: some View {
    let availability = hub?.availability(item.ref, item.availability) ?? item.availability
    if let library = browseLibraryTitle(item.title, availability) {
      PosterCard(library, detail: detail)
    } else {
      CatalogCard(
        CatalogTitleSummary(ref: item.ref, name: item.name, year: item.year, poster: item.poster, availability: item.availability),
        detail: detail, recommended: recommended)
    }
  }
}

/// The filters, in the sheet the libraries share, each offering what the server says it may.
private struct BrowseFilters: View {
  let kind: String
  let options: CatalogBrowseOptions
  @Binding var filters: CatalogFilters
  let sort: String
  let voteFloor: Int?
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
    FilterSection(Str.webDiscoverBrowseOnly, hint: Str.webDiscoverBrowseOnlyHint) {
      ToggleChips(
        choices: [
          FilterChoice(value: "recommended", label: Str.webDiscoverBrowseRecommended),
          FilterChoice(value: "upcoming", label: Str.webDiscoverBrowseUpcoming),
          FilterChoice(value: "requestable", label: Str.webDiscoverBrowseRequestable),
        ],
        value: Binding(
          get: {
            [
              filters.recommended == true ? "recommended" : nil, filters.upcoming == true ? "upcoming" : nil,
              filters.requestable == true ? "requestable" : nil,
            ].compactMap(\.self)
          },
          set: { picked in
            var next = filters
            next.recommended = picked.contains("recommended") ? true : nil
            next.upcoming = picked.contains("upcoming") ? true : nil
            next.requestable = picked.contains("requestable") ? true : nil
            filters = next
          }))
    }
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
      FilterSection(Str.webDiscoverBrowseVotes, hint: voteHint) {
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

  private var voteHint: String? {
    guard let voteFloor else { return nil }
    let count = formatCount(voteFloor)
    return sort == "scoreHigh" || sort == "scoreLow"
      ? Str.webDiscoverBrowseFloorScore(count) : Str.webDiscoverBrowseFloorList(count)
  }

  private func span(_ range: CatalogRange) -> FilterSpan { FilterSpan(min: range.min, max: range.max, step: range.step) }
}
