@_spi(Gallery) import MatineeKit
import SwiftUI

// MARK: Overlays

struct OverlaysPage: View {
  @Environment(GallerySettings.self) private var settings
  @Environment(ToastState.self) private var toasts
  @Environment(\.palette) private var palette
  @State private var menu = false
  @State private var selectMenu = false
  @State private var actions = false
  @State private var longSheet = false
  @State private var dialog = false
  @State private var confirm = false
  @State private var rename = "The Matrix (1999)"
  @State private var quality = "1080"
  @State private var lastAction = "Nothing yet"
  @State private var panel = false
  @State private var audio = "en"

  var body: some View {
    GalleryPage("Menus, sheets, dialogs, toasts") {
      Demo("Dropdown menu", note: "Opens from what was pressed: glass, a hairline ring, a deep shadow.") {
        HStack(spacing: 12) {
          MatineeButton("Sort", icon: .arrowUpDown, look: .outline, size: .md) { menu = true }
            .dropdownMenu(isPresented: $menu) {
              MenuLabel("Sort by")
              MenuItem("Date added", icon: .calendar, selected: true) { lastAction = "Date added" }
              MenuItem("Title", icon: .list) { lastAction = "Title" }
              MenuItem("Release date", icon: .clock) { lastAction = "Release date" }
              MenuSeparator()
              MenuItem("Remove from library", icon: .trash, destructive: true) { confirm = true }
            }
          Spacer()
          RoundIconButton(.ellipsis, label: "More", look: .ghost) { selectMenu = true }
            .dropdownMenu(isPresented: $selectMenu, align: .trailing) {
              MenuItem("Refresh metadata", icon: .refreshCw) { lastAction = "Refresh" }
              MenuItem("Edit images", icon: .imageUp) { lastAction = "Edit images" }
              MenuItem("Download", icon: .download) { lastAction = "Download" }
            }
        }
        Caption("Last picked: \(lastAction)")
        Caption("Static, every row state:")
        StaticMenu()
      }
      Demo("Sheet", note: "The web's Drawer: glass, rounded at the top, the grip. The system sheet drags it.") {
        HStack(spacing: 10) {
          MatineeButton("Actions", icon: .ellipsis, look: .secondary, size: .md) { actions = true }
          MatineeButton("Long list", icon: .list, look: .secondary, size: .md) { longSheet = true }
        }
      }
      Demo("Side panel", note: "The player's menus: glass from the trailing edge, drawn in place over a backdrop.") {
        MatineeButton("Audio", icon: .audioLines, look: .secondary, size: .md) { panel = true }
        Caption("Picked: \(audio)")
      }
      Demo("Over the picture", note: "The web player's surfaces: black over a blur, a faint white ring.") {
        HStack(spacing: 12) {
          ForEach(Array([PictureShade.light, .medium, .strong, .solid].enumerated()), id: \.offset) { _, shade in
            Text("Aa").textStyle(.sm, weight: .medium).foregroundStyle(.white).pictureShadow()
              .frame(width: 56, height: 44)
              .pictureGlass(in: RoundedRectangle.kit(Radius.lg), shade: shade)
          }
        }
        .padding(16)
        .frame(maxWidth: .infinity)
        .background(
          LinearGradient(colors: [.yellow, .cyan, .pink], startPoint: .leading, endPoint: .trailing),
          in: RoundedRectangle.kit(Radius.xl))
      }
      Demo("Dialog", note: "A popover panel in the middle, its buttons stacked under a line.") {
        HStack(spacing: 10) {
          MatineeButton("Rename", look: .outline, size: .md) { dialog = true }
          MatineeButton("Delete", look: .destructive, size: .md) { confirm = true }
        }
      }
      Demo("Toast", note: "Sonner's look: the status icon, the action at the end, the close button on the corner.") {
        Flow(spacing: 8) {
          MatineeButton("Plain", look: .secondary, size: .sm) { toasts.post(ToastMessage("Added to favorites")) }
          MatineeButton("Success", look: .secondary, size: .sm) {
            toasts.post(ToastMessage("Library scanned", description: "12 new titles", kind: .success))
          }
          MatineeButton("Error", look: .secondary, size: .sm) {
            toasts.post(ToastMessage("Couldn't reach the server", kind: .error, closeButton: true))
          }
          MatineeButton("With action", look: .secondary, size: .sm) {
            Task {
              let result = await toasts.show(ToastMessage("Marked as watched", action: "Undo", closeButton: true))
              lastAction = result == .actionPerformed ? "Undo" : "Toast went away"
            }
          }
          MatineeButton("Loading", look: .secondary, size: .sm) {
            toasts.post(ToastMessage("Downloading", kind: .loading))
            Task {
              try? await Task.sleep(for: .seconds(2))
              toasts.replace(with: ToastMessage("Downloaded", kind: .success))
            }
          }
        }
        Caption("Static, every kind:")
        VStack(spacing: 18) {
          Toast(ToastMessage("Added to favorites"))
          Toast(ToastMessage("Library scanned", description: "12 new titles, 3 updated", kind: .success))
          Toast(ToastMessage("Request sent", kind: .info))
          Toast(ToastMessage("Transcoding is slow", description: "No hardware encoder found", kind: .warning))
          Toast(ToastMessage("Couldn't reach the server", kind: .error), onClose: {})
          Toast(ToastMessage("Downloading", kind: .loading))
          Toast(ToastMessage("Marked as watched", action: "Undo"), onClose: {})
        }
        .padding(.top, 8)
      }
    }
    .sidePanel(isPresented: $panel, title: "Audio") {
      PanelChoice("English", detail: "AAC · 5.1", selected: audio == "en") { audio = "en" }
      PanelChoice("German", detail: "AC-3 · Stereo", selected: audio == "de") { audio = "de" }
      PanelChoice("Commentary", detail: "DTS", enabled: false) {}
      PanelSeparator()
      PanelLabel("Subtitles")
      PanelNote("This file has no subtitles.")
    }
    .matineeSheet(isPresented: $actions) {
      SheetHeader("The Matrix", subtitle: "1999 · Movie")
      SheetItem("Play from the start", icon: .rotateCcw) { lastAction = "Play from start" }
      SheetItem("Download", icon: .download) { lastAction = "Download" }
      SheetItem("Edit images", icon: .imageUp) { lastAction = "Edit images" }
      SheetItem("Refresh metadata", icon: .refreshCw) { lastAction = "Refresh" }
      SheetItem("Remove", icon: .trash, destructive: true) { confirm = true }
    }
    .matineeSheet(isPresented: $longSheet, size: .mediumAndLarge) {
      SheetHeader("Quality")
      ScrollView {
        VStack(spacing: 0) {
          ForEach(["Original", "4K", "1080p", "720p", "480p", "360p", "Audio only"], id: \.self) { option in
            SheetItem(option, selected: option == "1080p") {}
          }
          ForEach(1...14, id: \.self) { index in
            SheetItem("Episode \(index)", icon: .tvPlay) {}
          }
        }
      }
    }
    .dialog(
      isPresented: $dialog, title: "Rename file", description: "The new name shows in every library it's in.",
      showsClose: true
    ) {
      MatineeTextField("Name", text: $rename)
      Select("Quality", selection: $quality, options: [("1080", "1080p"), ("720", "720p")])
    } footer: {
      DialogButton("Save", look: .primary) { lastAction = "Renamed to \(rename)" }
      DialogButton.cancel()
    }
    .confirmDialog(
      isPresented: $confirm, title: "Remove The Matrix?", message: "Its files stay on disk; it leaves the library.",
      confirm: "Remove"
    ) {
      toasts.post(ToastMessage("Removed The Matrix", action: "Undo", closeButton: true))
    }
    .onAppear {
      switch settings.open {
      case "menu": menu = true
      case "more": selectMenu = true
      case "sheet": actions = true
      case "long": longSheet = true
      case "dialog": dialog = true
      case "confirm": confirm = true
      case "panel": panel = true
      case "toast": toasts.post(ToastMessage("Marked as watched", action: "Undo", closeButton: true, duration: .indefinite))
      default: break
      }
      settings.open = nil
    }
  }
}

