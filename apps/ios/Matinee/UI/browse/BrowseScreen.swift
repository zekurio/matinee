import MatineeCore
import MatineeKit
import SwiftUI

/*
 * BrowseScreen.kt: a genre's or a studio's titles from every library, with
 * the filters and sorts a library has, and a person's page, which Android
 * keeps here too. The person's page is laid out as Android's: the
 * portrait beside the name, the biography, then every credit in one
 * poster grid, and the titles at TMDB no library has. What it decides is
 * MatineeCore's (Title/PersonPresentation.swift).
 */

/// A genre's or a studio's titles across the server.
struct BrowseScreen: View {
  let genre: String?
  let studio: String?

  @State private var kind: String?
  @State private var state = TitleListState()
  @State private var options = Loader<TitleFilterOptions>()
  @State private var pages = makeTitlePages()
  @State private var kinds = BrowseKinds()
  @State private var filtering = false
  @State private var devStarted = false
  @Environment(\.windowSize) private var window
  @Environment(\.dynamicTypeSize) private var typeSize
  @Environment(\.shellStyle) private var shellStyle
  @Environment(\.gutter) private var gutter
  @Environment(\.palette) private var palette

  var body: some View {
    let (genre, studio, kind, kinds) = (genre, studio, kind, kinds)
    let state = state
    let offered = options.state.value
    let chips = titleFilterChips(state.filters, options: offered) { state.filters = $0 }
    let (sort, order, filters) = (state.sort, state.order, state.filters)
    PosterGrid(pages, detail: { titleCardDetailText($0, sort: sort) }, empty: { empty(filtered: !chips.isEmpty) }) {
      header(chips: chips)
    }
    .pages(pages, key: "\(kind ?? "")\n\(state.key)") { api, offset, limit in
      var sent = browseFilters(genre: genre, studio: studio, picked: filters)
      #if DEBUG
        // The fixtures' genres and studios aren't the server's: show its titles.
        if BrowseFixtures.on { sent = BrowseFixtures.served(filters) }
      #endif
      let page = try await api.titles.browse(
        kind: kind, filters: sent, sort: sort, order: order, limit: limit, offset: offset)
      await kinds.show(page.kinds)
      return TitleList(items: page.items, total: page.total)
    }
    .loadsFilterOptions(options, kind: kind, genre: genre, studio: studio)
    .topBar(genre ?? studio ?? "") {
      HStack(spacing: wideControls(window, typeSize, shellStyle) ? Space.s2 : 0) {
        DisconnectedAction(options)
        if offered != nil { TitleFilterButton(active: state.activeFilters) { filtering = true } }
        TitleSortButton(state: state, options: offered)
      }
      .padding(.trailing, wideControls(window, typeSize, shellStyle) ? gutter - 4 : 0)
    }
    .titleFilterSheet(isPresented: $filtering, kind: kind, options: offered, state: state)
    #if DEBUG
      .onAppear {
        guard !devStarted else { return }
        devStarted = true
        if let filters = BrowseFixtures.filters { state.filters = filters }
        if BrowseFixtures.open == "filters" { filtering = true }
      }
    #endif
  }

  /// "Genre · 12 titles", the kinds to pick from, and the filters in use.
  private func header(chips: [ActiveFilter]) -> some View {
    VStack(alignment: .leading, spacing: Space.s3) {
      Text(
        [genre != nil ? Str.browseGenre : Str.browseStudio, pages.total.map { Str.browseTitleCount($0) }]
          .compactMap(\.self).joined(separator: " · ")
      )
      .textStyle(.sm)
      .foregroundStyle(palette.mutedForeground)
      .padding(.horizontal, gutter)
      // All three always, as Android's, whether the page has both kinds or one.
      ScrollView(.horizontal) {
        HStack(spacing: Space.s1_5) {
          ForEach(browseKinds(kinds.value), id: \.kind) { choice in
            Chip(browseKindLabel(choice.kind), selected: kind == choice.kind) {
              withMotion(Motion.move) { kind = choice.kind }
            }
            .accessibilityValue(choice.count.map { Str.browseTitleCount($0) } ?? "")
          }
        }
      }
      .contentMargins(.horizontal, gutter, for: .scrollContent)
      .scrollIndicators(.hidden)
      if !chips.isEmpty { ActiveFilterChips(chips: chips, onClear: state.clearFilters) }
    }
    .padding(.top, Space.s1)
    .padding(.bottom, Space.s4)
  }

