#if os(tvOS)
  @_spi(Gallery) import MatineeKit
  import SwiftUI

  /// The TV's type scale, margins, and sizes, with the safe area drawn over the page.
  struct TVScalePage: View {
    @Environment(TVGallerySettings.self) private var settings
    @Environment(\.palette) private var palette

    var body: some View {
      TVGalleryPage(settings.t("Scale and type", "Maße und Schrift")) {
        TVDemo(
          settings.t("Type", "Schrift"),
          note: settings.t(
            "Red Hat Text at Android TV's sizes, two points a dp. tvOS has no Dynamic Type; Bold Text steps every weight up.",
            "Red Hat Text in den Größen von Android TV, zwei Punkt je dp. tvOS kennt kein Dynamic Type; Fettschrift hebt jedes Gewicht an.")
        ) {
          VStack(alignment: .leading, spacing: 20) {
            ForEach(TVTextStyle.allCases, id: \.self) { style in
              let metrics = style.metrics
              HStack(alignment: .firstTextBaseline, spacing: 40) {
                Text(".\(style.rawValue)").textStyle(.caption).foregroundStyle(palette.mutedForeground)
                  .frame(width: 220, alignment: .leading)
                Text("\(Int(metrics.size))/\(Int(metrics.line))").textStyle(.caption)
                  .foregroundStyle(palette.mutedForeground).monospacedDigit()
                  .frame(width: 120, alignment: .leading)
                Text(sample(style)).textStyle(style).lineLimit(1)
              }
            }
            HStack(alignment: .firstTextBaseline, spacing: 40) {
              Text("TVCodeText").textStyle(.caption).foregroundStyle(palette.mutedForeground)
                .frame(width: 380, alignment: .leading)
              TVCodeText("K7Q-4MX")
            }
          }
        }
        TVDemo(
          settings.t("Margins", "Ränder"),
          note: settings.t(
            "The dashed line is the safe area, Apple's 80 at the sides and 60 above and below. Pages start at 176, past the drawer's rail.",
            "Die gestrichelte Linie ist der sichere Bereich: 80 an den Seiten, 60 oben und unten. Seiten beginnen bei 176, hinter der Leiste.")
        ) {
          Grid(alignment: .leading, horizontalSpacing: 48, verticalSpacing: 12) {
            row("TVOverscan.horizontal", TVOverscan.horizontal)
            row("TVOverscan.vertical", TVOverscan.vertical)
            row("TVPage.start", TVPage.start)
            row("TVButtons.height", TVButtons.height)
            row("TVListItems.height", TVListItems.height)
            row("TVCards.posterWidth", TVCards.posterWidth)
            row("TVCards.landscapeWidth", TVCards.landscapeWidth)
            row("TVCards.gap", TVCards.gap)
            row("TVPanels.width", TVPanels.width)
            row("TVDrawerSize.expanded", TVDrawerSize.expanded)
          }
          TVButton(settings.t("Something to focus", "Etwas zum Fokussieren")) {}
        }
      }
      .overlay {
        Rectangle()
          .strokeBorder(palette.accent.opacity(0.7), style: StrokeStyle(lineWidth: 2, dash: [12, 10]))
          .padding(EdgeInsets(top: TVOverscan.vertical, leading: TVOverscan.horizontal, bottom: TVOverscan.vertical, trailing: TVOverscan.horizontal))
          .ignoresSafeArea()
          .allowsHitTesting(false)
      }
    }

    private func row(_ name: String, _ value: CGFloat) -> some View {
      GridRow {
        Text(name).textStyle(.label)
        Text("\(Int(value))").textStyle(.label).foregroundStyle(palette.mutedForeground).monospacedDigit()
      }
    }

    private func sample(_ style: TVTextStyle) -> String {
      switch style {
      case .hero: "The Long Harbour"
      case .display: "Neon Tide"
      case .headline: settings.t("Settings", "Einstellungen")
      case .title: settings.t("Continue watching", "Weiterschauen")
      case .facts: "2023  ·  2h 8m  ·  Drama"
      case .body: settings.t("A lighthouse keeper's daughter returns to the island.", "Die Tochter eines Leuchtturmwärters kehrt zurück.")
      case .label: "S1 · E4  Pressure"
      case .caption: settings.t("18 min left", "Noch 18 Min.")
      case .clock: "20:41"
      case .iconNumber: "10"
      }
    }
  }

  /// Every TV button in every state.
  struct TVButtonsPage: View {
    @Environment(TVGallerySettings.self) private var settings
    @Environment(\.palette) private var palette
    @State private var favorite = false
    @State private var season = 1

    var body: some View {
      TVGalleryPage(settings.t("Buttons and chips", "Schaltflächen und Chips")) {
        TVDemo(
          "TVButton",
          note: settings.t(
            "A pill, 88 tall. Focused it fills with the text color. Active is a choice in force, in the accent.",
            "Eine Pille, 88 hoch. Fokussiert füllt sie sich mit der Textfarbe. Aktiv ist eine gewählte Option, im Akzent.")
        ) {
          HStack(spacing: TVButtons.gap) {
            TVButton(settings.t("Resume", "Fortsetzen"), icon: .play, detail: settings.t("18 min left", "Noch 18 Min.")) {}
            TVButton(settings.t("From the start", "Von vorn"), icon: .rotateCcw) {}
            TVIconButton(favorite ? .heartFilled : .heart, label: settings.t("Favorite", "Favorit"), tint: favorite ? palette.accent : nil) {
              favorite.toggle()
            }
            TVIconButton(.check, label: settings.t("Mark as watched", "Als gesehen markieren")) {}
          }
          HStack(spacing: TVButtons.gap) {
            TVButton(settings.t("Sort", "Sortieren"), detail: settings.t("Newest", "Neueste"), trailingIcon: .chevronDown) {}
            TVButton(settings.t("Filter", "Filter"), icon: .listFilter, active: true) {}
          }
          TVStates {
            TVButton(settings.t("Play", "Abspielen"), icon: .play) {}
          }
          TVStates {
            TVButton(settings.t("Genre", "Genre"), trailingIcon: .chevronDown, active: true) {}
          }
        }
        TVDemo(
          "TVIconButton, TVRoundButton",
          note: settings.t(
            "An icon button opens to say what it does when it takes focus; a round one stays an icon, like the player's.",
            "Ein Symbolknopf nennt seine Aufgabe, sobald er fokussiert ist; ein runder bleibt ein Symbol, wie im Player.")
        ) {
          TVStates {
            TVIconButton(.heart, label: settings.t("Favorite", "Favorit")) {}
          }
          HStack(spacing: TVButtons.gap) {
            TVRoundButton(.skipBack, label: settings.t("Back 10 seconds", "10 Sekunden zurück")) {}
            TVRoundButton(.pause, label: settings.t("Pause", "Pause"), size: 112) {}
            TVRoundButton(.skipForward, label: settings.t("Forward 10 seconds", "10 Sekunden vor")) {}
            TVRoundButton(.captions, label: settings.t("Subtitles", "Untertitel")) {}
            TVRoundButton(.x, label: settings.t("Clear", "Leeren"), lit: true) {}
            TVCaption(settings.t("The last is lit: focused before it has focus", "Der letzte leuchtet vor dem Fokus"))
          }
        }
        TVDemo(
          "TVChip",
          note: settings.t("A genre, a studio, a season's tab; the selected one in the accent.", "Ein Genre, ein Studio, ein Staffel-Reiter; der gewählte im Akzent.")
        ) {
          HStack(spacing: 20) {
            ForEach(1...4, id: \.self) { number in
              TVChip(settings.t("Season \(number)", "Staffel \(number)"), selected: season == number) { season = number }
            }
            TVChip("Drama") {}
            TVChip("Science Fiction") {}
          }
          TVStates(spacing: 40) {
            TVChip("Drama", selected: true) {}
          }
        }
      }
    }
  }

  /// Every TV list row.
  struct TVListsPage: View {
    @Environment(TVGallerySettings.self) private var settings
    @State private var autoplay = true
    @State private var skipIntros = false
    @State private var delay = 0

    var body: some View {
      TVGalleryPage(settings.t("Lists", "Listen")) {
        HStack(alignment: .top, spacing: 96) {
          VStack(alignment: .leading, spacing: TVListItems.gap) {
            TVListHeading(settings.t("Playback", "Wiedergabe"))
            TVListItem(settings.t("Autoplay next episode", "Nächste Folge automatisch"), icon: .play, quiet: true) {
              autoplay.toggle()
            } trailing: {
              TVListSwitch(autoplay)
            }
            TVListItem(
              settings.t("Skip intros", "Vorspann überspringen"),
              subtitle: settings.t("Where the server knows them", "Wo der Server ihn kennt"), icon: .fastForward,
              quiet: true
            ) {
              skipIntros.toggle()
            } trailing: {
              TVListSwitch(skipIntros)
            }
            TVListItem(settings.t("Subtitles", "Untertitel"), icon: .captions, quiet: true) {} trailing: {
              TVListValue(settings.t("English (SDH)", "Deutsch (für Hörgeschädigte)"))
            }
            TVListItem(settings.t("Quality", "Qualität"), icon: .gauge, quiet: true) {} trailing: {
              TVListValue(settings.t("Original", "Original"))
            }
            TVStepRow(
              delay == 0 ? settings.t("None", "Keine") : "\(delay > 0 ? "+" : "")\(delay * 100) ms",
              title: settings.t("Subtitle delay", "Untertitelverzögerung")
            ) { delay += $0 }
            TVListHeading(settings.t("Account", "Konto"))
            TVListItem(settings.t("Servers", "Server"), subtitle: "matinee.home.arpa", icon: .server) {}
            TVListItem(settings.t("Sign out", "Abmelden"), icon: .logOut, destructive: true) {}
          }
          .frame(width: 900)
          .focusSection()
          VStack(alignment: .leading, spacing: 32) {
            TVCaption(settings.t("Pinned focused, a faint fill, selected, checked", "Fokussiert, leicht gefüllt, ausgewählt, abgehakt"))
            TVListItem(settings.t("Focused", "Fokussiert"), subtitle: settings.t("Its subtitle dims on the fill", "Der Untertitel wird auf der Füllung matter"), icon: .tv) {}
              .environment(\.forcedInteraction, .focused)
            TVListItem(settings.t("A faint fill: few, large targets", "Leicht gefüllt: wenige, große Ziele"), icon: .monitor) {}
            TVListItem(settings.t("Selected, focus elsewhere", "Ausgewählt, Fokus woanders"), icon: .film, selected: true) {}
            TVListItem(settings.t("Checked: the choice in force", "Abgehakt: die gewählte Option"), quiet: true, checked: true) {}
            TVListItem(settings.t("Checked and focused", "Abgehakt und fokussiert"), quiet: true, checked: true) {}
              .environment(\.forcedInteraction, .focused)
          }
          .frame(width: 760)
          .focusSection()
        }
      }
    }
  }
#endif
