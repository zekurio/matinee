#if DEBUG
  import MatineeCore
  import MatineeKit
  import SwiftUI

  // MARK: Cards

  struct CardsPage: View {
    let server: GalleryServer
    @Environment(\.windowSize) private var window
    @Environment(\.gutter) private var gutter

    var body: some View {
      VStack(alignment: .leading, spacing: Space.s7) {
        GalleryHeading("Made up here, no artwork: the placeholders")
        Rail(Str.browseContinueWatching) {
          ForEach(Sample.episodes, id: \.id) { item in RailItem(.landscape) { EpisodeCard(item) } }
        }
        Rail(Str.browseRecentlyAdded("Movies"), onTitleTap: {}) {
          ForEach(Sample.movies, id: \.id) { title in
            RailItem(.poster) { PosterCard(title, detail: formatYear(title.year)) }
          }
          RailItem(.poster) { ShelfCard(Sample.shelf(Sample.show, added: 1)) }
          RailItem(.poster) { ShelfCard(Sample.shelf(Sample.show, added: 3)) }
          RailItem(.poster) { ShelfCard(Sample.shelf(Sample.show, added: nil)) }
        }

        GalleryHeading("With pictures, and one still loading")
        Rail(Str.titleCast) {
          RailItem(.person) { PersonCard("Keanu Reeves", role: "Neo", photo: Sample.face) }
          RailItem(.person) { PersonCard("Carrie-Anne Moss", role: "Trinity", photo: nil) }
          RailItem(.person) { PersonCard("Hugo Weaving", role: "Agent Smith", photo: Sample.loading) }
        }
        Rail(Str.webDiscoverRailForYou) {
          ForEach(Array(Sample.posters.enumerated()), id: \.0) { index, poster in
            RailItem(.poster) {
              VStack(alignment: .leading, spacing: 0) {
                PosterArt(name: Sample.movies[index].name, poster: poster, watched: index == 1)
                CardText(Sample.movies[index].name, formatYear(Sample.movies[index].year))
              }
            }
          }
          RailItem(.poster) {
            VStack(alignment: .leading, spacing: 0) {
              PosterArt(name: "Loading", poster: Sample.loading)
              CardText("Loading", nil)
            }
          }
        }

        GalleryHeading("Episode rows")
        VStack(spacing: Space.s1) {
          ForEach(Sample.episodes.prefix(3), id: \.id) { EpisodeRow($0) }
        }
        .padding(.horizontal, gutter)

        GalleryHeading("Grid: \(window.width < 640 ? "two columns" : "176 and up")")
        CardGrid {
          ForEach(Sample.movies + [Sample.show], id: \.id) { PosterCard($0, detail: formatYear($0.year)) }
        }

        ServerRails(server: server)
      }
    }
  }

  /// The dev server's Home, through the real loaders.
  struct ServerRails: View {
    let server: GalleryServer

    var body: some View {
      if server.api == nil {
        GalleryHeading("No dev server: launch with -gallery.server and -gallery.token")
      } else {
        VStack(alignment: .leading, spacing: Space.s7) {
          GalleryHeading("From the dev server")
          rail(Str.browseContinueWatching, server.resume)
            .loads(server.resume) { try await $0.home.continueWatching() }
          rail(Str.browseNextUp, server.nextUp)
            .loads(server.nextUp) { try await $0.home.nextUp().map(\.item) }
          shelves
            .loads(server.shelves) { api in
              var shelves: [(Library, [ShelfEntry])] = []
              for library in try await api.libraries.list() {
                shelves.append((library, try await api.media.shelf(libraryId: library.id)))
              }
              return shelves
            }
        }
      }
    }

    @ViewBuilder private func rail(_ title: String, _ loader: Loader<[MediaItem]>) -> some View {
      switch loader.state {
      case .loading: RailSkeleton(title: title, art: .landscape)
      case .failed(_, let disconnected):
        RailFailed(title: title, retrying: loader.refreshing, disconnected: disconnected, onRetry: loader.reload)
      case .ready(let items):
        Rail(title) { ForEach(items, id: \.id) { item in RailItem(.landscape) { EpisodeCard(item) } } }
      }
    }

    @ViewBuilder private var shelves: some View {
      switch server.shelves.state {
      case .loading: RailSkeleton(title: nil, art: .poster)
      case .failed(let message, let disconnected):
        ErrorSection(Str.homeLoadFailed, message, disconnected: disconnected, onRetry: server.shelves.reload)
      case .ready(let shelves):
        VStack(alignment: .leading, spacing: Space.s7) {
          ForEach(shelves, id: \.0.id) { library, entries in
            Rail(Str.browseRecentlyAdded(library.name), onTitleTap: {}) {
              ForEach(entries, id: \.title.id) { entry in RailItem(.poster) { ShelfCard(entry) } }
            }
          }
        }
      }
    }
  }

  // MARK: States

  struct StatesPage: View {
    @Environment(\.palette) private var palette

    var body: some View {
      VStack(alignment: .leading, spacing: Space.s7) {
        GalleryHeading("A page's spinner")
        LoadingBox().frame(height: 120)

        GalleryHeading("A page that failed, from a tab and from a page opened from one")
        ErrorBox(Str.homeFailed, Str.errorUnreadable) {}.frame(height: 260)
        ErrorBox(Str.titleLoadError, Str.errorConnectionLost) {}
          .environment(\.homeAction, {})
          .frame(height: 260)

        GalleryHeading("Without the server: the cloud, no words")
        ErrorBox(Str.homeFailed, Str.errorUnreachable, disconnected: true) {}.frame(height: 200)

        GalleryHeading("A section that failed, among what loaded")
        ErrorSection(Str.homeShelfFailed, Str.errorConnectionLost) {}
        ErrorSection(Str.homeShelfFailed, retrying: true) {}
        RailFailed(title: Str.browseNextUp) {}

        GalleryHeading("Loading rails")
        RailSkeleton(title: Str.browseRecentlyAdded("Movies"), art: .poster)
        RailSkeleton(title: nil, art: .landscape)

        GalleryHeading("Nothing yet")
        EmptyState(icon: .folderPlus, title: Str.browseHomeNoLibraries, description: Str.browseHomeNoLibrariesAdmin)
        EmptyState(icon: .download, title: Str.downloadsEmpty, description: Str.downloadsEmptyHint)
      }
    }
  }

  // MARK: Bars

  struct BarsPage: View {
    @Environment(\.gutter) private var gutter
    /// The card in view, as Home keeps it for the iPad's banner.
    @State private var featured: String?

    var body: some View {
      VStack(alignment: .leading, spacing: Space.s7) {
        GalleryHeading("Home's header and featured titles, with what a provider would send")
        VStack(alignment: .leading, spacing: 0) {
          AppHeader { RoundIconButton(.cloudOff, label: Str.serverUnreachable, look: .ghost, size: 40, iconSize: 20) {} }
          HomeCarousel(slides: Sample.featured, showing: $featured)
        }
        GalleryHeading("Featured titles while they load")
        HomeCarouselSkeleton()

        GalleryHeading("Back and Home over art, and the back swipe")
        NavigationLink(value: Sample.movies[0].name) {
          ZStack(alignment: .topLeading) {
            Picture(Sample.still).aspectRatio(16 / 9, contentMode: .fit).background(Tone("bars"))
            ItemTopBar(parent: Sample.show.name) {}
          }
          .clipShape(RoundedRectangle.kit(Radius.xl))
        }
        .padding(.horizontal, gutter)

        GalleryHeading("Search")
        SearchFieldDemo().padding(.horizontal, gutter)
        SearchBarButton {}.padding(.horizontal, gutter)

        GalleryHeading("Headings: a tab's page, and sections with a link and a count")
        PageHeading(Str.tabMedia) { RoundIconButton(.cloudOff, label: Str.serverUnreachable, look: .ghost, size: 40) {} }
        SectionTitle(Str.browseContinueWatching) {}.padding(.horizontal, gutter)
        SectionTitle(Str.searchTitlesHeading, count: 12).padding(.horizontal, gutter)
      }
    }
  }

  private struct SearchFieldDemo: View {
    @State private var query = "Matrix"

    var body: some View { SearchField($query) }
  }

  // MARK: Sheets

  struct SheetsPage: View {
    @Environment(\.actions) private var actions
    @Environment(\.gutter) private var gutter
    @State private var filtering = UserDefaults.standard.string(forKey: "gallery.open") == "filters"
    @State private var genres: [String] = ["Drama"]
    @State private var kind: String?
    @State private var years: (Double?, Double?) = (1990, nil)
    @State private var picking = false
    @State private var language: String?

    var body: some View {
      VStack(alignment: .leading, spacing: Space.s7) {
        GalleryHeading("A long press on a card opens these")
        VStack(alignment: .leading, spacing: Space.s3) {
          MatineeButton("A file's actions", look: .secondary) { actions?.open(.item(Sample.episodes[0], here: false)) }
          MatineeButton("A title's, from a recommendation", look: .secondary) {
            actions?.open(
              .title(
                Sample.movies[0], file: nil, here: false,
                recommended: CatalogRef(kind: TitleKind.movie, provider: "tmdb", providerId: "603")))
          }
          MatineeButton("When it was watched", look: .secondary) {
            actions?.askWatched(Sample.movies[0].name) { _ in }
          }
        }
        .padding(.horizontal, gutter)

        GalleryHeading("The filters a library opens")
        HStack {
          FilterButton(active: genres.count + (kind == nil ? 0 : 1)) { filtering = true }
          ActiveFilterChips(
            chips: genres.map { genre in ActiveFilter(key: genre, label: genre) { genres.removeAll { $0 == genre } } },
            onClear: { genres = [] })
        }
        .padding(.leading, gutter)

        GalleryHeading("A QR code, for a TV to sign in")
        QrCode("http://localhost:18420/link?code=BCDF-GHJK", label: "Sign-in code", size: 200)
          .padding(.horizontal, gutter)
      }
      .filterSheet(isPresented: $filtering, active: genres.count, onClear: { genres = [] }) {
        FilterSection(Str.webFiltersProgress) {
          ChoiceChips(
            choices: [FilterChoice(value: "movie", label: Str.webLibrariesDialogKindMovies, count: 1204),
              FilterChoice(value: "show", label: Str.webLibrariesDialogKindShows, count: 86)],
            value: $kind)
        }
        FilterSection(Str.webFiltersGenres) {
          ToggleChips(
            choices: ["Action", "Comedy", "Drama", "Science Fiction", "Thriller", "Western"].map {
              FilterChoice(value: $0, label: $0, count: $0.count * 7)
            }, value: $genres)
        }
        RangeField(
          title: Str.webFiltersYears, span: FilterSpan(min: 1950, max: 2026, step: 1), low: years.0, high: years.1,
          words: { rangeText($0, $1, format: yearText, any: Str.webFiltersAnyYear, words: .year) }
        ) { years = ($0, $1) }
        FilterSection(Str.webFiltersLanguage) {
          OptionRow(label: language ?? Str.webFiltersAnyLanguage) { picking = true }
        }
      }
      .optionSheet(
        isPresented: $picking, title: Str.webFiltersLanguage, any: Str.webFiltersAnyLanguage,
        findPlaceholder: Str.searchField,
        choices: ["English", "German", "Japanese", "Korean"].map { FilterChoice(value: $0, label: $0) },
        current: language
      ) { language = $0 }
      .onAppear {
        switch UserDefaults.standard.string(forKey: "gallery.open") {
        case "actions": actions?.open(.item(Sample.episodes[0], here: false))
        case "watched": actions?.askWatched(Sample.movies[0].name) { _ in }
        default: break
        }
      }
    }
  }
#endif
