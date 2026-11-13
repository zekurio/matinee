import MatineeCore
import SwiftUI

/*
 * SearchScreen.kt: search across the server, the search tab's first page.
 * The field is the system's for a search tab, where iOS puts it; what it
 * finds is Android's: the titles by library, then cast and crew, genres,
 * and studios.
 */

/// Search across the server: the search tab's first page.
struct SearchScreen: View {
  @State private var query = ""
  @State private var search = SearchState()
  @State private var libraries = Loader<[Library]>()
  /// Moves with the keyboard's Search key, which searches without waiting.
  @State private var submitted = 0
  @State private var focusedOnce = false
  @FocusState private var focused: Bool
  @Environment(\.palette) private var palette

  var body: some View {
    let text = query.trimmingCharacters(in: .whitespacesAndNewlines)
    Group {
      if text.isEmpty {
        // The field's prompt already says what search finds.
        palette.background.ignoresSafeArea()
      } else if search.failed {
        Hint(Str.searchFailed)
      } else if let found = search.results {
        if found.isEmpty {
          Hint(Str.searchNoMatch(text), detail: Str.searchNoMatchHint, icon: .searchX)
        } else {
          SearchResultsList(found: found, names: names, searching: search.searching)
        }
      } else {
        ProgressView().tint(palette.accent).padding(32).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
          .accessibilityLabel(Str.searchSearching)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    .searchable(text: $query, prompt: Text(Str.searchField))
    .searchFocused($focused)
    .onSubmit(of: .search) { submitted += 1 }
    .autocorrectionDisabled()
    .searchEffect(search, query: query, submitted: submitted)
    .loads(libraries) { api in try await api.libraries.list() }
    .topBar(Str.searchTitle)
    .onAppear {
      // The field takes the keyboard when the tab first opens, as Android's does.
      if !focusedOnce, query.isEmpty {
        focusedOnce = true
        focused = true
      }
    }
    .background {
      Button(Str.searchTitle) { focused = true }.keyboardShortcut("f").hidden()
    }
  }

  private var names: [String: String] {
    Dictionary((libraries.state.value ?? []).map { ($0.id, $0.name) }, uniquingKeysWith: { first, _ in first })
  }
}

/// What a search found, in Android's order.
private struct SearchResultsList: View {
  let found: SearchResults
  let names: [String: String]
  let searching: Bool
  @Environment(\.api) private var api
  @Environment(\.navigator) private var nav
  @Environment(\.palette) private var palette

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 20) {
        ForEach(found.titlesByLibrary(), id: \.libraryId) { group in
          VStack(alignment: .leading, spacing: 20) {
            // On one baseline: the count's smaller line would sit low at the boxes' bottom.
            HStack(alignment: .firstTextBaseline, spacing: 10) {
              Text(names[group.libraryId] ?? Str.searchTitlesHeading).textStyle(.titleLarge)
                .foregroundStyle(palette.foreground)
                .accessibilityAddTraits(.isHeader)
              Text(Str.browseTitleCount(group.titles.count)).textStyle(.bodyMedium).foregroundStyle(palette.muted)
            }
            .padding(.horizontal, Gutter)
            CardGrid {
              ForEach(group.titles, id: \.id) { title in PosterCard(title, detail: formatYear(title.year)) }
            }
          }
        }
        if !found.people.isEmpty {
          Rail(Str.searchSectionCast) {
            ForEach(found.people, id: \.name) { person in
              RailItem(.person) {
                PersonCard(person.name, role: creditKind(person.kind, count: 1), photo: api?.art(person.photo, size: .thumb))
              }
            }
          }
        }
        if !found.genres.isEmpty {
          Facets(title: Str.searchSectionGenres, facets: found.genres) { nav.genre($0) }
        }
        if !found.studios.isEmpty {
          Facets(title: Str.searchSectionStudios, facets: found.studios) { nav.studio($0) }
        }
        if searching {
          Text(Str.searchSearching).textStyle(.bodySmall).foregroundStyle(palette.muted).padding(.horizontal, Gutter)
        }
      }
      .padding(.top, 8)
      .padding(.bottom, 24)
    }
    .scrollDismissesKeyboard(.immediately)
    .scrollsToTopOnReselect()
  }
}

/// Genres or studios that matched, as chips that open their page.
private struct Facets: View {
  let title: String
  let facets: [Facet]
  let open: (String) -> Void

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      SectionTitle(title)
      FlowRow(spacing: 6) {
        ForEach(facets, id: \.name) { facet in Chip(facet.name) { open(facet.name) } }
      }
    }
    .padding(.horizontal, Gutter)
  }
}

/// Why there's nothing to show: an icon, what happened, and what to try.
private struct Hint: View {
  let text: String
  var detail: String?
  var icon: Lucide?
  @Environment(\.palette) private var palette

  init(_ text: String, detail: String? = nil, icon: Lucide? = nil) {
    self.text = text
    self.detail = detail
    self.icon = icon
  }

  var body: some View {
    VStack(spacing: 0) {
      if let icon {
        LucideIcon(icon, size: 28, tint: palette.muted)
        Gap(12)
      }
      Text(text).textStyle(.bodyLarge).foregroundStyle(detail != nil ? palette.foreground : palette.muted)
      if let detail {
        Gap(4)
        Text(detail).textStyle(.bodyMedium).foregroundStyle(palette.muted)
      }
    }
    .multilineTextAlignment(.center)
    .padding(.horizontal, 32)
    .padding(.vertical, 48)
    .frame(maxWidth: .infinity)
    .accessibilityElement(children: .combine)
  }
}

/// Rows of views that wrap at the width, as Compose's `FlowRow`.
private struct FlowRow: Layout {
  var spacing: CGFloat

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    let rows = arrange(subviews, width: proposal.width ?? .infinity)
    let width = rows.map(\.width).max() ?? 0
    let height = rows.map(\.height).reduce(0, +) + spacing * CGFloat(max(rows.count - 1, 0))
    return CGSize(width: proposal.width ?? width, height: height)
  }

  func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
    var y = bounds.minY
    for row in arrange(subviews, width: bounds.width) {
      var x = bounds.minX
      for index in row.indices {
        let size = subviews[index].sizeThatFits(ProposedViewSize(width: bounds.width, height: nil))
        subviews[index].place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
        x += size.width + spacing
      }
      y += row.height + spacing
    }
  }

  private struct Row {
    var indices: [Int] = []
    var width: CGFloat = 0
    var height: CGFloat = 0
  }

  private func arrange(_ subviews: Subviews, width: CGFloat) -> [Row] {
    var rows: [Row] = []
    var row = Row()
    for index in subviews.indices {
      let size = subviews[index].sizeThatFits(ProposedViewSize(width: width, height: nil))
      let needed = row.indices.isEmpty ? size.width : row.width + spacing + size.width
      if !row.indices.isEmpty, needed > width {
        rows.append(row)
        row = Row()
      }
      row.width = row.indices.isEmpty ? size.width : row.width + spacing + size.width
      row.height = max(row.height, size.height)
      row.indices.append(index)
    }
    if !row.indices.isEmpty { rows.append(row) }
    return rows
  }
}