/// A menu's panel drawn in place, to show its rows without opening it.
private struct StaticMenu: View {
  @Environment(\.palette) private var palette

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      MenuLabel("Sort by")
      MenuItem("Date added", icon: .calendar, selected: true) {}
      MenuItem("Pressed", icon: .list) {}.environment(\.forcedInteraction, .pressed)
      MenuItem("Focused", icon: .clock) {}.environment(\.forcedInteraction, .focused)
      MenuItem("Disabled", icon: .lock) {}.disabled(true)
      MenuSeparator()
      MenuItem("Remove from library", icon: .trash, destructive: true) {}
    }
    .padding(4)
    .frame(width: 240)
    .glassBackground(in: RoundedRectangle.kit(Radius.xl))
    .overlay { RoundedRectangle.kit(Radius.xl).strokeBorder(palette.hairline) }
    .kitShadow(.menu)
  }
}

// MARK: Feedback

struct FeedbackPage: View {
  @Environment(\.palette) private var palette

  var body: some View {
    GalleryPage("Loading and empty") {
      Demo("Spinner", note: "lucide's loader circle, turning once a second.") {
        HStack(spacing: 20) {
          Spinner(size: 16)
          Spinner(size: 24)
          Spinner(size: 32, tint: palette.accent)
          MatineeButton("Saving", pending: true) {}
        }
      }
      Demo("Progress ring", note: "The catalog card's ring; dotted while there's nothing to count.") {
        HStack(spacing: 20) {
          ForEach([nil, 0, 0.35, 0.7, 1] as [Double?], id: \.self) { value in
            VStack(spacing: 6) {
              ProgressRing(value, size: 28)
              Caption(value.map { "\(Int($0 * 100))%" } ?? "nil")
            }
          }
        }
      }
      Demo("Progress bar") {
        ProgressBar(0.4)
        ZStack(alignment: .bottom) {
          FakeArt(seed: 2).frame(height: 120)
          ProgressBar(0.66, track: .black.opacity(0.45)).padding(8)
        }
        .clipShape(RoundedRectangle.kit(Radius.sm))
      }
      Demo("Skeleton", note: "Pulses; still under Reduce Motion.") {
        HStack(alignment: .top, spacing: 12) {
          ForEach(0..<3) { _ in
            VStack(alignment: .leading, spacing: 8) {
              Skeleton(radius: Radius.sm).aspectRatio(2 / 3, contentMode: .fit)
              Skeleton().frame(height: 14)
              Skeleton().frame(width: 48, height: 12)
            }
          }
        }
      }
      Demo("Callout", note: "The web's Alert: a note that holds the page back, with a way to put it right.") {
        Callout(nil, description: "This server isn't set up yet. Finish setup in a browser, then sign in here.", icon: .info)
        Callout(
          "Couldn't reach 192.168.1.20.", description: "Turn on Local Network for Matinee in Settings.",
          icon: .circleAlert, look: .destructive
        ) {
          MatineeButton("Open Settings", icon: .settings, look: .outline, size: .sm) {}
        }
      }
      Demo("Empty state") {
        ListBlock {
          EmptyState(
            icon: .searchX, title: "Nothing matches",
            description: "Try fewer filters, or another word."
          ) {
            MatineeButton("Clear filters", look: .outline, size: .md) {}
          }
        }
        ListBlock {
          EmptyState(icon: .cloudOff, title: "Can't reach the server", description: "Matinee will try again when you're back online.") {
            MatineeButton("Try again", icon: .refreshCw, look: .outline, size: .md) {}
          }
        }
      }
    }
  }
}

