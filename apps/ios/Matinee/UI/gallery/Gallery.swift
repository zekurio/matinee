#if DEBUG
  import MatineeCore
  import MatineeKit
  import MatineeKitGallery
  import Nuke
  import SwiftUI

  /// The app's shared components (components/ and the bars), on the kit, in
  /// debug builds with `-gallery YES`; the kit's own controls are in its
  /// gallery, a page here. Launch arguments pick what shows, so screenshots
  /// can be scripted:
  ///
  ///     -gallery YES               the gallery instead of the app
  ///     -gallery.page cards        cards, states, bars, sheets, kit
  ///     -theme.mode dark           system, light, dark (ThemeStore's own key)
  ///     -gallery.accent rose       matinee, rose, emerald, amber: a server accent
  ///     -gallery.scroll 2          scrolled down that many screens, for the rest of a long page
  ///     -gallery.open actions      a sheet open at launch: actions, watched, filters
  ///     -gallery.server URL -gallery.token TOKEN   the dev server's library
  ///
  /// `just gallery` passes the dev server's.
  enum GalleryPage: String, CaseIterable, Identifiable {
    case cards, states, bars, sheets, kit
    var id: Self { self }

    var name: String {
      switch self {
      case .cards: "Cards"
      case .states: "States"
      case .bars: "Bars"
      case .sheets: "Sheets"
      case .kit: "Kit"
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
      GalleryPage(rawValue: UserDefaults.standard.string(forKey: "gallery.page") ?? "") ?? .cards
    @State private var accent =
      GalleryAccent(rawValue: UserDefaults.standard.string(forKey: "gallery.accent") ?? "") ?? .matinee
    /// One for the run, made before the first image asks: a new one would start them all again.
    @State private var pipeline = ImagePipeline.matinee(
      server: UserDefaults.standard.string(forKey: "gallery.server").flatMap(URL.init(string:)),
      headers: GalleryServer.imageHeaders)
    @State private var position = ScrollPosition(edge: .top)
    @State private var choosing = false
    @Environment(\.windowSize) private var window

    var body: some View {
      NavigationStack {
        Group {
          if page == .kit {
            KitGallery()
          } else {
            ScrollView {
              VStack(alignment: .leading, spacing: Space.s7) {
                switch page {
                case .cards: CardsPage(server: server)
                case .states: StatesPage()
                case .bars: BarsPage()
                case .sheets: SheetsPage()
                case .kit: EmptyView()
                }
              }
              .padding(.bottom, Space.s12)
            }
            .scrollPosition($position)
          }
        }
        .safeAreaInset(edge: .top, spacing: 0) { pagePicker }
        .topBar(page.name, leading: .none) { themeMenu }
        .navigationDestination(for: String.self) { name in GalleryTitlePage(name: name) }
      }
      .modifier(ActionsHost())
      .environment(\.api, server.api)
      .environment(\.imagePipeline, pipeline)
      .onAppear { theme.setAccents(accent.accents) }
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
        HStack(spacing: Space.s2) {
          ForEach(GalleryPage.allCases) { item in
            Chip(item.name, selected: item == page) { page = item }
          }
        }
      }
      .contentMargins(.horizontal, Space.gutter, for: .scrollContent)
      .scrollIndicators(.hidden)
      .padding(.bottom, Space.s2)
    }

    private var themeMenu: some View {
      RoundIconButton(.palette, label: Str.settingsPageAppearance, look: .ghost, size: 48, iconSize: 22) {
        choosing = true
      }
      .dropdownMenu(isPresented: $choosing, align: .trailing) {
        MenuLabel(Str.webAppearanceColorScheme)
        MenuItem(Str.webAppearanceColorSchemeSystem, selected: theme.mode == .system) { theme.setMode(.system) }
        MenuItem(Str.webAppearanceColorSchemeLight, selected: theme.mode == .light) { theme.setMode(.light) }
        MenuItem(Str.webAppearanceColorSchemeDark, selected: theme.mode == .dark) { theme.setMode(.dark) }
        MenuSeparator()
        MenuLabel("Accent")
        ForEach(GalleryAccent.allCases) { option in
          MenuItem(option.rawValue.capitalized, selected: option == accent) { accent = option }
        }
      }
    }
  }

  /// A page pushed from the gallery, to see the floating bar over art, the
  /// status bar's shade, and the back swipe.
  struct GalleryTitlePage: View {
    let name: String
    @Environment(\.palette) private var palette

    var body: some View {
      ScrollView {
        VStack(alignment: .leading, spacing: Space.s4) {
          Picture(Sample.still)
            .aspectRatio(16 / 10, contentMode: .fit)
            .background(Tone(name))
          Text(name).textStyle(.px26, weight: .bold, tracking: .tight).padding(.horizontal, Space.gutter)
          Text(String(repeating: "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ", count: 30))
            .textStyle(.sm).foregroundStyle(palette.mutedForeground).padding(.horizontal, Space.gutter)
        }
      }
      .ignoresSafeArea(edges: .top)
      .statusBarScrim()
      .overlay(alignment: .top) { ItemTopBar(parent: Sample.show.name) {} }
      .hidesSystemNavigationBar()
    }
  }

  /// A heading for a block of the gallery.
  struct GalleryHeading: View {
    let text: String
    @Environment(\.palette) private var palette

    init(_ text: String) { self.text = text }

    var body: some View {
      Text(text.uppercased())
        .textStyle(.px11, weight: .medium)
        .foregroundStyle(palette.foregroundFaint)
        .padding(.horizontal, Space.gutter)
    }
  }
#endif