  private func empty(filtered: Bool) -> GridEmpty {
    if filtered {
      return GridEmpty(icon: .listFilter, title: Str.browseNoFilterMatch, action: (Str.browseClearFilters, state.clearFilters))
    }
    return GridEmpty(icon: .popcorn, title: genre != nil ? Str.browseGenreEmpty : Str.browseStudioEmpty)
  }
}

/// How many movies and shows a genre or studio has, as the server counted
/// them with the newest page, for what the kind chips say to VoiceOver.
@Observable final class BrowseKinds {
  private(set) var value: BrowsedTitles.Kinds?

  func show(_ kinds: BrowsedTitles.Kinds) { if value != kinds { value = kinds } }
}

// MARK: People

/// A person's page: who they are and what they're in. Android keeps it in BrowseScreen.kt.
struct PersonScreen: View {
  let name: String
  /// The provider's id, from a credit that has one: it tells apart two people of one name.
  var tmdbId: String?

  @State private var person = Loader<Person>()
  @Environment(\.homeAction) private var homeAction

  var body: some View {
    let (name, tmdbId) = (name, tmdbId)
    Group {
      switch person.state {
      case .loading: PersonSkeleton()
      case .failed(let message, let disconnected):
        ErrorBox(Str.personLoadFailed, message, disconnected: disconnected, onRetry: person.reload)
      case .ready(let value): content(value)
      }
    }
    .loads(person) { api in
      #if DEBUG
        if BrowseFixtures.on { return try await BrowseFixtures.person(name, api: api) }
      #endif
      return try await loadPerson(api, name: name, tmdbId: tmdbId)
    }
    // No name in the bar: the page's heading is the name, large, under it.
    .topBar(nil, onHome: homeAction) { DisconnectedAction(person) }
  }

  private func content(_ value: Person) -> some View {
    ScrollViewReader { proxy in
      ScrollView {
        VStack(alignment: .leading, spacing: 0) {
          PersonHeader(person: value)
            .padding(.top, Space.s2)
            .padding(.bottom, Space.s3 + Space.s5)
          // Every credit in one grid, as Android's: the part, else the year, else the kind of credit.
          CardGrid {
            ForEach(value.credits, id: \.self) { credit in
              PosterCard(
                credit.title,
                detail: credit.role ?? formatYear(credit.title.year) ?? creditKind(credit.kind, count: 1))
            }
          }
          // "Not here yet": their titles at TMDB that no library here has.
          PersonCatalogCredits(credits: value.catalog, stale: value.stale)
            .padding(.top, value.credits.isEmpty || value.catalog.isEmpty ? 0 : Space.s5 + Space.s3)
            .id("catalog")
        }
        .padding(.bottom, Space.s8)
      }
      .refreshable {
        person.reload()
        await person.settled()
      }
      #if DEBUG
        .modifier(PersonCatalogDevOpen(kind: .constant(nil), proxy: proxy))
      #endif
    }
  }
}

/// The portrait beside the name and what they're known for, and the
/// biography under both, as Android's.
private struct PersonHeader: View {
  let person: Person
  @Environment(\.api) private var api
  @Environment(\.palette) private var palette
  @Environment(\.gutter) private var gutter
  @Environment(\.dynamicTypeSize) private var typeSize

