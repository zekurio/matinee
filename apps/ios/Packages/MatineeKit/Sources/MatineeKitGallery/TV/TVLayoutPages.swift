#if os(tvOS)
  import MatineeKit
  import SwiftUI

  /// The drawer as the gallery's full-screen pages show it.
  struct GalleryDrawer: View {
    @Binding var current: String
    let memory: TVFocusMemory
    let state: TVDrawerState
    @Environment(TVGallerySettings.self) private var settings

    var body: some View {
      TVNavDrawer(
        top: TVDrawerEntry("profile", label: "Ingrid Halvorsen", icon: nil),
        entries: [
          TVDrawerEntry("search", label: settings.t("Search", "Suche"), icon: .search),
          TVDrawerEntry("home", label: settings.t("Home", "Start"), icon: .house),
          TVDrawerEntry("favorites", label: settings.t("Favorites", "Favoriten"), icon: .heart),
          TVDrawerEntry("movies", label: settings.t("Movies", "Filme"), icon: .film),
          TVDrawerEntry("shows", label: settings.t("Shows", "Serien"), icon: .tv),
        ],
        bottom: TVDrawerEntry("settings", label: settings.t("Settings", "Einstellungen"), icon: .settings),
        selection: current, state: state, onLeave: { memory.restore() }, onPick: { current = $0.id }
      ) {
        Avatar("Ingrid Halvorsen", size: 64)
      }
    }
  }

  extension FocusedValues {
    /// What a gallery page's header and backdrop show: the focused card's title.
    @Entry var galleryTitle: SampleTitle?
    @Entry var galleryFocused: TVHomePage.Focused?
  }

  extension SampleTitle {
    func info(_ locale: Locale) -> TVItemInfo {
      TVItemInfo(
        name: name, facts: facts, contentRating: contentRating,
        rating: rating.formatted(.number.precision(.fractionLength(1)).locale(locale)), overview: overview)
    }
  }

  extension Samples.Episode {
    func info(_ settings: TVGallerySettings) -> TVItemInfo {
      TVItemInfo(
        name: show.name, subtitle: code.isEmpty ? nil : "\(code)  \(name)",
        facts: [String(show.year), left], contentRating: show.contentRating,
        rating: show.rating.formatted(.number.precision(.fractionLength(1)).locale(Locale(identifier: settings.german ? "de" : "en"))),
        overview: show.overview)
    }
  }

  /// Cards and rows: stills with progress, posters, captioned posters, people, each row remembering its card.
  struct TVCardsPage: View {
    @Environment(TVGallerySettings.self) private var settings
    @Environment(\.palette) private var palette
    @State private var memory = TVFocusMemory()
    @State private var actionsFor: SampleTitle?
    @State private var log = ""

    var body: some View {
      ScrollView {
        VStack(alignment: .leading, spacing: TVSpace.rows) {
          VStack(alignment: .leading, spacing: 8) {
            Text(settings.t("Cards and rows", "Karten und Reihen")).textStyle(.headline)
            Text(
              log.isEmpty
                ? settings.t(
                  "Each row remembers its card: go down and back up and focus lands where it left. Hold Select on a poster for its actions.",
                  "Jede Reihe merkt sich ihre Karte: hinunter und wieder hinauf landet der Fokus, wo er war. Select halten zeigt die Aktionen.")
                : log
            )
            .textStyle(.caption).foregroundStyle(palette.mutedForeground)
          }
          .padding(.leading, TVPage.start)
          TVRow(settings.t("Continue watching", "Weiterschauen"), key: "continue", items: Samples.continueWatching, itemKey: \.id, memory: memory) {
            episode in
            TVLandscapeCard(
              episode.show.name, detail: [episode.code, episode.left].filter { !$0.isEmpty }.joined(separator: " · "),
              progress: episode.progress, action: { log = "▶ \(episode.show.name)" }, onPlayPause: { log = "⏯ \(episode.show.name)" }
            ) {
              WideArt(title: episode.show, variant: 1)
            }
          }
          TVRow(settings.t("Recently added in Movies", "Neu in Filme"), key: "posters", items: Samples.titles, itemKey: \.id, memory: memory) { title in
            TVPosterCard(
              title.name, watched: title.id == "orchard", action: { log = title.name }, onLongPress: { actionsFor = title }
            ) {
              PosterArt(title: title)
            }
          }
          TVRow(settings.t("Seasons", "Staffeln"), key: "seasons", items: Array(1...5), itemKey: { "\($0)" }, memory: memory) { number in
            TVCaptionedPoster(
              settings.t("Season \(number)", "Staffel \(number)"), detail: settings.t("\(8 + number) episodes", "\(8 + number) Folgen"),
              badge: number == 5 ? "3" : nil, watched: number < 3, action: {}
            ) {
              PosterArt(title: Samples.title("glass"), showsName: false)
            }
          }
          TVRow(settings.t("Cast and crew", "Besetzung und Team"), key: "people", items: Samples.people.map(\.name), itemKey: { $0 }, memory: memory) {
            name in
            TVPersonCard(name, role: Samples.people.first { $0.name == name }?.role, action: {}) { EmptyView() }
          }
          TVRow(settings.t("A poster still loading, and one with no picture", "Ein Poster lädt noch, eines hat kein Bild"), key: "missing", items: ["a", "b", "c"], itemKey: { $0 }, memory: memory) {
            key in
            TVPosterCard(key == "a" ? "Atlas of Clouds" : key == "b" ? "Foxes in Winter" : "A Title With a Rather Long Name", action: {}) {
              EmptyView()
            }
          }
        }
        .padding(.vertical, TVOverscan.vertical)
      }
      .scrollClipDisabled()
      .ignoresSafeArea()
      .tvActionsPanel(item: $actionsFor, title: \.name, subtitle: { "\($0.year)" }) { _ in
        [
          TVAction(settings.t("Play", "Abspielen"), icon: .playOutline) {},
          TVAction(settings.t("Mark as watched", "Als gesehen markieren"), icon: .check) {},
          TVAction(settings.t("Add to favorites", "Zu Favoriten hinzufügen"), icon: .heart) {},
          TVAction(settings.t("Details", "Details"), icon: .info) {},
        ]
      }
      .onAppear { memory.restore(fallback: ("continue", Samples.continueWatching[0].id)) }
    }
  }

  /// A library's grid under its header, the focused poster named on the line between.
  struct TVGridPage: View {
    @Environment(TVGallerySettings.self) private var settings
    @Environment(\.locale) private var locale
    @State private var memory = TVFocusMemory()
    @State private var drawer = TVDrawerState()
    @State private var current = "movies"
    @State private var focused: SampleTitle?
    @FocusedValue(\.galleryTitle) private var focusedNow
    @State private var sort = "added"
    @State private var sortOpen = false
    @State private var headerShown = true

    var body: some View {
      let titles = (0..<4).flatMap { round in Samples.titles.map { (round, $0) } }
      ZStack(alignment: .leading) {
        TVPosterGrid(titles, itemKey: { "\($0.0)-\($0.1.id)" }, memory: memory, onHeaderChange: { headerShown = $0 }) { entry in
          TVPosterCard(entry.1.name, watched: entry.1.id == "kestrel", width: nil, action: {}) {
            PosterArt(title: entry.1)
          }
          .focusedValue(\.galleryTitle, entry.1)
        } header: {
          HStack(spacing: TVButtons.gap) {
            Text(settings.t("Movies", "Filme")).textStyle(.headline)
              .padding(.trailing, 24)
            TVButton(settings.t("Sort", "Sortieren"), detail: settings.t("Recently added", "Zuletzt hinzugefügt"), trailingIcon: .chevronDown) {
              sortOpen = true
            }
            TVButton(settings.t("Genre", "Genre"), trailingIcon: .chevronDown) {}
            TVButton(settings.t("Unwatched", "Ungesehen"), icon: .eyeOff, active: true) {}
          }
          .padding(.leading, TVPage.start)
        } line: {
          TVFocusLine(focused?.info(locale))
        }
        GalleryDrawer(current: $current, memory: memory, state: drawer)
      }
      .ignoresSafeArea()
      .tvClock(visible: !drawer.isOpen && headerShown)
      .onChange(of: focusedNow) { _, title in if let title { focused = title } }
      .tvOptionsPanel(
        isPresented: $sortOpen, title: settings.t("Sort by", "Sortieren nach"), selection: $sort,
        options: [
          TVOption("added", settings.t("Recently added", "Zuletzt hinzugefügt")),
          TVOption("name", settings.t("Name", "Name")),
        ])
      .onAppear {
        memory.restore(fallback: (TVGrid.row, "0-\(Samples.titles[0].id)"))
        if settings.open == "drawer" { drawer.open() }
        settings.open = nil
      }
    }
  }

  /// Home, mocked up: the focused card's backdrop and header over Home's rows, the drawer, and the clock.
  struct TVHomePage: View {
    @Environment(TVGallerySettings.self) private var settings
    @State private var memory = TVFocusMemory()
    @State private var drawer = TVDrawerState()
    @State private var current = "home"
    @State private var focused: Focused?
    @FocusedValue(\.galleryFocused) private var focusedNow
    @State private var actionsFor: SampleTitle?

    enum Focused: Hashable {
      case title(SampleTitle)
      case episode(Samples.Episode)

      var show: SampleTitle {
        switch self {
        case .title(let title): title
        case .episode(let episode): episode.show
        }
      }
    }

    var body: some View {
      ZStack(alignment: .topLeading) {
        TVBackdrop(focused?.show) { title in
          WideArt(title: title, variant: 2)
        }
        TVItemHeader(info, height: 350) { info in
          if let show = focused?.show {
            TVTitleLogo(info.name, width: 720, height: 100) { LogoArt(title: show) }
          } else {
            TVTitleLogo(info.name)
          }
        }
        .padding(.leading, TVPage.start)
        .padding(.trailing, 440)
        .padding(.top, TVOverscan.vertical + 16)
        ScrollViewReader { reader in
        ScrollView {
          LazyVStack(alignment: .leading, spacing: TVSpace.rows) {
            TVRow(settings.t("Continue watching", "Weiterschauen"), key: "continue", items: Samples.continueWatching, itemKey: \.id, memory: memory) {
              episode in
              TVLandscapeCard(
                episode.show.name, detail: [episode.code, episode.left].filter { !$0.isEmpty }.joined(separator: " · "),
                progress: episode.progress, action: {}
              ) {
                WideArt(title: episode.show, variant: 1)
              }
              .focusedValue(\.galleryFocused, .episode(episode))
            }
            TVRow(settings.t("Featured", "Empfohlen"), key: "featured", items: Array(Samples.titles.prefix(8)), itemKey: \.id, memory: memory) { title in
              TVPosterCard(title.name, watched: title.id == "orchard", action: {}, onLongPress: { actionsFor = title }) {
                PosterArt(title: title)
              }
              .focusedValue(\.galleryFocused, .title(title))
            }
            TVRow(settings.t("Recently added in Shows", "Neu in Serien"), key: "shows", items: Samples.titles.filter { $0.kind == .show }, itemKey: \.id, memory: memory) { title in
              TVPosterCard(title.name, action: {}, onLongPress: { actionsFor = title }) { PosterArt(title: title) }
                .focusedValue(\.galleryFocused, .title(title))
            }
            TVRow(settings.t("Because you watched Kestrel", "Weil du Kestrel gesehen hast"), key: "because", items: Array(Samples.titles.reversed()), itemKey: \.id, memory: memory) { title in
              TVPosterCard(title.name, action: {}, onLongPress: { actionsFor = title }) { PosterArt(title: title) }
                .focusedValue(\.galleryFocused, .title(title))
            }
          }
          .padding(.top, 8)
          .padding(.bottom, 600)
        }
        // Whichever row takes focus scrolls to the top of the rows, under the header, as on Android TV.
        .onChange(of: memory.lastRow) { _, row in
          if let row { withAnimation(Motion.move) { reader.scrollTo(row, anchor: .top) } }
        }
        }
        .mask(LinearGradient(stops: [.init(color: .clear, location: 0.01), .init(color: .black, location: 0.05)], startPoint: .top, endPoint: .bottom))
        .padding(.top, 430)
        GalleryDrawer(current: $current, memory: memory, state: drawer)
      }
      .ignoresSafeArea()
      .tvClock(visible: !drawer.isOpen)
      .onChange(of: focusedNow) { _, item in if let item { focused = item } }
      .onTVBack(isActive: !drawer.isOpen) { drawer.open() }
      .tvActionsPanel(item: $actionsFor, title: \.name, subtitle: { "\($0.year)" }) { _ in
        [
          TVAction(settings.t("Play", "Abspielen"), icon: .playOutline) {},
          TVAction(settings.t("Mark as watched", "Als gesehen markieren"), icon: .check) {},
          TVAction(settings.t("Add to favorites", "Zu Favoriten hinzufügen"), icon: .heart) {},
          TVAction(settings.t("Details", "Details"), icon: .info) {},
        ]
      }
      .onAppear {
        memory.restore(fallback: ("continue", Samples.continueWatching[0].id))
        if settings.open == "drawer" { drawer.open() }
        settings.open = nil
      }
    }

    private var info: TVItemInfo? {
      switch focused {
      case .title(let title): title.info(Locale(identifier: settings.german ? "de" : "en"))
      case .episode(let episode): episode.info(settings)
      case nil: nil
      }
    }
  }
#endif
