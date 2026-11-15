#if DEBUG
  import MatineeCore
  import SwiftUI

  struct ColorsPage: View {
    @Environment(\.palette) private var palette

    var body: some View {
      VStack(alignment: .leading, spacing: 28) {
        HStack(spacing: 20) {
          Logo(height: 28)
          LogoMark(size: 32)
        }
        .padding(.horizontal, Gutter)

        GalleryHeading("Palette")
        let named: [(String, Color)] = [
          ("background", palette.background), ("card", palette.card), ("raised", palette.raised),
          ("secondary", palette.secondary), ("border", palette.border), ("input", palette.input),
          ("faint", palette.faint), ("muted", palette.muted), ("foreground", palette.foreground),
          ("accent", palette.accent), ("accentForeground", palette.accentForeground),
          ("accentSoft", palette.accentSoft), ("danger", palette.danger), ("star", palette.star),
          ("success", palette.colors.success.color), ("warning", palette.colors.warning.color),
        ]
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 104), spacing: 12)], spacing: 12) {
          ForEach(named, id: \.0) { name, color in
            VStack(alignment: .leading, spacing: 6) {
              RoundedRectangle(cornerRadius: 8).fill(color).frame(height: 44)
                .overlay { RoundedRectangle(cornerRadius: 8).strokeBorder(palette.border) }
              Text(name).textStyle(.labelSmall).foregroundStyle(palette.muted).lineLimit(1)
            }
          }
        }
        .padding(.horizontal, Gutter)

        GalleryHeading("Tones for missing art")
        HStack(spacing: 12) {
          ForEach(["a", "b", "c", "d"], id: \.self) { key in
            Tone(key).aspectRatio(2 / 3, contentMode: .fit).clipShape(CardShape)
          }
        }
        .padding(.horizontal, Gutter)

        GalleryHeading("Type")
        VStack(alignment: .leading, spacing: 14) {
          ForEach(Typography.allCases, id: \.self) { style in
            VStack(alignment: .leading, spacing: 2) {
              Text(verbatim: "\(style)").textStyle(.labelSmall).foregroundStyle(palette.faint)
              Text(Str.browseContinueWatching + " · Größe").textStyle(style)
            }
          }
          Text("bodyMedium, medium: " + Str.browseHomeNothingYetDescription)
            .textStyle(.bodyMedium, weight: .medium)
          Text("bodyMedium: " + Str.browseHomeNothingYetDescription).textStyle(.bodyMedium)
            .foregroundStyle(palette.muted)
        }
        .padding(.horizontal, Gutter)

        GalleryHeading("Plurals, numbers, and dates in the app's language")
        VStack(alignment: .leading, spacing: 4) {
          Text([Str.mediaEpisodeCount(1), Str.mediaEpisodeCount(12), Str.mediaNewEpisodes(3)].joined(separator: " · "))
          Text(
            [formatRuntime(135), formatBytes(1_400_000_000), formatBitrate(2_500_000), formatCount(12_400)]
              .compactMap(\.self).joined(separator: " · "))
          Text([formatDay("2024-03-05"), formatRating(7.84), languageList(["de", "en"])].compactMap(\.self)
            .joined(separator: " · "))
        }
        .textStyle(.bodyMedium)
        .foregroundStyle(palette.muted)
        .padding(.horizontal, Gutter)
      }
    }
  }

  struct IconsPage: View {
    @Environment(\.palette) private var palette

    var body: some View {
      VStack(alignment: .leading, spacing: 20) {
        GalleryHeading("Lucide, in the foreground color, scaling with the text size")
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 84), spacing: 8)], spacing: 16) {
          ForEach(Lucide.all, id: \.name) { name, icon in
            VStack(spacing: 6) {
              LucideIcon(icon, size: 24)
              Text(name).textStyle(.labelSmall).foregroundStyle(palette.muted).lineLimit(1)
                .minimumScaleFactor(0.7)
            }
          }
        }
        .padding(.horizontal, Gutter)
        GalleryHeading("Tinted")
        HStack(spacing: 16) {
          LucideIcon(.heartFilled, size: 24, tint: palette.danger)
          LucideIcon(.star, size: 24, tint: palette.star)
          LucideIcon(.play, size: 24, tint: palette.accent)
          LucideIcon(.cloudOff, size: 24, tint: palette.muted)
          Label { Text(Str.downloadsAction) } icon: { Image(Lucide.download) }.textStyle(.labelLarge)
        }
        .padding(.horizontal, Gutter)
      }
    }
  }

  struct ControlsPage: View {
    @Environment(\.palette) private var palette
    @State private var chip = 0
    @State private var segment = ThemeMode.system
    @State private var on = true
    @State private var level = 0.4
    @State private var text = ""
    @State private var address = "media.example"
    @State private var query = "Matrix"

    var body: some View {
      VStack(alignment: .leading, spacing: 24) {
        GalleryHeading("Buttons")
        VStack(alignment: .leading, spacing: 12) {
          GalleryRow {
            MatineeButton(.primary, action: {}) {
              LucideIcon(.play, size: 16)
              Text(Str.titlePlay)
            }
            MatineeButton(.secondary, action: {}) { Text(Str.titleResume) }
            MatineeButton(.outline, action: {}) { Text(Str.commonCancel) }
          }
          GalleryRow {
            MatineeButton(.frosted, action: {}) {
              LucideIcon(.info, size: 16)
              Text(Str.mediaHeroDetails)
            }
            MatineeButton(.ghost, action: {}) { Text(Str.commonBack) }
            MatineeButton(.primary, action: {}) { Text(Str.connectButton) }.disabled(true)
          }
          RetryButton {}
        }
        .padding(.horizontal, Gutter)

        GalleryHeading("Round icon buttons")
        HStack(spacing: 8) {
          RoundIconButton(.check, label: Str.mediaMarkWatched) {}
          RoundIconButton(.heartFilled, label: Str.mediaRemoveFavorite, tint: palette.danger) {}
          RoundIconButton(.ellipsis, label: Str.commonBack) {}
          RoundIconButton(.arrowLeft, label: Str.commonBack, background: .clear) {}
          PlayGlyph(label: Str.mediaPlayNamed("The Matrix")) {}
            .background(Tone("x").clipShape(Circle()))
        }
        .padding(.horizontal, Gutter)

        GalleryHeading("Chips")
        ScrollView(.horizontal) {
          HStack(spacing: 8) {
            ForEach(Array([Str.browseKindAll, Str.browseKindMovie, Str.browseKindShow].enumerated()), id: \.0) {
              index, label in
              Chip(label, selected: chip == index) { withMotion(Motion.color) { chip = index } }
            }
            Chip(Str.browseGenre, trailingIcon: .x) {}
            Chip(Str.browseStudio, frosted: true) {}
          }
        }
        .contentMargins(.horizontal, Gutter, for: .scrollContent)
        .scrollIndicators(.hidden)

        GalleryHeading("Segmented control, switch, slider")
        VStack(alignment: .leading, spacing: 12) {
          SegmentedControl(
            [
              (ThemeMode.system, Str.webAppearanceColorSchemeSystem),
              (.light, Str.webAppearanceColorSchemeLight), (.dark, Str.webAppearanceColorSchemeDark),
            ], selection: $segment)
          Toggle(Str.mediaWatched, isOn: $on).toggleStyle(.matinee).textStyle(.bodyLarge)
          MatineeSlider(Str.a11yPlayerSeek, value: $level, in: 0...1)
        }
        .padding(.horizontal, Gutter)

        GalleryHeading("Badges, progress, avatars")
        VStack(alignment: .leading, spacing: 10) {
          HStack(spacing: 10) {
            WatchedBadge()
            Badge("1080p")
            Badge("HDR10", outlined: true)
            Badge("FSK 12")
          }
          HStack(spacing: 10) {
            Avatar("Masi Oka", url: nil)
            Avatar("zekurio", url: nil, size: 28)
            Avatar("Face", url: Sample.face?.url.absoluteString)
          }
        }
        .padding(.horizontal, Gutter)
        ArtFrame("progress", aspect: 16 / 9) {
          Picture(Sample.still)
          ProgressBar(progress: 0.62).frame(maxHeight: .infinity, alignment: .bottom)
        }
        .frame(width: 240)
        .padding(.horizontal, Gutter)

        GalleryHeading("Text fields")
        VStack(spacing: 12) {
          MatineeTextField($address, placeholder: Str.connectPlaceholder, leadingIcon: .server)
          MatineeTextField($text, placeholder: Str.connectPlaceholder)
          MatineeTextField($address, placeholder: Str.connectPlaceholder, isError: true)
          SearchField($query)
          SearchField(.constant(""))
        }
        .padding(.horizontal, Gutter)

        GalleryHeading("Section titles")
        VStack(alignment: .leading, spacing: 8) {
          SectionTitle(Str.browseNextUp)
          SectionTitle(Str.browseRecentlyAdded("Movies")) {}
        }
        .padding(.horizontal, Gutter)

        GalleryHeading("QR code")
        QrCode("http://localhost:18420/link?code=BCDF-GHJK", label: Str.signinCodeScan, size: 200)
          .padding(.horizontal, Gutter)
      }
    }
  }

  /// A row of controls, stacked when the text size leaves no room for it.
  struct GalleryRow<Content: View>: View {
    @ViewBuilder let content: () -> Content

    var body: some View {
      ViewThatFits(in: .horizontal) {
        HStack(spacing: 8, content: content)
        VStack(alignment: .leading, spacing: 8, content: content)
      }
    }
  }

  struct CardsPage: View {
    let server: GalleryServer
    @Environment(\.windowSize) private var window

    var body: some View {
      VStack(alignment: .leading, spacing: 28) {
        GalleryHeading("Made up here, no artwork: the placeholders")
        Rail(Str.browseContinueWatching) {
          ForEach(Sample.episodes, id: \.id) { item in RailItem(.landscape) { EpisodeCard(item) } }
        }
        Rail(Str.browseRecentlyAdded("Movies"), onTitleTap: {}) {
          ForEach(Sample.movies, id: \.id) { title in
            RailItem(.poster) { PosterCard(title, detail: formatYear(title.year)) }
          }
          RailItem(.poster) { ShelfCard(Sample.shelf(Sample.show, added: 1)) }
          RailItem(.poster) { ShelfCard(Sample.shelf(Sample.show, added: 3)) }
          RailItem(.poster) { ShelfCard(Sample.shelf(Sample.show, added: nil)) }
        }

        GalleryHeading("With pictures, and one still loading")
        Rail(Str.titleCast) {
          RailItem(.person) { PersonCard("Keanu Reeves", role: "Neo", photo: Sample.face) }
          RailItem(.person) { PersonCard("Carrie-Anne Moss", role: "Trinity", photo: nil) }
          RailItem(.person) { PersonCard("Hugo Weaving", role: "Agent Smith", photo: Sample.loading) }
        }
        Rail(Str.searchTitlesHeading) {
          ForEach(Array(Sample.posters.enumerated()), id: \.0) { index, poster in
            RailItem(.poster) {
              VStack(alignment: .leading, spacing: 0) {
                PosterArt(name: Sample.movies[index].name, poster: poster, watched: index == 1)
                CardText(Sample.movies[index].name, formatYear(Sample.movies[index].year))
              }
            }
          }
          RailItem(.poster) {
            VStack(alignment: .leading, spacing: 0) {
              PosterArt(name: "Loading", poster: Sample.loading)
              CardText("Loading", nil)
            }
          }
        }

        GalleryHeading("Episode rows")
        VStack(spacing: 4) {
          ForEach(Sample.episodes.prefix(3), id: \.id) { EpisodeRow($0) }
        }
        .padding(.horizontal, Gutter)

        GalleryHeading("Grid: \(isWide(window) ? "wide" : "phone"), adaptive columns")
        CardGrid {
          ForEach(Sample.movies + [Sample.show], id: \.id) { PosterCard($0, detail: formatYear($0.year)) }
        }

        ServerRails(server: server)
      }
    }
  }

  /// The dev server's Home, through the real loaders.
  struct ServerRails: View {
    let server: GalleryServer

    var body: some View {
      if server.api == nil {
        GalleryHeading("No dev server: launch with -gallery.server and -gallery.token")
      } else {
        VStack(alignment: .leading, spacing: 28) {
          GalleryHeading("From the dev server")
          rail(Str.browseContinueWatching, server.resume)
            .loads(server.resume) { try await $0.home.continueWatching() }
          rail(Str.browseNextUp, server.nextUp)
            .loads(server.nextUp) { try await $0.home.nextUp().map(\.item) }
          shelves
            .loads(server.shelves) { api in
              var shelves: [(Library, [ShelfEntry])] = []
              for library in try await api.libraries.list() {
                shelves.append((library, try await api.media.shelf(libraryId: library.id)))
              }
              return shelves
            }
        }
      }
    }

    @ViewBuilder private func rail(_ title: String, _ loader: Loader<[MediaItem]>) -> some View {
      switch loader.state {
      case .loading: RailSkeleton(title: title, art: .landscape)
      case .failed(let message, let disconnected):
        RailFailure(
          title: title, headline: Str.homeContinueFailed, message: message, disconnected: disconnected,
          onRetry: loader.reload)
      case .ready(let items):
        Rail(title) { ForEach(items, id: \.id) { item in RailItem(.landscape) { EpisodeCard(item) } } }
      }
    }

    @ViewBuilder private var shelves: some View {
      switch server.shelves.state {
      case .loading: RailSkeleton(title: nil, art: .poster)
      case .failed(let message, let disconnected):
        Notice(Str.homeLoadFailed, message, disconnected: disconnected, onRetry: server.shelves.reload)
      case .ready(let shelves):
        VStack(alignment: .leading, spacing: 28) {
          ForEach(shelves, id: \.0.id) { library, entries in
            Rail(Str.browseRecentlyAdded(library.name), onTitleTap: {}) {
              ForEach(entries, id: \.title.id) { entry in RailItem(.poster) { ShelfCard(entry) } }
            }
          }
        }
      }
    }
  }

  struct RowsPage: View {
    @Environment(ThemeStore.self) private var theme
    @Environment(\.palette) private var palette
    @State private var on = true
    @State private var off = false
    @State private var ask: WatchedAsk?
    @State private var sheet = false
    @State private var more = false

    var body: some View {
      VStack(alignment: .leading, spacing: 28) {
        SettingsSection(Str.settingsPageAppearance) {
          Panel {
            PickerRow(
              Str.webAppearanceColorScheme,
              options: [
                (ThemeMode.system, Str.webAppearanceColorSchemeSystem),
                (.light, Str.webAppearanceColorSchemeLight), (.dark, Str.webAppearanceColorSchemeDark),
              ], current: theme.mode, onPick: theme.setMode)
            RowDivider()
            SwitchRow(Str.mediaWatched, isOn: $on, icon: .check)
            RowDivider()
            SwitchRow(Str.downloadsTitle, isOn: $off)
            Reveal(off) {
              RowDivider()
              ValueRow(Str.aboutVersion, value: "0.0.1")
            }
          }
        }
        .padding(.horizontal, Gutter)

        SettingsSection(Str.aboutTitle) {
          Panel {
            ValueRow(Str.aboutVersion, value: "0.0.1")
            RowDivider()
            ValueRow(Str.aboutDevice, value: "iPhone Simulator")
            RowDivider()
            LinkRow(Str.accountSessionsTitle, value: "3", icon: .smartphone) {}
            RowDivider()
            LinkRow(Str.connectChangeServer, icon: .server, description: Str.connectDescription) {}
            RowDivider()
            LinkRow(Str.commonRemove, destructive: true, icon: .trash) {}
            RowDivider()
            PickerRow(Str.aboutDevice, options: [(1, "One")], current: 1, enabled: false) { _ in }
          }
        }
        .padding(.horizontal, Gutter)

        SettingsSection("Sheets") {
          Panel {
            LinkRow(Str.mediaMarkWatched, icon: .calendarClock) {
              ask = WatchedAsk(name: "The Matrix") { _ in try await Task.sleep(for: .milliseconds(300)) }
            }
            RowDivider()
            LinkRow(Str.actionsEpisodeDetails, icon: .list) { sheet = true }
          }
        }
        .padding(.horizontal, Gutter)

        GalleryHeading("A sheet's rows, inline")
        VStack(spacing: 0) {
          sheetRows
        }
        .background(palette.raised, in: PanelShape)
        .padding(.horizontal, Gutter)
      }
      .sheet(item: $ask) { WatchedAtSheet($0) }
      .sheet(isPresented: $sheet) {
        VStack(spacing: 0) { sheetRows }.padding(.vertical, 12).frame(maxHeight: .infinity, alignment: .top)
          .matineeSheet([.medium])
      }
    }

    @ViewBuilder private var sheetRows: some View {
      SheetHeader("Pilot", Sample.show.name)
      SheetItem(.playOutline, Str.titleResume) {}
      SheetItem(.rotateCcw, Str.actionsPlayFromStart) {}
      SheetItem(.check, Str.mediaMarkWatched) {}
      SheetItem(.heart, Str.mediaAddFavorite) {}
      SheetItem(.trash, Str.downloadsRemove, destructive: true) {}
    }
  }

  struct StatesPage: View {
    @State private var shown = true
    @Environment(\.palette) private var palette

    var body: some View {
      VStack(alignment: .leading, spacing: 28) {
        GalleryHeading("Loading")
        LoadingBox().frame(height: 120)
        RailSkeleton(title: Str.browseContinueWatching, art: .landscape)
        RailSkeleton(title: nil, art: .poster)

        GalleryHeading("Failed")
        ErrorBox(Str.homeFailed, Str.errorUnreadable) {}
          .frame(minHeight: 300)
        ErrorBox(Str.homeFailed, Str.errorUnreachable, disconnected: true) {}
          .frame(minHeight: 160)
        Notice(Str.loadingStale, Str.errorConnectionLost) {}
        Notice(Str.homeFeaturedFailed, nil, disconnected: true) {}
        RailFailure(
          title: Str.browseNextUp, headline: Str.homeNextUpFailed, message: Str.errorUnreachable, onRetry: {})

        GalleryHeading("Empty")
        EmptyState(.popcorn, Str.browseHomeNothingYet, Str.browseHomeNothingYetDescription)
        EmptyState(.folderPlus, Str.browseHomeNoLibraries, Str.browseHomeNoLibrariesAdmin)

        GalleryHeading("Bars")
        NavigationLink(value: "The Matrix") {
          Text("Open a title page (floating bar, scrim, back swipe)").textStyle(.bodyLarge)
            .foregroundStyle(palette.accent)
        }
        .padding(.horizontal, Gutter)
        AppHeader { RoundIconButton(.cloudOff, label: Str.serverUnreachable, background: .clear) {} }
          .background(Tone("header"))
      }
    }
  }
#endif
