#if os(tvOS)
  import MatineeKit
  import SwiftUI

  /// The side panel and its options and actions, each opened from a button.
  struct TVPanelsPage: View {
    @Environment(TVGallerySettings.self) private var settings
    @State private var sortOpen = false
    @State private var actionsFor: SampleTitle?
    @State private var dayOpen = false
    @State private var loadingOpen = false
    @State private var sort = "added"
    @State private var day = Date(timeIntervalSince1970: 1_731_628_800)
    @State private var log = ""

    var body: some View {
      TVGalleryPage(settings.t("Side panels", "Seitenleisten")) {
        TVDemo(
          settings.t("At the right edge, in place of sheets and menus", "Am rechten Rand, statt Sheets und Menüs"),
          note: settings.t(
            "Focus starts on the choice in force and stays in the panel; Menu closes it and focus goes back to the button. A card's long press opens its actions.",
            "Der Fokus beginnt bei der gewählten Option und bleibt in der Leiste; Menü schließt sie und der Fokus kehrt zurück.")
        ) {
          HStack(spacing: TVButtons.gap) {
            TVButton(settings.t("Sort", "Sortieren"), detail: sortName, trailingIcon: .chevronDown) { sortOpen = true }
            TVButton(settings.t("Actions", "Aktionen"), icon: .ellipsis) { actionsFor = Samples.title("harbour") }
            TVButton(settings.t("Watched on…", "Gesehen am …"), icon: .calendarClock) { dayOpen = true }
            TVButton(settings.t("Loading", "Lädt"), icon: .loaderCircle) { loadingOpen = true }
          }
          if !log.isEmpty { TVCaption(log) }
        }
        TVDemo(settings.t("Long press a poster", "Ein Poster lange drücken")) {
          HStack(spacing: TVCards.gap) {
            ForEach(Samples.titles.prefix(4)) { title in
              TVPosterCard(title.name, action: { log = settings.t("Opened \(title.name)", "\(title.name) geöffnet") }, onLongPress: { actionsFor = title }) {
                PosterArt(title: title)
              }
            }
          }
          .padding(.vertical, 24)
        }
      }
      .tvOptionsPanel(
        isPresented: $sortOpen, title: settings.t("Sort by", "Sortieren nach"), selection: $sort,
        options: [
          TVOption("added", settings.t("Recently added", "Zuletzt hinzugefügt")),
          TVOption("released", settings.t("Release date", "Erscheinungsdatum")),
          TVOption("name", settings.t("Name", "Name")),
          TVOption("rating", settings.t("Rating", "Bewertung"), detail: "IMDb"),
          TVOption("runtime", settings.t("Runtime", "Laufzeit")),
          TVOption("random", settings.t("Shuffle", "Zufällig")),
        ])
      .tvActionsPanel(item: $actionsFor, title: \.name, subtitle: { "\($0.year)" }) { title in
        [
          TVAction(settings.t("Play", "Abspielen"), icon: .playOutline) { log = settings.t("Play \(title.name)", "\(title.name) abspielen") },
          TVAction(settings.t("Mark as watched", "Als gesehen markieren"), icon: .check) { dayOpen = true },
          TVAction(settings.t("Add to favorites", "Zu Favoriten hinzufügen"), icon: .heart) {},
          TVAction(settings.t("Details", "Details"), icon: .info) {},
          TVAction(settings.t("Not interested", "Kein Interesse"), icon: .eyeOff, destructive: true) {},
        ]
      }
      .tvSidePanel(
        isPresented: $dayOpen, title: settings.t("When did you watch it?", "Wann hast du es gesehen?"),
        description: "The Long Harbour"
      ) {
        DayRows(day: $day)
      }
      .tvSidePanel(isPresented: $loadingOpen, title: settings.t("Audio", "Audio"), loading: true) {}
      .onAppear {
        switch settings.open {
        case "sort": sortOpen = true
        case "actions": actionsFor = Samples.title("harbour")
        case "day": dayOpen = true
        case "loading": loadingOpen = true
        default: break
        }
        settings.open = nil
      }
    }

    private var sortName: String {
      switch sort {
      case "released": settings.t("Release date", "Erscheinungsdatum")
      case "name": settings.t("Name", "Name")
      case "rating": settings.t("Rating", "Bewertung")
      case "runtime": settings.t("Runtime", "Laufzeit")
      case "random": settings.t("Shuffle", "Zufällig")
      default: settings.t("Recently added", "Zuletzt hinzugefügt")
      }
    }
  }

  /// The day something was watched, as Android TV's panel asks it: day, month, and year, each stepped by Left and Right.
  private struct DayRows: View {
    @Binding var day: Date
    @Environment(\.overlayDismiss) private var dismiss
    @Environment(\.locale) private var locale
    @Environment(TVGallerySettings.self) private var settings

    var body: some View {
      let calendar = Calendar.current
      TVStepRow(day.formatted(.dateTime.day().locale(locale))) { step(.day, $0, calendar) }
      TVStepRow(day.formatted(.dateTime.month(.wide).locale(locale))) { step(.month, $0, calendar) }
      TVStepRow(day.formatted(.dateTime.year().locale(locale))) { step(.year, $0, calendar) }
      TVListItem(settings.t("Mark as watched", "Als gesehen markieren"), icon: .check, quiet: true) { dismiss() }
        .padding(.top, 24)
    }

    private func step(_ component: Calendar.Component, _ by: Int, _ calendar: Calendar) {
      if let next = calendar.date(byAdding: component, value: by, to: day) { day = min(next, .now) }
    }
  }

  /// The search field, the clock, and the drawer over a page.
  struct TVSearchPage: View {
    @Environment(TVGallerySettings.self) private var settings
    @State private var query = ""
    @State private var current = "search"
    @State private var memory = TVFocusMemory()
    @State private var drawer = TVDrawerState()
    @FocusState private var fieldFocused: Bool

    var body: some View {
      let results = query.isEmpty ? Array(Samples.titles.prefix(8)) : Samples.titles.filter { $0.name.localizedCaseInsensitiveContains(query) }
      ZStack(alignment: .leading) {
        VStack(alignment: .leading, spacing: 48) {
          Text(settings.t("Search", "Suche")).textStyle(.headline)
            .padding(.leading, TVPage.start)
          TVSearchField(text: $query, placeholder: settings.t("Movies, shows, people", "Filme, Serien, Personen"), focus: $fieldFocused)
            .frame(maxWidth: 1100)
            .padding(.leading, TVPage.start)
            .focusSection()
          TVRow(
            query.isEmpty ? settings.t("Recently added", "Zuletzt hinzugefügt") : settings.t("\(results.count) results", "\(results.count) Treffer"),
            key: "results", items: results, itemKey: \.id, memory: memory
          ) { title in
            TVCaptionedPoster(title.name, detail: "\(title.year)", action: {}) { PosterArt(title: title, showsName: false) }
          }
          Spacer(minLength: 0)
        }
        .padding(.top, TVOverscan.vertical + 12)
        TVNavDrawer(
          top: TVDrawerEntry("profile", label: "Ingrid", icon: nil),
          entries: [
            TVDrawerEntry("search", label: settings.t("Search", "Suche"), icon: .search),
            TVDrawerEntry("home", label: settings.t("Home", "Start"), icon: .house),
            TVDrawerEntry("favorites", label: settings.t("Favorites", "Favoriten"), icon: .heart),
            TVDrawerEntry("movies", label: settings.t("Movies", "Filme"), icon: .film),
            TVDrawerEntry("shows", label: settings.t("Shows", "Serien"), icon: .tv),
          ],
          bottom: TVDrawerEntry("settings", label: settings.t("Settings", "Einstellungen"), icon: .settings),
          selection: current, state: drawer, onLeave: { memory.restore() }, onPick: { current = $0.id }
        ) {
          Avatar("Ingrid Halvorsen", size: 64)
        }
      }
      .ignoresSafeArea()
      .tvClock(visible: !drawer.isOpen)
      .defaultFocus($fieldFocused, true)
      .onAppear {
        if settings.open == "drawer" { drawer.open() }
        if settings.open == "keyboard" { fieldFocused = true }
        settings.open = nil
      }
    }
  }
#endif
