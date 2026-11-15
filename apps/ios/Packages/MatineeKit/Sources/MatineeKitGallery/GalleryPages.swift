@_spi(Gallery) import MatineeKit
import SwiftUI

// MARK: Foundations

struct FoundationsPage: View {
  @Environment(\.palette) private var palette

  var body: some View {
    GalleryPage("Foundations") {
      Demo("Colors", note: "Palette, by the web's names. `muted` is a surface; `mutedForeground` is text.") {
        let swatches: [(String, Color)] = [
          ("background", palette.background), ("card", palette.card), ("popover", palette.popover),
          ("secondary", palette.secondary), ("muted", palette.muted), ("field", palette.field),
          ("border", palette.border), ("input", palette.input), ("inputHover", palette.inputHover),
          ("foreground", palette.foreground), ("mutedForeground", palette.mutedForeground),
          ("foregroundFaint", palette.foregroundFaint), ("accent", palette.accent),
          ("accentForeground", palette.accentForeground), ("accentHover", palette.accentHover),
          ("accentSoft", palette.accentSoft), ("accentDim", palette.accentDim), ("destructive", palette.destructive),
          ("success", palette.success), ("warning", palette.warning), ("info", palette.info), ("live", palette.live),
        ]
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 104), spacing: 10)], spacing: 10) {
          ForEach(swatches.indices, id: \.self) { index in
            VStack(alignment: .leading, spacing: 6) {
              RoundedRectangle.kit(Radius.md).fill(swatches[index].1)
                .frame(height: 44)
                .overlay { RoundedRectangle.kit(Radius.md).strokeBorder(palette.hairline) }
              Text(swatches[index].0).textStyle(.xs).foregroundStyle(palette.mutedForeground).lineLimit(1)
                .minimumScaleFactor(0.8)
            }
          }
        }
      }
      Demo("Type", note: "Red Hat Text at the web's sizes and line heights, growing with Dynamic Type.") {
        VStack(alignment: .leading, spacing: 10) {
          ForEach(TextSize.allCases.reversed(), id: \.self) { size in
            HStack(alignment: .firstTextBaseline, spacing: 12) {
              Text(size.webName).textStyle(.xs).foregroundStyle(palette.mutedForeground).frame(width: 84, alignment: .leading)
              Text("Matinee \(Int(size.metrics.size))/\(Int(size.metrics.line))")
                .textStyle(size, weight: size.metrics.size >= 20 ? .semibold : .regular, tracking: size.metrics.size >= 20 ? .tight : .normal)
                .lineLimit(1)
                .minimumScaleFactor(0.5)
            }
          }
          HStack(spacing: 16) {
            Text("Regular").textStyle(.base)
            Text("Medium").textStyle(.base, weight: .medium)
            Text("Semibold").textStyle(.base, weight: .semibold)
            Text("Bold").textStyle(.base, weight: .bold)
          }
          HStack(spacing: 8) {
            LucideIcon(.film, size: 16)
            Text("Text centers on the icon beside it").textStyle(.sm)
          }
        }
      }
      Demo("Radii", note: "`rounded-sm` to `rounded-2xl`, from the web's 0.625rem.") {
        HStack(spacing: 12) {
          ForEach([("sm", Radius.sm), ("md", Radius.md), ("lg", Radius.lg), ("xl", Radius.xl), ("2xl", Radius.xl2)], id: \.0) {
            name, radius in
            VStack(spacing: 6) {
              RoundedRectangle.kit(radius).fill(palette.secondary).frame(width: 56, height: 56)
                .overlay { RoundedRectangle.kit(radius).strokeBorder(palette.border) }
              Caption("\(name) \(Int(radius))")
            }
          }
        }
      }
      Demo("Spacing", note: "Tailwind's 4-point steps. The gutter is 16.") {
        VStack(alignment: .leading, spacing: 6) {
          ForEach([("1", Space.s1), ("2", Space.s2), ("3", Space.s3), ("4", Space.s4), ("6", Space.s6), ("8", Space.s8), ("12", Space.s12)], id: \.0) {
            name, space in
            HStack(spacing: 10) {
              Caption(name).frame(width: 24, alignment: .leading)
              Rectangle().fill(palette.accent).frame(width: space * 3, height: 8)
              Caption("\(Int(space))")
            }
          }
        }
      }
      Demo("Shadows", note: "What floats: menus, dialogs, toasts, the tab bar.") {
        HStack(spacing: 18) {
          ForEach([("menu", KitShadow.menu), ("dialog", .dialog), ("toast", .toast), ("small", .small)], id: \.0) { name, shadow in
            VStack(spacing: 8) {
              RoundedRectangle.kit(Radius.xl).fill(palette.popover).frame(width: 64, height: 56).kitShadow(shadow)
              Caption(name)
            }
          }
        }
        .padding(.vertical, 12)
      }
      Demo("Motion", note: "280 ms to move, 200 in, 150 out, 120 for color. Reduce Motion fades instead.") {
        MotionDemo()
      }
    }
  }
}