// MARK: Bars

struct NavigationPage: View {
  @State private var tab = "home"
  @State private var pressed = 0
  @Environment(\.palette) private var palette

  var body: some View {
    GalleryPage("Bars") {
      Demo("Top bar", note: "This page's own bar is one. Back, the name, and the page's actions.") {
        VStack(spacing: 12) {
          TopBar("Downloads") {
            RoundIconButton(.listFilter, label: "Filter", look: .ghost, size: 48, iconSize: 22) {}
          }
          .overlay { RoundedRectangle.kit(Radius.lg).strokeBorder(palette.border) }
          TopBar("Settings", leading: .close)
            .overlay { RoundedRectangle.kit(Radius.lg).strokeBorder(palette.border) }
          TopBar("Home", leading: .none) {
            RoundIconButton(.search, label: "Search", look: .ghost, size: 48, iconSize: 22) {}
          }
          .overlay { RoundedRectangle.kit(Radius.lg).strokeBorder(palette.border) }
          TopBar(nil, onHome: {})
            .overlay { RoundedRectangle.kit(Radius.lg).strokeBorder(palette.border) }
        }
      }
      Demo("Floating over art", note: "Back and Home on a title's picture, the web's ItemTopBar.") {
        ZStack(alignment: .topLeading) {
          FakeArt(seed: 0).frame(height: 180)
          HStack(spacing: 6) {
            RoundIconButton(.arrowLeft, label: "Back", look: .floating, size: 44, iconSize: 22) {}
            RoundIconButton(.house, label: "Home", look: .floating, size: 44, iconSize: 20) {}
            Text("Breaking Bad")
              .textStyle(.sm, weight: .medium)
              .padding(.horizontal, 16)
              .frame(height: 44)
              .background(palette.background.opacity(0.6), in: Capsule())
          }
          .padding(8)
        }
        .clipShape(RoundedRectangle.kit(Radius.xl))
      }
      Demo("Bottom bar", note: "The tabs float over the page; the open one shows its name.") {
        ZStack(alignment: .bottom) {
          VStack(spacing: 8) {
            ForEach(0..<4) { index in FakeArt(seed: index).frame(height: 60).clipShape(RoundedRectangle.kit(Radius.sm)) }
          }
          .padding(12)
          BottomBar(
            [
              TabBarItem("home", label: "Home", icon: .house),
              TabBarItem("media", label: "Media", icon: .libraryBig),
              TabBarItem("downloads", label: "Downloads", icon: .download),
              TabBarItem("profile", label: "Profile") { selected in
                Avatar("iOS Admin", size: selected ? 22 : 28, dot: true)
                  .padding(selected ? 2 : 0)
                  .overlay { if selected { Circle().strokeBorder(palette.foreground, lineWidth: 1.5) } }
              },
            ], accessory: TabBarItem("search", label: "Search", icon: .search), selection: tab
          ) { tab = $0 }
        }
        .frame(height: 300)
        .clipShape(RoundedRectangle.kit(Radius.xl))
        .overlay { RoundedRectangle.kit(Radius.xl).strokeBorder(palette.border) }
      }
      Demo("Nav bar", note: "A tablet's tabs, the web's bar from sm up: the logo, the tabs by name, search and the account.") {
        ZStack(alignment: .top) {
          FakeArt(seed: 2).frame(height: 160)
          NavBar(
            [
              TabBarItem("home", label: "Home", icon: .house),
              TabBarItem("media", label: "Media", icon: .libraryBig),
              TabBarItem("downloads", label: "Downloads", icon: .download),
            ],
            trailing: [
              TabBarItem("search", label: "Search", icon: .search),
              TabBarItem("profile", label: "Profile") { _ in
                HStack(spacing: 8) {
                  Avatar("iOS Admin", size: 28)
                  Text("iOS Admin").textStyle(.sm, weight: .medium).lineLimit(1).fixedSize()
                }
              },
            ], selection: tab
          ) { tab = $0 } leading: {
            Circle().fill(palette.accent).frame(width: 24, height: 24).padding(.horizontal, 10)
          }
          .padding(.top, 12)
        }
        .frame(height: 160)
        .clipShape(RoundedRectangle.kit(Radius.xl))
      }
      Demo("Keyboard shortcuts", note: "The bars give their tabs ⌘1, ⌘2, …; `.keyCommand` gives a page one of its own, as ⌘F to search.") {
        Text("⌘K pressed \(pressed) times").textStyle(.sm).foregroundStyle(palette.mutedForeground)
          .keyCommand("k", label: "Count") { pressed += 1 }
      }
    }
  }
}

// MARK: Calendar

struct CalendarPage: View {
  @State private var day: Date? = Calendar.current.date(byAdding: .day, value: -3, to: .now)
  @Environment(\.locale) private var locale

  var body: some View {
    GalleryPage("Calendar") {
      Demo("Calendar", note: "When something was watched: today on a muted square, the picked day in the accent.") {
        MatineeCalendar(selected: day, latest: .now) { day = $0 }
        Caption(day.map { $0.formatted(.dateTime.day().month(.wide).year().locale(locale)) } ?? "No day")
      }
    }
  }
}

// MARK: Icons

struct IconsPage: View {
  @Environment(\.palette) private var palette

  var body: some View {
    GalleryPage("Icons") {
      Demo("Lucide", note: "\(Lucide.all.count) icons: Android's set and the few the kit adds.") {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 76), spacing: 8)], spacing: 14) {
          ForEach(Lucide.all, id: \.name) { name, icon in
            VStack(spacing: 6) {
              LucideIcon(icon, size: 24)
              Text(name).textStyle(.px10).foregroundStyle(palette.mutedForeground).lineLimit(1).minimumScaleFactor(0.7)
            }
          }
        }
      }
    }
  }
}
