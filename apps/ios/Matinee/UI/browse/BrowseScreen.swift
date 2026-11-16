import MatineeCore
import MatineeKit
import SwiftUI

/*
 * BrowseScreen.kt: a genre's or a studio's titles from every library, with
 * the filters and sorts a library has, and a person's page, which Android
 * keeps here too. The person's page is laid out as the web's
 * people.$name.tsx: the portrait and name, the biography, the choice of
 * movies or shows, and a section for each kind of credit. What it decides
 * is MatineeCore's (Title/PersonPresentation.swift).
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
      HStack(spacing: wideControls(window, typeSize) ? Space.s2 : 0) {
        DisconnectedAction(options)
        if offered != nil { TitleFilterButton(active: state.activeFilters) { filtering = true } }
        TitleSortButton(state: state, options: offered)
      }
      .padding(.trailing, wideControls(window, typeSize) ? gutter - 4 : 0)
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
      if let choices = browseKindChoices(kinds.value, picked: kind) {
        ScrollView(.horizontal) {
          HStack(spacing: Space.s1_5) {
            ForEach(choices, id: \.kind) { choice in
              Chip(browseKindLabel(choice.kind), selected: kind == choice.kind) {
                withMotion(Motion.move) { kind = choice.kind }
              }
            }
          }
        }
        .contentMargins(.horizontal, gutter, for: .scrollContent)
        .scrollIndicators(.hidden)
      }
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
/// them with the newest page, for the kind chips.
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
  @State private var kind: String?
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
        // The requests' stand-in's titles at TMDB, as the dev server has no provider to find them.
        if RequestFixtures.mode != nil {
          var found = try await BrowseFixtures.on ? BrowseFixtures.person(name, api: api) : loadPerson(api, name: name, tmdbId: tmdbId)
          found.catalog = try await RequestData(api: requestApi(api)).personCredits(name: name, tmdbId: tmdbId)
          return found
        }
        if BrowseFixtures.on { return try await BrowseFixtures.person(name, api: api) }
      #endif
      return try await loadPerson(api, name: name, tmdbId: tmdbId)
    }
    // No name in the bar: the page's heading is the name, large, under it.
    .topBar(nil, onHome: homeAction) { DisconnectedAction(person) }
  }

  private func content(_ value: Person) -> some View {
    let shown = personShownKind(value, picked: kind)
    return ScrollViewReader { proxy in
    ScrollView {
      VStack(alignment: .leading, spacing: Space.s10) {
        PersonHeader(person: value, kind: shown) { picked in withMotion(Motion.move) { kind = picked } }
        ForEach(personCreditSections(value, titleKind: shown), id: \.kind) { section in
          CreditSection(section: section)
        }
        // "Not here yet": their titles at TMDB that no library here has, of the kind shown, as the sections above.
        PersonCatalogCredits(credits: value.catalog.filter { shown == nil || $0.ref.kind == shown }, stale: value.stale)
          .id("catalog")
      }
      .padding(.top, Space.s2)
      .padding(.bottom, Space.s8)
    }
    .refreshable {
      person.reload()
      await person.settled()
    }
    #if DEBUG
      .modifier(PersonCatalogDevOpen(kind: $kind, proxy: proxy))
    #endif
    }
  }
}

/// The portrait, the name and what they're known for, and under them the
/// biography and the choice of movies or shows. From the web's `sm` up, the
/// part under the name sits beside the portrait, as the web's grid has it.
private struct PersonHeader: View {
  let person: Person
  let kind: String?
  let pick: (String?) -> Void
  @Environment(\.api) private var api
  @Environment(\.palette) private var palette
  @Environment(\.gutter) private var gutter
  @Environment(\.windowSize) private var window
  @Environment(\.dynamicTypeSize) private var typeSize

  var body: some View {
    let wide = window.width >= 640
    let biography = person.profile?.biography.flatMap { $0.isEmpty ? nil : $0 }
    let counts = personKindCounts(person)
    let picker = counts.movie > 0 && counts.show > 0
    let stacked = typeSize.isAccessibilitySize
    VStack(alignment: .leading, spacing: Space.s4) {
      HStack(alignment: wide && biography != nil ? .top : .center, spacing: wide ? Space.s6 : Space.s5) {
        if !stacked { portrait(wide: wide) }
        VStack(alignment: .leading, spacing: Space.s4) {
          if stacked { portrait(wide: false) }
          VStack(alignment: .leading, spacing: Space.s1) {
            Text(person.name)
              .textStyle(wide ? .px32 : .px26, weight: .semibold, tracking: .tight)
              .foregroundStyle(palette.foreground)
              .accessibilityAddTraits(.isHeader)
            Text(subtitle).textStyle(.sm).foregroundStyle(palette.mutedForeground)
          }
          if wide { below(biography: biography, picker: picker, counts: counts) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      }
      .padding(.horizontal, gutter)
      if !wide { below(biography: biography, picker: picker, counts: counts) }
    }
  }

  private func portrait(wide: Bool) -> some View {
    let size: CGFloat = wide ? 112 : 80
    return Circle()
      .fill(palette.secondary)
      .overlay {
        Text(initials(person.name))
          .textStyle(wide ? .xl3 : .xl2, weight: .medium)
          .foregroundStyle(palette.mutedForeground)
      }
      .overlay { Picture(api?.art(person.photo, size: .medium)) }
      .clipShape(Circle())
      .overlay { Circle().strokeBorder(palette.border) }
      .frame(width: size, height: size)
      .kitShadow(.small)
      .accessibilityHidden(true)
  }

  /// The biography and the kind chips, each where there's one.
  @ViewBuilder private func below(biography: String?, picker: Bool, counts: BrowsedTitles.Kinds) -> some View {
    if biography != nil || picker {
      VStack(alignment: .leading, spacing: Space.s4) {
        if let biography { Biography(text: biography).padding(.horizontal, window.width >= 640 ? 0 : gutter) }
        if picker {
          ScrollView(.horizontal) {
            HStack(spacing: Space.s1_5) {
              ForEach([nil, TitleKind.movie, TitleKind.show], id: \.self) { choice in
                Chip(browseKindLabel(choice), selected: kind == choice) { pick(choice) }
              }
            }
          }
          .contentMargins(.horizontal, window.width >= 640 ? 0 : gutter, for: .scrollContent)
          .scrollIndicators(.hidden)
          .scrollClipDisabled()
        }
      }
    }
  }

  /// "Acting · Born Sep 2, 1964", or "Actor, Director · 12 titles".
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

/// A biography in three lines, with More to read the rest in place, as Android's `Overview`.
private struct Biography: View {
  let text: String
  #if DEBUG
    @State private var open = BrowseFixtures.open == "more"
  #else
    @State private var open = false
  #endif
  @State private var full: CGFloat = 0
  @State private var clipped: CGFloat = 0
  @Environment(\.palette) private var palette

  var body: some View {
    let overflows = full > clipped + 1
    VStack(alignment: .leading, spacing: Space.s1) {
      Text(text)
        .textStyle(.sm)
        .foregroundStyle(palette.foreground.opacity(0.85))
        .lineLimit(open ? nil : 3)
        .frame(maxWidth: 672, alignment: .leading)
        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { if !open { clipped = $0 } }
        .background {
          // The whole text, unseen, to know whether three lines cut it short.
          Text(text).textStyle(.sm).fixedSize(horizontal: false, vertical: true).hidden()
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { full = $0 }
            .frame(maxWidth: 672, alignment: .leading)
            .accessibilityHidden(true)
        }
      if overflows || open {
        MatineeButton(open ? Str.titleLess : Str.titleMore, look: .link, size: .sm) {
          withMotion(Motion.move) { open.toggle() }
        }
        .accessibilityHidden(true)
      }
    }
    // VoiceOver reads all of it, whatever shows.
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(text)
  }
}

/// One kind of credit as a poster grid, with the year and the part under each.
private struct CreditSection: View {
  let section: PersonCreditSection
  @Environment(\.gutter) private var gutter

  var body: some View {
    VStack(alignment: .leading, spacing: Space.s3) {
      SectionTitle(sectionName(section.kind), count: section.credits.count)
        .padding(.horizontal, gutter)
      CardGrid {
        ForEach(section.credits, id: \.title.id) { credit in
          let detail = personCreditDetail(credit)
          let line = [formatYear(detail.year), detail.role].compactMap(\.self).joined(separator: " · ")
          PosterCard(credit.title, detail: line.isEmpty ? nil : line)
        }
      }
    }
  }

  /// "Acting", "Directing": the web's section names, which are TMDB's departments' words.
  private func sectionName(_ kind: String) -> String {
    switch kind {
    case CreditKind.director: Str.personDepartmentDirecting
    case CreditKind.writer: Str.personDepartmentWriting
    case CreditKind.creator: Str.iosPeopleSectionCreator
    default: Str.personDepartmentActing
    }
  }
}

/// The page while the person loads, as the web's `PersonSkeleton`.
private struct PersonSkeleton: View {
  @Environment(\.gutter) private var gutter
  @Environment(\.windowSize) private var window

  var body: some View {
    let size: CGFloat = window.width >= 640 ? 112 : 80
    VStack(alignment: .leading, spacing: Space.s10) {
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