private struct MotionDemo: View {
  @State private var on = false
  @Environment(\.palette) private var palette

  var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      GeometryReader { proxy in
        Circle().fill(palette.accent).frame(width: 28, height: 28)
          .offset(x: on ? proxy.size.width - 28 : 0)
      }
      .frame(height: 28)
      MatineeButton(on ? "Back" : "Move", look: .secondary, size: .md) { withMotion(Motion.move) { on.toggle() } }
      Reveal(on) {
        Text("Rows that show only sometimes open and close.").textStyle(.sm).foregroundStyle(palette.mutedForeground)
          .padding(.vertical, 6)
      }
    }
  }
}

// MARK: Palettes

struct PalettesPage: View {
  var body: some View {
    GalleryPage("Palettes") {
      Text("Matinee's light and dark palettes, with an accent a server might set on each.")
        .textStyle(.sm)
      ForEach(GalleryAccent.allCases) { accent in
        Demo(accent.name, note: accent.hex.map { "Server accent \($0), fitted for contrast" } ?? "Matinee's own accent") {
          HStack(spacing: 10) {
            PaletteSample(colors: accent.theme.light, scheme: .light)
            PaletteSample(colors: accent.theme.dark, scheme: .dark)
          }
        }
      }
    }
  }
}

private struct PaletteSample: View {
  let colors: ThemeColors
  let scheme: ColorScheme
  @State private var on = true
  @State private var chip = 0

  var body: some View {
    let palette = Palette(colors)
    VStack(alignment: .leading, spacing: 10) {
      HStack(spacing: 6) {
        MatineeButton("Play", icon: .play, size: .sm) {}
        RoundIconButton(.heart, label: "Favorite", size: 32) {}
        Spacer(minLength: 0)
        Switch(isOn: $on, label: "On")
      }
      HStack(spacing: 6) {
        Badge("4K", look: .meta)
        Badge("New", look: .primary)
        Badge("Failed", look: .destructive)
      }
      ProgressBar(0.62)
      Text("Muted text on the page").textStyle(.xs).foregroundStyle(palette.mutedForeground)
      HStack(spacing: 6) {
        ChoiceChip("All", selected: chip == 0) { chip = 0 }
        ChoiceChip("Films", selected: chip == 1) { chip = 1 }
      }
    }
    .padding(10)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(palette.background, in: RoundedRectangle.kit(Radius.xl))
    .overlay { RoundedRectangle.kit(Radius.xl).strokeBorder(palette.border) }
    .environment(\.palette, palette)
    .environment(\.colorScheme, scheme)
    .foregroundStyle(palette.foreground)
  }
}

// MARK: Buttons

struct ButtonsPage: View {
  @State private var pending = false
  @Environment(\.palette) private var palette

