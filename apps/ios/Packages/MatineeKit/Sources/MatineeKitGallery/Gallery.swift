@_spi(Gallery) import MatineeKit
import SwiftUI

/// What the gallery opens on, from launch arguments, for screenshots:
/// `-page buttons -scheme dark -accent ember -locale de -rtl YES -text xxxLarge -open menu`.
public struct GalleryLaunch: Sendable {
  public var page: String?
  public var scheme: ColorScheme?
  public var accent: String?
  public var locale: String?
  public var rtl = false
  public var text: String?
  public var open: String?
  public var scroll: String?

  public init() {}

  public static func fromArguments() -> GalleryLaunch {
    let defaults = UserDefaults.standard
    var launch = GalleryLaunch()
    launch.page = defaults.string(forKey: "page")
    launch.scheme = defaults.string(forKey: "scheme").flatMap { $0 == "light" ? .light : $0 == "dark" ? .dark : nil }
    launch.accent = defaults.string(forKey: "accent")
    launch.locale = defaults.string(forKey: "locale")
    launch.rtl = defaults.bool(forKey: "rtl")
    launch.text = defaults.string(forKey: "text")
    launch.open = defaults.string(forKey: "open")
    launch.scroll = defaults.string(forKey: "scroll")
    return launch
  }
}

/// The server accents the gallery tries Matinee's palettes with: Matinee's
/// own, and three an admin might pick, one of them a hard yellow that has
/// to darken to read on white.
enum GalleryAccent: String, CaseIterable, Identifiable {
  case matinee, ember, moss, sun

  var id: String { rawValue }

  var hex: String? {
    switch self {
    case .matinee: nil
    case .ember: "#f76707"
    case .moss: "#2f9e44"
    case .sun: "#fcc419"
    }
  }

  var name: String { rawValue.prefix(1).uppercased() + rawValue.dropFirst() }

  var theme: MatineeTheme { MatineeTheme(accentLight: hex, accentDark: hex) }
}

enum GalleryRoute: String, CaseIterable, Hashable, Identifiable {
  case foundations, palettes, buttons, inputs, chips, lists, overlays, feedback, navigation, calendar, icons

  var id: String { rawValue }

  var title: String {
    switch self {
    case .foundations: "Foundations"
    case .palettes: "Palettes"
    case .buttons: "Buttons"
    case .inputs: "Inputs"
    case .chips: "Chips, badges, avatars"
    case .lists: "Lists"
    case .overlays: "Menus, sheets, dialogs, toasts"
    case .feedback: "Loading and empty"
    case .navigation: "Bars"
    case .calendar: "Calendar"
    case .icons: "Icons"
    }
  }

  var subtitle: String {
    switch self {
    case .foundations: "Colors, type, radii, spacing, shadows"
    case .palettes: "Every palette, light and dark, side by side"
    case .buttons: "Every look, size, shape, and state"
    case .inputs: "Text field, select, switch, checkbox, sliders"
    case .chips: "Chips, choice and toggle chips, badges, avatars"
    case .lists: "Sections, rows, setting rows"
    case .overlays: "Dropdown menu, sheet, dialog, confirm, toast"
    case .feedback: "Spinner, progress, skeleton, empty state"
    case .navigation: "Top bar, bottom bar, nav bar, status bar frost"
    case .calendar: "Pick a day"
    case .icons: "Every lucide icon in the kit"
    }
  }

  var icon: Lucide {
    switch self {
    case .foundations: .palette
    case .palettes: .paintbrush
    case .buttons: .playOutline
    case .inputs: .listFilter
    case .chips: .listChecks
    case .lists: .list
    case .overlays: .galleryHorizontalEnd
    case .feedback: .loaderCircle
    case .navigation: .compass
    case .calendar: .calendar
    case .icons: .image
    }
  }
}

/// The settings the gallery is seen through, shared by every page.
@Observable
final class GallerySettings {
  var scheme: ColorScheme = .dark
  var accent = GalleryAccent.matinee
  var german = false
  var rtl = false
  var textSize = DynamicTypeSize.large
  var open: String?
  var scroll: String?

