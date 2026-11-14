#if DEBUG
  import MatineeCore
  import Nuke
  import SwiftUI

  /// The pages of the gallery, in debug builds with `-gallery YES`: every
  /// component, on the theme, in both appearances. Launch arguments pick
  /// what shows, so screenshots can be scripted:
  ///
  ///     -gallery YES               the gallery instead of the app
  ///     -gallery.page cards        colors, icons, controls, cards, rows, states
  ///     -theme.mode dark           system, light, dark (ThemeStore's own key)
  ///     -gallery.accent rose       matinee, rose, emerald, amber: a server accent
  ///     -gallery.scroll 2          scrolled down that many screens, for the rest of a long page
  ///     -gallery.server URL -gallery.token TOKEN   the dev server's library
  enum GalleryPage: String, CaseIterable, Identifiable {
    case colors, icons, controls, cards, rows, states
    var id: Self { self }

    var name: String {
      switch self {
      case .colors: "Colors & type"
      case .icons: "Icons"
      case .controls: "Controls"
      case .cards: "Cards"
      case .rows: "Rows"
      case .states: "States"
      }
    }
  }

  /// Server accents to try the theme with, as an admin would set them.
  enum GalleryAccent: String, CaseIterable, Identifiable {
    case matinee, rose, emerald, amber
    var id: Self { self }

    var accents: ThemeAccents {
      switch self {
      case .matinee: ThemeAccents(light: nil, dark: nil)
      case .rose: ThemeAccents(light: "#e64980", dark: "#f27a8f")
      case .emerald: ThemeAccents(light: "#0ca678", dark: "#38d9a9")
      case .amber: ThemeAccents(light: "#f59f00", dark: "#ffc56b")
      }
    }
  }

  struct GalleryRoot: View {
    @Environment(ThemeStore.self) private var theme
    @State private var server = GalleryServer()
    @State private var page =
      GalleryPage(rawValue: UserDefaults.standard.string(forKey: "gallery.page") ?? "") ?? .colors
    @State private var accent =
      GalleryAccent(rawValue: UserDefaults.standard.string(forKey: "gallery.accent") ?? "") ?? .matinee
    /// One for the run, made before the first image asks: a new one would start them all again.
    @State private var pipeline = ImagePipeline.matinee(
      server: UserDefaults.standard.string(forKey: "gallery.server").flatMap(URL.init(string:)),
      headers: GalleryServer.imageHeaders)
    @State private var position = ScrollPosition(edge: .top)
    @Environment(\.palette) private var palette
    @Environment(\.windowSize) private var window

    var body: some View {
      NavigationStack {
        ScrollView {
          VStack(alignment: .leading, spacing: 28) {
            pagePicker
            switch page {
            case .colors: ColorsPage()
            case .icons: IconsPage()
            case .controls: ControlsPage()
            case .cards: CardsPage(server: server)
            case .rows: RowsPage()
            case .states: StatesPage()
            }
          }
          .padding(.bottom, 48)
        }
        .scrollPosition($position)
        .scrollContentBackground(.hidden)
        .background(palette.background)
        .topBar(page.name) { themeMenu }
        .navigationDestination(for: String.self) { name in GalleryTitlePage(name: name) }
      }
      .environment(\.api, server.api)
      .environment(\.actionMenu, ActionMenu { AnyView(GalleryMenu(target: $0)) })
      .environment(\.imagePipeline, pipeline)
      .onAppear {
        theme.setAccents(accent.accents)
      }
      .task {
        let screens = UserDefaults.standard.integer(forKey: "gallery.scroll")
        guard screens > 0 else { return }
        // Once the page has laid out, a screen at a time less a little overlap.
        try? await Task.sleep(for: .milliseconds(600))
        position.scrollTo(y: CGFloat(screens) * (window.height - 200))
      }
      .onChange(of: accent) { theme.setAccents(accent.accents) }
    }

    private var pagePicker: some View {
      ScrollView(.horizontal) {
        HStack(spacing: 8) {
          ForEach(GalleryPage.allCases) { item in
            Chip(item.name, selected: item == page) { page = item }
          }
        }
      }
      .contentMargins(.horizontal, Gutter, for: .scrollContent)
      .scrollIndicators(.hidden)
    }

    private var themeMenu: some View {
      Menu {
        Picker(Str.webAppearanceColorScheme, selection: Binding(get: { theme.mode }, set: theme.setMode)) {
          Text(Str.webAppearanceColorSchemeSystem).tag(ThemeMode.system)
          Text(Str.webAppearanceColorSchemeLight).tag(ThemeMode.light)
          Text(Str.webAppearanceColorSchemeDark).tag(ThemeMode.dark)
        }
        Picker("Accent", selection: $accent) {
          ForEach(GalleryAccent.allCases) { Text($0.rawValue.capitalized).tag($0) }
        }
      } label: {
        Image(Lucide.palette)
      }
      .accessibilityLabel(Str.settingsPageAppearance)
    }
  }

  /// A page pushed from the gallery, to see the floating bar over art, the
  /// status bar's scrim, and the back swipe.
  struct GalleryTitlePage: View {
    let name: String
    @Environment(\.palette) private var palette

    var body: some View {
      ScrollView {
        VStack(alignment: .leading, spacing: 16) {
          Picture(Sample.still)
            .aspectRatio(16 / 10, contentMode: .fit)
            .background(Tone(name))
          Text(name).textStyle(.headlineMedium).padding(.horizontal, Gutter)
          Text(String(repeating: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ", count: 30))
            .textStyle(.bodyMedium).foregroundStyle(palette.muted).padding(.horizontal, Gutter)
        }
      }
      .ignoresSafeArea(edges: .top)
      .statusBarScrim()
      .itemTopBar(parent: Sample.show.name) {}
    }
  }

  /// A stand-in for Actions.kt's menus, to show the long press works.
  struct GalleryMenu: View {
    let target: ActionTarget

    var body: some View {
      Button {} label: { Label { Text(Str.titlePlay) } icon: { Image(Lucide.playOutline) } }
      Button {} label: { Label { Text(Str.mediaMarkWatched) } icon: { Image(Lucide.check) } }
      Button {} label: { Label { Text(Str.mediaAddFavorite) } icon: { Image(Lucide.heart) } }
      Divider()
      Button(role: .destructive) {} label: {
        Label { Text(Str.downloadsRemove) } icon: { Image(Lucide.trash) }
      }
    }
  }

  /// A heading for a block of the gallery.
  struct GalleryHeading: View {
    let text: String
    @Environment(\.palette) private var palette

    init(_ text: String) { self.text = text }

    var body: some View {
      Text(text.uppercased())
        .textStyle(.labelSmall)
        .foregroundStyle(palette.faint)
        .padding(.horizontal, Gutter)
    }
  }
#endif
