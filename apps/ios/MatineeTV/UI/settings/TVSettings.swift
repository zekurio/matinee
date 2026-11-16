import MatineeCore
import MatineeKit
import SwiftUI

/*
 * TvSettings.kt: Settings on a TV, as Google TV's and Android TV's own:
 * the categories on the left and the focused one's rows on the right.
 * Focusing a category shows its rows; Right or Select goes into them,
 * landing on the first; Menu comes back out to the category, then leaves
 * for Home. A choice opens the side panel at the right edge, a switch
 * flips in place, and a value that steps, as the subtitles' size, steps
 * with Left and Right in its row. The rows are in TVSettingsRows.swift,
 * TVSettingsAccount.swift, and TVAbout.swift.
 *
 * What a TV leaves out of the phone's Settings, by `ClientCapabilities`
 * and by what a remote is for: offline mode, downloads, the admin pages,
 * signing in another device by camera, the profile's picture and name
 * (no camera roll, no keyboard worth typing a name on), passkeys and the
 * linked sign-in account (a browser's), picture in picture, the player's
 * touch gestures and buttons, and sharing a report or a log (no share
 * sheet, no clipboard). Each is still on the web and the iPhone.
 */

/// Settings' categories on a TV, by the key a route opens them with:
/// the phone's page keys where they mean the same, so `settings/account`
/// opens the places the account is signed in, as Android TV's does.
enum TVSettingsCategory: String, CaseIterable, Identifiable {
  case playback, subtitles, languages, appearance
  case devices = "account"
  case account = "server"
  case about

  var id: String { rawValue }

  /// By the key in `TVRoute.settingsPage`; Playback for anything else.
  static func of(_ key: String?) -> Self { key.flatMap(Self.init(rawValue:)) ?? .playback }

  var icon: Lucide {
    switch self {
    case .playback: .tvPlay
    case .subtitles: .captions
    case .languages: .audioLines
    case .appearance: .palette
    case .devices: .monitor
    case .account: .userRound
    case .about: .info
    }
  }

  var title: String {
    switch self {
    case .playback: Str.settingsPagePlayback
    case .subtitles: Str.settingsSubtitlesTitle
    case .languages: Str.playbackLanguagesTitle
    case .appearance: Str.settingsPageAppearance
    case .devices: Str.tvSettingsDevices
    case .account: Str.tvSettingsAccount
    case .about: Str.aboutTitle
    }
  }
}

/// The focus key of the row each category's rows start on.
let FIRST_ROW = "first"

/// The categories' column, and the room between it and the rows.
private let CATEGORY_WIDTH: CGFloat = 560
private let COLUMN_GAP: CGFloat = 96
/// Where rows start under the top, clear of the clock.
private let ROWS_TOP: CGFloat = TVOverscan.vertical + 120
/// How far above the rows' top a row scrolling away fades out.
private let ROWS_FADE: CGFloat = 20

struct TVSettingsScreen: View {
  /// One of Settings' categories, by its key, or nil for Settings itself, which opens on Playback.
  var page: String? = nil
  @State private var selected: TVSettingsCategory
  /// Focus came to the rows from the categories, so it starts on the first row.
  @State private var fromCategories = false
  /// A row Left steps, and when it did: the focus engine moves on with the same press, and
  /// focus comes straight back.
  @State private var held: (row: String, at: Date)?
  @FocusState private var category: TVSettingsCategory?
  @FocusState private var row: String?
  @Environment(\.palette) private var palette

  init(page: String? = nil) {
    self.page = page
    _selected = State(initialValue: TVSettingsCategory.of(page))
  }

  var body: some View {
    HStack(alignment: .top, spacing: COLUMN_GAP) {
      VStack(alignment: .leading, spacing: 0) {
        Text(Str.shellSettings).textStyle(.headline).lineLimit(1)
          .padding(.leading, TVListItems.inset)
          .padding(.bottom, TVSpace.s7)
          .accessibilityAddTraits(.isHeader)
        VStack(spacing: TVListItems.gap) {
          ForEach(TVSettingsCategory.allCases) { entry in
            TVListItem(entry.title, icon: entry.icon, quiet: true, selected: entry == selected) {
              selected = entry
              // Into its rows, once they're there.
              DispatchQueue.main.async { row = FIRST_ROW }
            }
            .focused($category, equals: entry)
          }
        }
        .focusSection()
      }
      .frame(width: CATEGORY_WIDTH, alignment: .leading)
      .padding(.top, TVOverscan.vertical + 8)
      ScrollView(.vertical) {
        // A category's rows start afresh, at the top.
        SettingsRows(category: selected, focus: $row, focused: row) { held = ($0, .now) }
          .id(selected)
          .padding(.top, 4)
          .padding(.bottom, TVOverscan.vertical + 48)
      }
      .scrollIndicators(.hidden)
      // Unclipped, so a focused row grows past the edges, but rows that scroll up fade out
      // just above the top rather than run under the title and the clock.
      .scrollClipDisabled()
      .mask {
        VStack(spacing: 0) {
          LinearGradient(colors: [.clear, .black], startPoint: .top, endPoint: .bottom)
            .frame(height: ROWS_FADE)
          Rectangle()
        }
        .padding(.top, -ROWS_FADE)
        .padding(.horizontal, -TVSpace.s7)
        .padding(.bottom, -TVOverscan.vertical)
      }
      .focusSection()
      .padding(.top, ROWS_TOP)
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }
    .padding(.leading, TVPage.start - TVListItems.inset)
    .padding(.trailing, TVPage.end)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .background(palette.background)
    .ignoresSafeArea()
    .onChange(of: category) { _, now in
      guard let now else { return }
      if let held, Date.now.timeIntervalSince(held.at) < 0.5 {
        self.held = nil
        row = held.row
        return
      }
      selected = now
      fromCategories = true
    }
    .onChange(of: row) { old, now in
      guard old == nil, now != nil else { return }
      // Right from a category lands on the row beside it; start on the first, as Android TV does.
      // Focus coming back from a panel or the drawer stays where it was.
      if fromCategories, now != FIRST_ROW { row = FIRST_ROW }
      fromCategories = false
    }
    // In the rows, Menu goes back to the category; there, it leaves for Home.
    .onTVBack(isActive: row != nil) { category = selected }
    // The category it opened on, and the category that's open when the drawer hands focus back.
    .tvPageFocus($category, on: selected)
  }
}