  init(_ launch: GalleryLaunch) {
    scheme = launch.scheme ?? .dark
    accent = launch.accent.flatMap(GalleryAccent.init(rawValue:)) ?? .matinee
    german = launch.locale == "de"
    rtl = launch.rtl
    textSize =
      switch launch.text {
      case "xSmall": .xSmall
      case "xLarge": .xLarge
      case "xxxLarge": .xxxLarge
      case "accessibility2": .accessibility2
      case "accessibility5": .accessibility5
      default: .large
      }
    open = launch.open
    scroll = launch.scroll
  }
}

/// The kit's gallery: every component in every state, in light and dark,
/// in each palette, in English and German, left to right and right to left.
public struct KitGallery: View {
  @State private var settings: GallerySettings
  @State private var path: [GalleryRoute]
  @State private var toasts = ToastState()

  public init(launch: GalleryLaunch = GalleryLaunch()) {
    _settings = State(initialValue: GallerySettings(launch))
    _path = State(initialValue: launch.page.flatMap(GalleryRoute.init(rawValue:)).map { [$0] } ?? [])
  }

  public var body: some View {
    NavigationStack(path: $path) {
      GalleryHome(settings: settings) { path.append($0) }
        .navigationDestination(for: GalleryRoute.self) { route in
          page(route)
        }
    }
    .toastHost(toasts)
    .environment(settings)
    .environment(toasts)
    .environment(\.locale, Locale(identifier: settings.german ? "de" : "en"))
    .environment(\.layoutDirection, settings.rtl ? .rightToLeft : .leftToRight)
    .dynamicTypeSize(settings.textSize)
    .matineeTheme(settings.accent.theme, mode: settings.scheme == .light ? .light : .dark)
  }

  @ViewBuilder private func page(_ route: GalleryRoute) -> some View {
    switch route {
    case .foundations: FoundationsPage()
    case .palettes: PalettesPage()
    case .buttons: ButtonsPage()
    case .inputs: InputsPage()
    case .chips: ChipsPage()
    case .lists: ListsPage()
    case .overlays: OverlaysPage()
    case .feedback: FeedbackPage()
    case .navigation: NavigationPage()
    case .calendar: CalendarPage()
    case .icons: IconsPage()
    }
  }
}

private struct GalleryHome: View {
  @Bindable var settings: GallerySettings
  let open: (GalleryRoute) -> Void
  @Environment(\.palette) private var palette

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 32) {
        VStack(alignment: .leading, spacing: 4) {
          Text("MatineeKit").textStyle(.xl3, weight: .bold, tracking: .tight)
          Text("The web's components, drawn in SwiftUI.").textStyle(.sm).foregroundStyle(palette.mutedForeground)
        }
        ListSection("Seen through") {
          SettingRowStack("Appearance") {
            SegmentedControl([(ColorScheme.light, "Light"), (.dark, "Dark")], selection: $settings.scheme)
          }
          SettingRowStack("Server accent") {
            SegmentedControl(GalleryAccent.allCases.map { ($0, $0.name) }, selection: $settings.accent)
          }
          SelectRow(
            "Text size", selection: $settings.textSize,
            options: [
              (.xSmall, "Extra small"), (.large, "Default"), (.xxxLarge, "Largest"),
              (.accessibility2, "Accessibility 2"), (.accessibility5, "Accessibility 5"),
            ], stacked: false)
          SwitchRow("German", isOn: $settings.german)
          SwitchRow("Right to left", isOn: $settings.rtl)
        }
        ListSection("Components", titleStyle: .label) {
          ForEach(GalleryRoute.allCases) { route in
            ListRow(route.title, subtitle: route.subtitle, icon: route.icon) { open(route) }
          }
        }
      }
      .padding(.horizontal, Space.gutter)
      .padding(.vertical, 16)
      .frame(maxWidth: 720, alignment: .leading)
      .frame(maxWidth: .infinity)
    }
    .hidesSystemNavigationBar()
  }
}

/// A row with its name over a control, as the web's settings stack them on a phone.
struct SettingRowStack<Control: View>: View {
  let title: String
  @ViewBuilder let control: () -> Control

  init(_ title: String, @ViewBuilder control: @escaping () -> Control) {
    self.title = title
    self.control = control
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text(title).textStyle(.sm, weight: .medium)
      control()
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 10)
    .frame(maxWidth: .infinity, alignment: .leading)
  }
}