  var body: some View {
    GalleryPage("Buttons") {
      ForEach(ButtonLook.allCases.filter { $0 != .frosted && $0 != .glass }, id: \.self) { look in
        Demo(".\(look.rawValue)") {
          StateStrip {
            MatineeButton(look.rawValue.capitalized, icon: look == .primary ? .play : nil, look: look) {}
          }
        }
      }
      Demo(".frosted and .glass", note: "For buttons over a picture; glass is white whatever the theme.") {
        ForEach([ButtonLook.frosted, .glass], id: \.self) { look in
          StateStrip(states: [.normal, .pressed, .disabled]) {
            MatineeButton(look == .frosted ? "Trailer" : "Resume", icon: look == .frosted ? .clapperboard : .play, look: look) {}
              .padding(12)
              .background { FakeArt(seed: look == .frosted ? 0 : 1).clipShape(RoundedRectangle.kit(Radius.xl)) }
          }
        }
      }
      Demo("Sizes", note: "`.sm` 32 and `.md` 36 are the web's; `.touch` 44, the default, is a finger's.") {
        HStack(spacing: 10) {
          MatineeButton("Small", size: .sm) {}
          MatineeButton("Medium", size: .md) {}
          MatineeButton("Touch", size: .touch) {}
        }
      }
      Demo("Dimmed and pending", note: "Dimmed still takes a tap, to say why it can't; pending shows a spinner.") {
        HStack(spacing: 10) {
          MatineeButton("Download", icon: .download, look: .secondary, dimmed: true) {}
          MatineeButton(pending ? "Saving" : "Save", pending: pending) {
            pending = true
            Task {
              try? await Task.sleep(for: .seconds(2))
              pending = false
            }
          }
        }
      }
      Demo("Shapes", note: "A split button is two halves; a capsule for pills.") {
        HStack(spacing: 10) {
          HStack(spacing: 1) {
            MatineeButton("Play", icon: .play, shape: .leadingHalf) {}
            MatineeButton(look: .primary, shape: .trailingHalf) {} label: {
              LucideIcon(.chevronDown, size: 16)
            }
          }
          MatineeButton("Capsule", look: .secondary, shape: .capsule) {}
        }
      }
      Demo("Full width", note: "As a dialog's and a form's buttons.") {
        MatineeButton("Sign in", icon: .logIn, fullWidth: true) {}
      }
      Demo("Round icon buttons", note: "36 unless sized; every one takes 44 to hit.") {
        VStack(alignment: .leading, spacing: 16) {
          ForEach([IconButtonLook.secondary, .ghost, .primary, .outline], id: \.self) { look in
            HStack(spacing: 0) {
              Caption(".\(look.rawValue)").frame(width: 84, alignment: .leading)
              StateStrip(spacing: 18) {
                RoundIconButton(look == .primary ? .play : .heart, label: "Favorite", look: look) {}
              }
            }
          }
          ZStack {
            FakeArt(seed: 1)
            HStack(spacing: 14) {
              RoundIconButton(.arrowLeft, label: "Back", look: .floating, size: 44) {}
              RoundIconButton(.house, label: "Home", look: .floating, size: 44, iconSize: 20) {}
              RoundIconButton(.heartFilled, label: "Favorite", look: .frosted, size: 44) {}
              RoundIconButton(.ellipsis, label: "More", look: .glass, size: 44) {}
            }
            .padding(14)
          }
          .clipShape(RoundedRectangle.kit(Radius.xl))
          Caption("Over art: .floating, .floating, .frosted, .glass")
        }
      }
      Demo("Pressable", note: "Anything else that's pressed, like a card: the same wash and ring.") {
        StateStrip(states: [.normal, .pressed, .focused]) {
          Pressable(shape: RoundedRectangle.kit(Radius.sm), action: {}) {
            FakeArt(seed: 2).frame(width: 96, height: 144).clipShape(RoundedRectangle.kit(Radius.sm))
          }
        }
      }
    }
  }
}

// MARK: Inputs

struct InputsPage: View {
  @State private var name = ""
  @State private var filled = "The Matrix"
  @State private var password = "hunter22"
  @State private var search = "dune"
  @State private var note = "A note that runs on to a second line, as a request's reason might."
  @State private var quality = "original"
  @State private var scheme = "system"
  @State private var on = true
  @State private var off = false
  @State private var checked = true
  @State private var unchecked = false
  @State private var size = 1.0
  @State private var years = 1990.0...2010.0
  @Environment(\.palette) private var palette