/// The rows of `category`, each focusable one bound to `focus` by its key,
/// the first by `FIRST_ROW`.
private struct SettingsRows: View {
  let category: TVSettingsCategory
  let focus: FocusState<String?>.Binding
  /// The row focus is on now, read where the focus state lives, so a row that hears the arrows knows.
  let focused: String?
  let hold: (String) -> Void

  var body: some View {
    switch category {
    case .playback: PlaybackRows(focus: focus)
    case .subtitles: SubtitleRows(focus: focus, focused: focused, hold: hold)
    case .languages: LanguageRows(focus: focus)
    case .appearance: AppearanceRows(focus: focus)
    case .devices: DeviceRows(focus: focus)
    case .account: AccountRows(focus: focus)
    case .about: AboutRows(focus: focus)
    }
  }
}

// MARK: Rows

/// A choice among `options`, its value at the row's end, picked in the
/// side panel; `subtitle` goes under the title and into the panel.
struct SettingsChoice<Value: Hashable>: View {
  let title: String
  var subtitle: String?
  let options: [TVOption<Value>]
  let current: Value
  let onPick: (Value) -> Void
  @State private var open = false

  init(
    _ title: String, subtitle: String? = nil, options: [TVOption<Value>], current: Value,
    onPick: @escaping (Value) -> Void
  ) {
    self.title = title
    self.subtitle = subtitle
    self.options = options
    self.current = current
    self.onPick = onPick
  }

  var body: some View {
    TVListItem(title, subtitle: subtitle, quiet: true, action: { open = true }) {
      TVListValue(optionLabel(options, current))
    }
    .tvOptionsPanel(
      isPresented: $open, title: title, description: subtitle,
      selection: Binding(get: { current }, set: { if $0 != current { onPick($0) } }), options: options)
  }
}

/// On or off, flipped in place by Select.
struct SettingsSwitch: View {
  let title: String
  var subtitle: String?
  let isOn: Bool
  let onChange: (Bool) -> Void

  init(_ title: String, subtitle: String? = nil, isOn: Bool, onChange: @escaping (Bool) -> Void) {
    self.title = title
    self.subtitle = subtitle
    self.isOn = isOn
    self.onChange = onChange
  }

  var body: some View {
    TVListItem(title, subtitle: subtitle, quiet: true, action: { onChange(!isOn) }) {
      TVListSwitch(isOn)
    }
    .accessibilityAddTraits(isOn ? .isSelected : [])
  }
}

/// A fact with nothing to do, as the app's version: focusable, so the
/// list scrolls past it, its value at the end without a chevron.
struct SettingsFact: View {
  let title: String
  var subtitle: String?
  var icon: Lucide?
  let value: String?

  init(_ title: String, subtitle: String? = nil, icon: Lucide? = nil, value: String? = nil) {
    self.title = title
    self.subtitle = subtitle
    self.icon = icon
    self.value = value
  }

  var body: some View {
    TVListItem(title, subtitle: subtitle, icon: icon, quiet: true, action: {}) {
      if let value { TVListValue(value, chevron: false) }
    }
  }
}

/// A note under a group of rows, such as what a setting is used for.
struct SettingsNote: View {
  let text: String
  @Environment(\.palette) private var palette

  init(_ text: String) { self.text = text }

  var body: some View {
    Text(text).textStyle(.caption).foregroundStyle(palette.mutedForeground)
      .fixedSize(horizontal: false, vertical: true)
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.horizontal, TVListItems.inset)
      .padding(.top, 4)
      .padding(.bottom, TVSpace.s1)
  }
}

/// A category's rows, a column with the list's gap, and a heading over
/// each group after the first.
struct SettingsColumn<Content: View>: View {
  @ViewBuilder let content: () -> Content

  var body: some View {
    VStack(alignment: .leading, spacing: TVListItems.gap) { content() }
      .frame(maxWidth: .infinity, alignment: .leading)
  }
}

/// Room above a heading that starts a new group of rows.
struct SettingsGap: View {
  var body: some View { Color.clear.frame(height: TVSpace.s5).accessibilityHidden(true) }
}
