#if os(tvOS)
  @_spi(Gallery) import MatineeKit
  import SwiftUI

  /// The TV pages of the gallery.
  enum TVRoute: String, CaseIterable, Hashable, Identifiable {
    case focus, scale, buttons, lists, panels, search, cards, grid, home, remote, phone

    var id: String { rawValue }

    func title(_ de: Bool) -> String {
      switch self {
      case .focus: de ? "Fokus" : "Focus"
      case .scale: de ? "Maße und Schrift" : "Scale and type"
      case .buttons: de ? "Schaltflächen und Chips" : "Buttons and chips"
      case .lists: de ? "Listen" : "Lists"
      case .panels: de ? "Seitenleisten" : "Side panels"
      case .search: de ? "Suche, Uhr, Navigation" : "Search, clock, drawer"
      case .cards: de ? "Karten und Reihen" : "Cards and rows"
      case .grid: de ? "Posterraster" : "Poster grid"
      case .home: de ? "Startseite (Entwurf)" : "Home, a mock-up"
      case .remote: de ? "Fernbedienung" : "Remote"
      case .phone: de ? "Telefon-Kit auf dem TV" : "The phone kit on TV"
      }
    }

    func subtitle(_ de: Bool) -> String {
      switch self {
      case .focus: de ? "Bilder heben sich, Bedienelemente füllen sich" : "Pictures lift, controls fill: the choice, side by side"
      case .scale: de ? "Schriftgrößen, Ränder, Abstände" : "Type, overscan, spacing, sizes"
      case .buttons: de ? "TVButton, Symbol- und Rundknöpfe, Chips" : "TVButton, icon and round buttons, chips"
      case .lists: de ? "Zeilen, Werte, Schalter, Überschriften" : "Rows, values, switches, headings"
      case .panels: de ? "Optionen und Aktionen am rechten Rand" : "Options and actions at the right edge"
      case .search: de ? "Suchfeld, Uhr, die Leiste links" : "The search field, the clock, the left drawer"
      case .cards: de ? "Poster, Standbilder, Personen, Fokus-Gedächtnis" : "Posters, stills, people, focus memory"
      case .grid: de ? "Ein Raster mit Kopfzeile" : "A grid with its header and focus line"
      case .home: de ? "Alles zusammen über einem Hintergrund" : "Everything together over a backdrop"
      case .remote: de ? "Play/Pause, Menü, Wischen und Spulen" : "Play/Pause, Menu, presses, and a scrubber"
      case .phone: de ? "Die Telefon-Galerie, wie sie auf dem TV aussieht" : "The phone gallery, as it looks on a TV"
      }
    }

    var icon: Lucide {
      switch self {
      case .focus: .eye
      case .scale: .palette
      case .buttons: .playOutline
      case .lists: .list
      case .panels: .galleryHorizontalEnd
      case .search: .search
      case .cards: .film
      case .grid: .libraryBig
      case .home: .house
      case .remote: .tvPlay
      case .phone: .smartphone
      }
    }
  }

  /// What the TV gallery is seen through.
  @Observable
  final class TVGallerySettings {
    var scheme: ColorScheme
    var accent: GalleryAccent
    var german: Bool
    var open: String?
    var phone: Bool

    init(_ launch: GalleryLaunch) {
      phone = launch.page == "phone"
      scheme = launch.scheme ?? .dark
      accent = launch.accent.flatMap(GalleryAccent.init(rawValue:)) ?? .matinee
      german = launch.locale == "de"
      open = launch.open
    }

    /// The gallery's own words in the language picked: `t("Movies", "Filme")`.
    func t(_ en: String, _ de: String) -> String { german ? de : en }
  }

  /// The kit's TV gallery: every TV component, focused and not, in light
  /// and dark, each palette, and German, driven by the remote.
  public struct TVKitGallery: View {
    @State private var settings: TVGallerySettings
    @State private var path: [TVRoute]

    public init(launch: GalleryLaunch = GalleryLaunch()) {
      _settings = State(initialValue: TVGallerySettings(launch))
      _path = State(initialValue: launch.page.flatMap(TVRoute.init(rawValue:)).map { $0 == .phone ? [] : [$0] } ?? [])
    }

    public var body: some View {
      if settings.phone {
        // The phone's gallery as it is, to see how its pieces fare on a TV. Menu at its root comes back.
        KitGallery().onExitCommand { settings.phone = false }
      } else {
        stack
      }
    }

    private var stack: some View {
      NavigationStack(path: $path) {
        TVGalleryHome(settings: settings) { route in
          if route == .phone { settings.phone = true } else { path.append(route) }
        }
          .navigationDestination(for: TVRoute.self) { route in
            page(route).toolbar(.hidden, for: .navigationBar)
          }
          .toolbar(.hidden, for: .navigationBar)
      }
      .environment(settings)
      .environment(\.locale, Locale(identifier: settings.german ? "de" : "en"))
      .matineeTheme(settings.accent.theme, mode: settings.scheme == .light ? .light : .dark)
    }

    @ViewBuilder private func page(_ route: TVRoute) -> some View {
      switch route {
      case .focus: TVFocusPage()
      case .scale: TVScalePage()
      case .buttons: TVButtonsPage()
      case .lists: TVListsPage()
      case .panels: TVPanelsPage()
      case .search: TVSearchPage()
      case .cards: TVCardsPage()
      case .grid: TVGridPage()
      case .home: TVHomePage()
      case .remote: TVRemotePage()
      case .phone: EmptyView()
      }
    }
  }

  private struct TVGalleryHome: View {
    @Bindable var settings: TVGallerySettings
    let open: (TVRoute) -> Void
    @Environment(\.palette) private var palette

    var body: some View {
      let de = settings.german
      ScrollView {
        HStack(alignment: .top, spacing: 96) {
          VStack(alignment: .leading, spacing: TVListItems.gap) {
            VStack(alignment: .leading, spacing: 8) {
              Text("MatineeKit TV").textStyle(.headline)
              Text(settings.t("The kit, for the couch.", "Das Kit, fürs Sofa."))
                .textStyle(.body).foregroundStyle(palette.mutedForeground)
            }
            .padding(.leading, TVListItems.inset)
            .padding(.bottom, 32)
            TVListHeading(settings.t("Seen through", "Ansicht"))
            TVListItem(settings.t("Appearance", "Erscheinungsbild"), icon: .sun, action: {
              settings.scheme = settings.scheme == .dark ? .light : .dark
            }) {
              TVListValue(settings.scheme == .dark ? settings.t("Dark", "Dunkel") : settings.t("Light", "Hell"), chevron: false)
            }
            TVListItem(settings.t("Server accent", "Server-Akzent"), icon: .paintbrush, action: {
              let all = GalleryAccent.allCases
              settings.accent = all[(all.firstIndex(of: settings.accent)! + 1) % all.count]
            }) {
              TVListValue(settings.accent.name, chevron: false)
            }
            TVListItem(settings.t("German", "Deutsch"), icon: .compass, action: { settings.german.toggle() }) {
              TVListSwitch(settings.german)
            }
          }
          .frame(width: 720)
          .focusSection()
          VStack(alignment: .leading, spacing: TVListItems.gap) {
            TVListHeading(settings.t("Pages", "Seiten"))
            ForEach(TVRoute.allCases) { route in
              TVListItem(route.title(de), subtitle: route.subtitle(de), icon: route.icon, quiet: true) { open(route) } trailing: {
                LucideIcon(.chevronRight, size: 40, scales: false).opacity(0.6)
              }
            }
          }
          .focusSection()
        }
        .padding(.horizontal, TVOverscan.horizontal)
        .padding(.vertical, TVOverscan.vertical)
      }
      .scrollClipDisabled()
      .ignoresSafeArea()
    }
  }

  /// A TV gallery page: its title, then its demos, scrolling.
  struct TVGalleryPage<Content: View>: View {
    let title: String
    @ViewBuilder let content: () -> Content

    init(_ title: String, @ViewBuilder content: @escaping () -> Content) {
      self.title = title
      self.content = content
    }

    var body: some View {
      ScrollView {
        VStack(alignment: .leading, spacing: 72) {
          Text(title).textStyle(.headline)
          content()
        }
        .padding(.horizontal, TVOverscan.horizontal)
        .padding(.vertical, TVOverscan.vertical)
        .frame(maxWidth: .infinity, alignment: .leading)
      }
      .scrollClipDisabled()
      .ignoresSafeArea()
    }
  }

  /// One component's demo: its name, a note, and the component.
  struct TVDemo<Content: View>: View {
    let title: String
    let note: String?
    @ViewBuilder let content: () -> Content
    @Environment(\.palette) private var palette

    init(_ title: String, note: String? = nil, @ViewBuilder content: @escaping () -> Content) {
      self.title = title
      self.note = note
      self.content = content
    }

    var body: some View {
      VStack(alignment: .leading, spacing: 28) {
        VStack(alignment: .leading, spacing: 4) {
          Text(title).textStyle(.title)
          if let note { Text(note).textStyle(.caption).foregroundStyle(palette.mutedForeground).frame(maxWidth: 1400, alignment: .leading) }
        }
        content()
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .focusSection()
    }
  }

  /// A caption under a demo's piece, like the state it's pinned in.
  struct TVCaption: View {
    let text: String
    @Environment(\.palette) private var palette

    init(_ text: String) { self.text = text }

    var body: some View {
      Text(text).textStyle(.caption).foregroundStyle(palette.mutedForeground)
    }
  }

  /// A piece shown as it rests, and pinned focused and pressed beside it,
  /// so a screenshot shows every state at once. The first takes real focus.
  struct TVStates<Content: View>: View {
    var spacing: CGFloat = 48
    @ViewBuilder let content: () -> Content
    @Environment(TVGallerySettings.self) private var settings

    var body: some View {
      HStack(alignment: .top, spacing: spacing) {
        state(settings.t("Rest", "Ruhe"), .none)
        state(settings.t("Focused", "Fokussiert"), .focused)
        state(settings.t("Pressed", "Gedrückt"), .pressed)
        VStack(alignment: .leading, spacing: 16) {
          content().disabled(true)
          TVCaption(settings.t("Disabled", "Deaktiviert"))
        }
      }
    }

    private func state(_ name: String, _ forced: ForcedInteraction) -> some View {
      VStack(alignment: .leading, spacing: 16) {
        content().environment(\.forcedInteraction, forced)
        TVCaption(name)
      }
    }
  }
#endif