  private let qualities = [("original", "Original"), ("1080", "1080p"), ("720", "720p"), ("480", "480p")]

  var body: some View {
    GalleryPage("Inputs") {
      Demo("Text field", note: "The sunken field, the accent and a halo when focused, the danger color for an error.") {
        StateColumn(states: [.normal, .focused, .disabled]) { state in
          MatineeTextField("Server address", text: state == .normal ? $name : $filled, icon: state == .disabled ? .server : nil)
        }
        Caption("Error")
        MatineeTextField("Username", text: $name, isError: true)
        Caption("Search, with a clear button")
        MatineeTextField("Search", text: $search, kind: .search)
        Caption("The search page's pill")
        MatineeTextField("Search titles, people, and genres", text: $search, kind: .search, look: .pill)
        Caption("Password, with show and hide")
        MatineeTextField("Password", text: $password, kind: .secure)
        Caption("Several lines")
        MatineeTextField("Note", text: $note, lines: 2...4)
      }
      Demo("Form field", note: "A label over the control, and help or the error under it.") {
        FormField("Display name", help: "Shown to others in a watch party.") {
          MatineeTextField("Your name", text: $filled)
        }
        FormField("Username", error: "That name is taken.") {
          MatineeTextField("Username", text: $name, isError: true)
        }
      }
      Demo("Select", note: "A field-styled trigger; its list opens below it, as wide as it.") {
        StateColumn(states: [.normal, .pressed, .focused, .disabled]) { _ in
          Select("Quality", selection: $quality, options: qualities)
        }
      }
      Demo("Segmented control", note: "A few short choices side by side.") {
        StateColumn(states: [.normal, .disabled]) { _ in
          SegmentedControl([("system", "System"), ("light", "Light"), ("dark", "Dark")], selection: $scheme)
        }
      }
      Demo("Switch", note: "44 by 24, Android's size for a finger.") {
        StateStrip { Switch(isOn: $on, label: "On") }
        StateStrip { Switch(isOn: $off, label: "Off") }
      }
      Demo("Checkbox") {
        StateStrip { Checkbox(isOn: $checked, label: "Checked") }
        StateStrip { Checkbox(isOn: $unchecked, label: "Unchecked") }
        StateStrip(states: [.normal, .disabled]) { Checkbox(isOn: $unchecked, label: "Some", indeterminate: true) }
      }
      Demo("Slider", note: "A thin track, the accent along it, a white thumb ringed in the accent.") {
        StateColumn { _ in
          MatineeSlider(value: $size, in: 0.5...2, step: 0.1, label: "Subtitle size") {
            "\(Int(($0 * 100).rounded())) percent"
          }
        }
      }
      Demo("Range slider", note: "Two thumbs that can meet but not cross.") {
        RangeSlider(value: $years, in: 1950...2025, step: 1)
        Caption("\(Int(years.lowerBound)) to \(Int(years.upperBound))")
      }
    }
  }
}

// MARK: Chips, badges, avatars

struct ChipsPage: View {
  @State private var library = 0
  @State private var sort = 0
  @State private var genres: Set<String> = ["Drama"]
  @Environment(\.palette) private var palette

