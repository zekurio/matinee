import MatineeCore
import MatineeKit
import SwiftUI

/*
 * BrowseScreen.kt: a genre's or a studio's titles from every library, and
 * a person's page, which Android keeps here too.
 */

/// A genre's or a studio's titles across the server.
struct BrowseScreen: View {
  let genre: String?
  let studio: String?

  @State private var kind: String?
  @State private var pages = makeTitlePages()
  @Environment(\.palette) private var palette

  var body: some View {
    let genre = genre
    let studio = studio
    let kind = kind
    PosterGrid(
      pages, detail: { formatYear($0.year) },
      empty: { GridEmpty(genre != nil ? Str.browseGenreEmpty : Str.browseStudioEmpty) }
    ) {
      VStack(alignment: .leading, spacing: 0) {
        Text(
          [genre != nil ? Str.browseGenre : Str.browseStudio, pages.total.map { Str.browseTitleCount($0) }]
            .compactMap(\.self).joined(separator: " · ")
        )
        .textStyle(.sm)
        .foregroundStyle(palette.mutedForeground)
        Gap(12)
        ScrollView(.horizontal) {
          HStack(spacing: 6) {
            ForEach(BROWSE_KINDS, id: \.self) { value in
              LegacyChip(browseKindLabel(value), selected: self.kind == value) { self.kind = value }
            }
          }
        }
        .scrollIndicators(.hidden)
        .scrollClipDisabled()
        .padding(.bottom, 12)
      }
    }
    .pages(pages, key: kind ?? "") { api, offset, limit in
      var genre = genre
      var studio = studio
      #if DEBUG
        // The fixtures' genres and studios aren't the server's: show its titles.
        if BrowseFixtures.on { (genre, studio) = (nil, nil) }
      #endif
      let page = try await api.titles.browse(kind: kind, filters: TitleFilters(genres: genre.map { [$0] }, studios: studio.map { [$0] }), limit: limit, offset: offset)
      return TitleList(items: page.items, total: page.total)
    }
    .legacyTopBar(genre ?? studio ?? "")
  }
}

/// A person's page: who they are and what they're in. Android keeps it in BrowseScreen.kt.
struct PersonScreen: View {
  let name: String

  @State private var person = Loader<Person>()
  @Environment(\.api) private var api
  @Environment(\.palette) private var palette

  var body: some View {
    let name = name
    Group {
      switch person.state {
      case .loading: LoadingBox()
      case .failed(let message, let disconnected):
        ErrorBox(Str.personLoadFailed, message, disconnected: disconnected, onRetry: person.reload)
      case .ready(let value): content(value)
      }
    }
    .loads(person) { api in
      #if DEBUG
        if BrowseFixtures.on { return try await BrowseFixtures.person(name, api: api) }
      #endif
      return try await api.people.get(name: name)
    }
    .legacyTopBar(nil, home: true) { DisconnectedAction(person) }
  }

  private func content(_ value: Person) -> some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 0) {
        PersonHeader(person: value, photo: api?.art(value.photo, size: .medium))
          .padding(.horizontal, Space.gutter)
          .padding(.top, 8)
          .padding(.bottom, 32)
        CardGrid {
          ForEach(value.credits, id: \.id) { credit in
            PosterCard(
              credit.title,
              detail: credit.role ?? formatYear(credit.title.year) ?? creditKind(credit.kind, count: 1))
          }
        }
      }
      .padding(.bottom, 32)
    }
    .refreshable {
      person.reload()
      await person.settled()
    }
  }
}

/// The photo on its circle, the name, and what they're known for with how many titles.
private struct PersonHeader: View {
  let person: Person
  let photo: ImageSource?
  @Environment(\.palette) private var palette
  @Environment(\.dynamicTypeSize) private var typeSize

  var body: some View {
    let layout =
      typeSize.isAccessibilitySize
      ? AnyLayout(VStackLayout(alignment: .leading, spacing: 16)) : AnyLayout(HStackLayout(spacing: 20))
    layout {
      Circle()
        .fill(palette.secondary)
        .overlay {
          Text(initials(person.name)).textStyle(.px26, weight: .bold, tracking: .tight).foregroundStyle(palette.mutedForeground)
            .accessibilityHidden(true)
        }
        .overlay { Picture(photo) }
        .clipShape(Circle())
        .frame(width: 112, height: 112)
        .accessibilityHidden(true)
      VStack(alignment: .leading, spacing: 4) {
        Text(person.name).textStyle(.px26, weight: .bold, tracking: .tight).foregroundStyle(palette.foreground)
          .accessibilityAddTraits(.isHeader)
        Text([creditKind(person.kind, count: 1), Str.browseTitleCount(person.titleCount)].joined(separator: " · "))
          .textStyle(.sm)
          .foregroundStyle(palette.mutedForeground)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
  }
}

extension PersonCredit {
  /// A title once for each way they're credited on it, as Android keys them.
  fileprivate var id: String { "\(title.id)-\(kind)" }
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