  var body: some View {
    let biography = person.profile?.biography.flatMap { $0.isEmpty ? nil : $0 }
    let layout =
      typeSize.isAccessibilitySize
      ? AnyLayout(VStackLayout(alignment: .leading, spacing: Space.s4))
      : AnyLayout(HStackLayout(alignment: .center, spacing: Space.s5))
    VStack(alignment: .leading, spacing: Space.s4) {
      layout {
        portrait
        VStack(alignment: .leading, spacing: Space.s1) {
          Text(person.name)
            .textStyle(.px26, weight: .bold, tracking: .tight)
            .foregroundStyle(palette.foreground)
            .accessibilityAddTraits(.isHeader)
          Text(subtitle).textStyle(.sm).foregroundStyle(palette.mutedForeground)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      }
      if let biography { Overview(text: biography, size: .base) }
    }
    .padding(.horizontal, gutter)
  }

  private var portrait: some View {
    Circle()
      .fill(palette.secondary)
      .overlay {
        Text(initials(person.name))
          .textStyle(.px26, weight: .bold)
          .foregroundStyle(palette.mutedForeground)
      }
      .overlay { Picture(api?.art(person.photo, size: .medium)) }
      .clipShape(Circle())
      .frame(width: 112, height: 112)
      .accessibilityHidden(true)
  }

  /// "Acting · Born Sep 2, 1964", or "Actor · 12 titles".
  private var subtitle: String {
    switch personSubtitle(person) {
    case .profile(let knownFor, let born, let died):
      return [
        knownFor.flatMap(departmentName),
        formatDay(born).map(Str.personBorn),
        formatDay(died).map(Str.personDied),
      ].compactMap(\.self).joined(separator: " · ")
    case .credits(let kinds, let count):
      let names = kinds.map { creditKind($0, count: 1) }.formatted(.list(type: .and).locale(.app))
      return [names.isEmpty ? nil : names, Str.browseTitleCount(count)].compactMap(\.self).joined(separator: " · ")
    }
  }
}

/// The page while the person loads: the portrait, the name, and posters.
private struct PersonSkeleton: View {
  @Environment(\.gutter) private var gutter

  var body: some View {
    let size: CGFloat = 112
    VStack(alignment: .leading, spacing: Space.s8) {
      HStack(spacing: Space.s5) {
        Skeleton(shape: Circle()).frame(width: size, height: size)
        VStack(alignment: .leading, spacing: Space.s3) {
          Skeleton(radius: Radius.md).frame(width: 220, height: 32)
          Skeleton(radius: Radius.sm).frame(width: 160, height: 16)
        }
      }
      .padding(.horizontal, gutter)
      PosterGridSkeleton(count: 6)
    }
    .padding(.top, Space.s2)
    .frame(maxHeight: .infinity, alignment: .top)
    .accessibilityElement()
    .accessibilityLabel(Str.loadingInProgress)
  }
}

/// What TMDB says someone is known for, in the app's language.
private func departmentName(_ id: String) -> String? {
  switch id {
  case PersonDepartment.acting: Str.personDepartmentActing
  case PersonDepartment.directing: Str.personDepartmentDirecting
  case PersonDepartment.writing: Str.personDepartmentWriting
  case PersonDepartment.creator: Str.personDepartmentCreator
  case PersonDepartment.production: Str.personDepartmentProduction
  case PersonDepartment.editing: Str.personDepartmentEditing
  case PersonDepartment.camera: Str.personDepartmentCamera
  case PersonDepartment.sound: Str.personDepartmentSound
  case PersonDepartment.art: Str.personDepartmentArt
  case PersonDepartment.costume: Str.personDepartmentCostume
  case PersonDepartment.visualEffects: Str.personDepartmentVisualEffects
  case PersonDepartment.lighting: Str.personDepartmentLighting
  case PersonDepartment.crew: Str.personDepartmentCrew
  default: nil
  }
}

/// "Director", or "Directors" for `count` above one.
func creditKind(_ kind: String, count: Int) -> String {
  switch kind {
  case CreditKind.creator: Str.peopleCreditCreator(count)
  case CreditKind.director: Str.peopleCreditDirector(count)
  case CreditKind.writer: Str.peopleCreditWriter(count)
  default: Str.peopleCreditActor(count)
  }
}