  var body: some View {
    GalleryPage("Chips, badges, avatars") {
      Demo("Chip", note: "A page's chips: filled when current, outlined otherwise.") {
        ScrollView(.horizontal, showsIndicators: false) {
          HStack(spacing: 6) {
            ForEach(["Movies", "Restricted movies", "Shows"].indices, id: \.self) { index in
              Chip(["Movies", "Restricted movies", "Shows"][index], selected: library == index) { library = index }
            }
          }
        }
        StateStrip {
          Chip("Unwatched", trailingIcon: .x) {}
        }
        ZStack {
          FakeArt(seed: 0)
          HStack(spacing: 6) {
            Chip("Frosted", frosted: true) {}
            Chip("On art", selected: true) {}
          }
          .padding(14)
        }
        .clipShape(RoundedRectangle.kit(Radius.xl))
      }
      Demo("Choice chip", note: "One of a group, with a count.") {
        Flow(spacing: 6) {
          ForEach(["Newest", "Oldest", "Title", "Rating"].indices, id: \.self) { index in
            ChoiceChip(["Newest", "Oldest", "Title", "Rating"][index], selected: sort == index) { sort = index }
          }
        }
        StateStrip { ChoiceChip("Films", selected: false, count: "128") {} }
      }
      Demo("Toggle chip", note: "Each on and off by itself.") {
        Flow(spacing: 6) {
          ForEach(["Action", "Comedy", "Drama", "Horror", "Science fiction"], id: \.self) { genre in
            ToggleChip(
              genre,
              isOn: Binding(
                get: { genres.contains(genre) },
                set: { if $0 { genres.insert(genre) } else { genres.remove(genre) } }), count: "\(genre.count * 3)")
          }
        }
      }
      Demo("Badge") {
        Flow(spacing: 8) {
          ForEach(BadgeLook.allCases, id: \.self) { look in
            Badge(look == .meta || look == .metaOutline ? "PG-13" : look.rawValue.capitalized, look: look)
          }
          Badge("Live", look: .destructive, icon: .tv)
        }
      }
      Demo("Avatar", note: "A picture, or initials on the muted surface; the dot while something waits.") {
        HStack(spacing: 14) {
          Avatar("iOS Admin", size: 24)
          Avatar("Ada Lovelace")
          Avatar("Grace Hopper", size: 40, dot: true)
          Avatar("Moss", size: 56) { FakeArt(seed: 2) }
        }
      }
    }
  }
}

// MARK: Lists

struct ListsPage: View {
  @State private var remember = true
  @State private var autoplay = false
  @State private var skip = 10
  @State private var subtitles = "auto"
  @State private var picked = 1
  @Environment(\.palette) private var palette

  var body: some View {
    GalleryPage("Lists") {
      ListSection {
        ListRow("iOS Admin", subtitle: "Profile, passkeys, single sign-on, and sessions", icon: .userRound) {}
        ListRow("Appearance", subtitle: "Language, color scheme, and themes", icon: .palette) {}
        ListRow("Playback", subtitle: "Languages, quality, and codecs", icon: .monitor) {}
      }
      ListSection("Administration", titleStyle: .label) {
        ListRow("Libraries", subtitle: "Folders Matinee scans for video", icon: .libraryBig) {}
        ListRow("Users", subtitle: "Accounts and roles", icon: .users) {}
        ListRow("Access", subtitle: "Groups, libraries, and limits", icon: .shield, iconTile: true) {}
      }
      ListSection("Languages", footer: "Picks carry over to the next episode.") {
        SelectRow(
          "Subtitles", selection: $subtitles,
          options: [("auto", "As the file says"), ("always", "Always"), ("foreign", "With foreign audio"), ("off", "Off")])
        SwitchRow("Remember audio picks", isOn: $remember)
        SwitchRow("Autoplay the next episode", subtitle: "After the credits start", icon: .play, isOn: $autoplay)
      }
      ListSection("Skipping") {
        SelectRow("Skip back", selection: $skip, options: [(5, "5 seconds"), (10, "10 seconds"), (30, "30 seconds")], stacked: false)
        ValueRow("Version", value: "0.42.0")
      }
      ListSection("Pick one") {
        ForEach(["Original", "1080p", "720p"].indices, id: \.self) { index in
          ListRow(["Original", "1080p", "720p"][index], accessory: .check(picked == index)) { picked = index }
        }
      }
      ListSection("States") {
        ListRow("Pressed", icon: .film) {}.environment(\.forcedInteraction, .pressed)
        ListRow("Focused", icon: .film) {}.environment(\.forcedInteraction, .focused)
        ListRow("Disabled", icon: .film) {}.disabled(true)
        ListRow("Sign out", icon: .logOut, destructive: true) {}
      }
    }
  }
}
