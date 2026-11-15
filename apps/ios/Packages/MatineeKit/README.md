# MatineeKit

The kit every Apple screen is built from: `packages/ui` drawn in SwiftUI,
as the Android app's `ui/kit` draws it in Compose. A screen built from it
looks like the web app, not like stock SwiftUI. iOS 18 and tvOS 18, Swift 6,
no dependencies.

Where the kit and the web disagree, the web wins: `packages/ui/src/components`
and `packages/ui/src/styles/globals.css`. Android's kit
(`apps/android/.../ui/kit`) shows how that design was made fit for a finger;
the kit keeps its component names where SwiftUI doesn't already use them.

## The rules

- A screen imports `SwiftUI` and `MatineeKit`. From SwiftUI it takes layout
  (`VStack`, `ScrollView`, `LazyVGrid`, `Grid`, `GeometryReader`), `Text`,
  `Image` for pictures, `NavigationStack`, gestures, `.fullScreenCover` for
  the player, `.refreshable`, `ShareLink`, and state. Everything with a look
  of its own comes from the kit.
- Never in a screen: `Button`, `Toggle`, `Picker`, `Slider`, `Stepper`,
  `DatePicker`, `TextField`, `SecureField`, `TextEditor`, `ProgressView`,
  `Gauge`, `Menu`, `Link`, `Label`, `Divider`, `List`, `Form`, `Section`,
  `DisclosureGroup`, `.sheet`, `.alert`, `.confirmationDialog`, `.popover`,
  `.contextMenu`, `.toolbar` (other than `.toolbar(.hidden, …)`),
  `ToolbarItem`, `.navigationTitle`, `.searchable`, `.tabItem`, any
  `*Style(…)` modifier, `Image(systemName:)`, `.font(.body)` and the other
  system fonts, and the system colors (`.secondary`, `Color.accentColor`,
  `Color(.systemBackground)`). `Tests/MatineeKitBoundaryTests` fails on
  each; the table below says what to use instead.
- Colors come from `@Environment(\.palette)`, text sizes from
  `.textStyle`, radii from `Radius`, spacing from `Space`, timing from
  `Motion`. A number that isn't one of these is a number the web doesn't
  draw: add a token after the web's rather than a literal.
- Text the kit shows on its own (Close, Cancel, Loading) is in
  `Resources/en.lproj` and `de.lproj`. Text a screen passes in is the
  screen's, from the app's catalog.
- If a screen needs something the kit doesn't have, add it to the kit,
  drawn as the web draws it, and to the gallery. A kit component may wrap
  a system one for its behaviour, as `matineeSheet` keeps the system
  sheet's dragging; what must not show is the system's look.

## Setting up

```swift
WindowGroup {
  Root()
    .toastHost(toasts)                       // once, at the root
    .matineeTheme(theme, mode: themeMode)    // palette, font, background
}
```

The app does this in `Matinee/UI/Root.swift` and `MatineeApp.swift`; its
screens follow `Matinee/UI/README.md`, which builds on this one.

`MatineeTheme(accentLight:accentDark:)` takes the server's `themeAccents`
(`#rrggbb`) and fits them to Matinee's palettes for contrast;
`MatineeTheme.matinee` is Matinee's own. `ThemeMode` is system, light, or
dark. `.forceDarkTheme()` is for the player. `\.matineePalette` is the
palette under a second name, for a module that still has an environment
value of its own called `palette`, as the app's old theme does.

Every page in a `NavigationStack` gets `.topBar("Title")`, or
`.hidesSystemNavigationBar()` when it draws its own top (Back floating over
art). Both paint the page's background and keep the edge swipe back, which
hiding the system bar would otherwise lose.

## Tokens

| Token                                                                                                          | What it is                                                                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `palette.background`, `card`, `popover`, `secondary`, `muted`, `field`                                         | Surfaces: `--background` (neutral-0), `--card` (50), `--popover` (100), `--secondary` (150), `--muted` (100, a surface, not text), `--field` (sunken)                                                                                                                       |
| `palette.foreground`, `mutedForeground`, `foregroundFaint`                                                     | Text: neutral-900, neutral-600, `--foreground-faint`. Android's `Palette.Muted` is `mutedForeground`                                                                                                                                                                        |
| `palette.border`, `input`, `inputHover`, `hairline`, `ring`                                                    | Lines: neutral-200, a field's border (300), its hover (400), `ring-foreground/10` round floating things, the accent focus ring                                                                                                                                              |
| `palette.accent`, `accentForeground`, `accentHover`, `accentActive`, `accentSoft`, `accentBorder`, `accentDim` | The accent family, fitted to the server's accent                                                                                                                                                                                                                            |
| `palette.destructive`, `success`, `warning`, `info`, `live`, `*Soft`                                           | Status colors and their 12% tints                                                                                                                                                                                                                                           |
| `palette.popoverGlass`, `.glassBackground(in:)`                                                                | The web's `glass`: the popover at 65% (84% in light) over a blur; solid under Reduce Transparency                                                                                                                                                                           |
| `.textStyle(.sm, weight: .medium, tracking: .tight)`                                                           | The web's type scale in Red Hat Text: `.xs` 12/16, `.sm` 14/20, `.base` 16/24, `.lg` 18/28, `.xl` 20/28, `.xl2` 24/32, `.xl3` 30/36, `.xl4` 36/40, `.xl5` 48/48, and globals.css's `.px9` … `.px32` (`text-13px` is `.px13`). Sizes and line heights grow with Dynamic Type |
| `.monoTextStyle(.xl4, weight: .semibold, tracking: Tracking.codeEm)`                                           | The web's `font-mono` (SF Mono) at a size of the scale, for a code to type elsewhere                                                                                                                                                                                        |
| `Radius.sm` 6, `.md` 8, `.lg` 10, `.xl` 14, `.xl2` 18; `RoundedRectangle.kit(_:)`                              | The web's radius scale, circular corners as the web's                                                                                                                                                                                                                       |
| `Space.s1` 4 … `Space.s16` 64, `Space.gutter` 16, `Space.section` 32                                           | Tailwind's 4-point steps (`gap-2.5` is `Space.s2_5`)                                                                                                                                                                                                                        |
| `TouchTarget` 44                                                                                               | The least a finger gets; every kit control takes it to hit                                                                                                                                                                                                                  |
| `KitShadow.menu`, `.dialog`, `.toast`, `.bar`, `.small`; `.kitShadow(_:)`                                      | The web's shadows, lighter on light themes                                                                                                                                                                                                                                  |
| `Motion.move` 280 ms, `.enter` 200, `.exit` 150, `.color` 120; `.motion(_:value:)`, `withMotion`, `Reveal`     | The web's timing and its `cubic-bezier(0.22, 1, 0.36, 1)`; fades under Reduce Motion                                                                                                                                                                                        |

## Components

Each takes the kit's press wash (the foreground at 10% under a finger, 6%
under a pointer), the web's focus ring for keyboard and remote, and 50% when
disabled. Every pressable thing takes 44 points to hit.

### Buttons

- `MatineeButton("Play", icon: .play, look:, size:, shape:, dimmed:, pending:, fullWidth:) { }`,
  or `MatineeButton(look:) { action } label: { … }` for any label.
  `ButtonLook`: `.primary`, `.secondary`, `.frosted`, `.glass`, `.floating`
  (a pill beside Back over art), `.outline`, `.ghost`, `.destructive`, `.link`. `ButtonSize`: `.sm` 32 and `.md` 36 (the
  web's), `.touch` 44 (default). `ButtonShape`: `.rounded`, `.capsule`,
  `.leadingHalf`, `.trailingHalf` for split buttons. `dimmed` looks disabled
  but still takes a tap; `pending` shows a spinner and stops taps.
- `RoundIconButton(.heart, label: "Favorite", look:, size: 36, iconSize:, selected:) { }`.
  `IconButtonLook`: `.secondary`, `.ghost`, `.frosted`, `.glass`,
  `.floating` (Back over art), `.primary`, `.outline`.
- `Pressable(shape: .kit(Radius.sm), onLongPress:, longPressLabel:) { action } label: { card }`:
  anything else that's pressed, with the same wash and ring. With
  `onLongPress`, holding it does that instead, with a tap of haptics, and
  VoiceOver offers it as an action named `longPressLabel`.

### Inputs

- `MatineeTextField("Placeholder", text: $text, kind: .text | .secure | .search, icon:, isError:, lines: 2...4, focused:, look: .field | .pill)`
  with an optional trailing view. `.pill` is the search page's capsule.
  SwiftUI's `.keyboardType`, `.textContentType`, `.submitLabel`, and
  `.onSubmit` reach the field.
- `FormField("Label", help:, error:) { control }`: a label over a control,
  help or the error under it.
- `Select("Label", selection: $value, options: [(value, "Name")], size:)`:
  the web's Select, its list in a dropdown as wide as it.
- `SegmentedControl([(value, "Name")], selection: $value)`: a few short
  choices; stacks when they don't fit.
- `Switch(isOn: $on, label: "For VoiceOver")`, 44 by 24.
- `Checkbox(isOn: $on, label:, indeterminate:)`.
- `MatineeSlider(value: $v, in: 0...1, step:, label:, valueText:, onEditingChanged:)`
  and `RangeSlider(value: $range, in:, step:, labels:)`.
- `Chip("Movies", selected:, frosted:, trailingIcon:) { }`, the page chips;
  `ChoiceChip("Films", selected:, count:) { }` and
  `ToggleChip("Drama", isOn: $on, count:)`, the filter panel's.

### Lists

- `ListSection("Title", titleStyle: .heading | .label, footer:) { rows } action: { }`:
  the web's bordered block, hairlines between rows. There is no `List`.
- `ListRow("Title", subtitle:, icon:, iconTile:, value:, accessory: .chevron | .check(on) | .none, destructive:) { action } trailing: { }`.
- `SwitchRow("Title", subtitle:, icon:, isOn: $on)`: the whole row toggles.
- `SelectRow("Title", selection:, options:, stacked:)`: the Select under the
  name (the web on a phone), or its value at the end (`stacked: false`).
- `ValueRow("Title", value:)`.
- `InputRow("Title", text: $text, placeholder:, kind:, help:, error:) { trailing }`:
  the web's InputField, the name over a `MatineeTextField`, help or the
  error under it.
- `ListBlock { }`: the block alone.

### Overlays

- `.dropdownMenu(isPresented: $open, align: .leading | .trailing, matchWidth:) { MenuItem…; MenuLabel(""); MenuSeparator() }`
  on what opens it. `MenuItem("Name", icon:, selected:, destructive:) { }`
  closes the menu, then runs.
- `.matineeSheet(isPresented: $open, size: .fitted | .mediumAndLarge | .large, handle:) { SheetHeader(…); SheetItem(…) }`,
  or `item:`. The web's Drawer and its backdrop over the system sheet's
  dragging. `SheetItem("Name", icon:, destructive:, selected:) { }` closes
  the sheet, then runs. A title's actions go here, as the web shows them on
  a phone; a short list of choices goes in a dropdown.
- `.dialog(isPresented:, title:, description:, centered:, showsClose:, dismissible:) { content } footer: { DialogButton(…); DialogButton.cancel() }`.
  `DialogButton("Save", look:, closes:, pending:) { }` closes the dialog
  and then runs, unless `closes: false`.
- `.confirmDialog(isPresented:, title:, message:, confirm: "Delete", destructive:) { onConfirm }`.
- `ToastState`, `.toastHost(state, clearance:)`, `state.post(ToastMessage("Saved", description:, kind: .success, action: "Undo", closeButton:, duration:))`,
  or `await state.show(…)` for whether its action was pressed.
  `state.replace(with:)` turns a `.loading` toast into its result.
- `.sidePanel(isPresented:, title:) { PanelChoice(…); PanelLabel(""); PanelNote(""); PanelSeparator() }`:
  the player's menus, a glass panel from the trailing edge drawn in the
  view's own window (a presentation would bring back the status bar the
  player hides). `PanelChoice("English", detail: "AAC · 5.1", selected:, enabled:) { }`
  is the web Drawer's choice row; it picks, then closes the panel.
- `@Environment(\.overlayDismiss)`, `\.sheetDismiss`, and `\.sidePanelDismiss`
  close the dialog, menu, sheet, or side panel a view is in, then run what's passed.

### Feedback

- `Spinner(size:, tint:)`, `ProgressRing(progress or nil, size:)`,
  `ProgressBar(value, height:, track:, fill:)`, `Skeleton(radius:)` or
  `Skeleton(shape:)`.
- `EmptyState(icon:, title:, description:) { actions }`.
- `Callout("Title", description:, icon:, look: .standard | .destructive) { actions }`:
  the web's Alert, a note that stays because it holds the page back.
- `Badge("4K", look: .primary | .secondary | .destructive | .outline | .meta | .metaOutline, icon:)`.
- `Avatar("Name", size: 32, dot:) { picture }`: initials until the app
  gives it the loaded picture. The kit doesn't load images.
- `Separator(vertical:)`.

### Over the picture

- `.pictureGlass(in: shape, shade: .light | .medium | .strong | .solid, ring:)`:
  the web player's surfaces, black at 45, 60, 70, or 80% over a blur with a
  `ring-white/15` hairline, whatever the theme; solid under Reduce
  Transparency. The play button and seek preview are `.light`, notes
  `.medium`, the skip button `.strong`, the next episode's card `.solid`.
- `.pictureShadow()`: the web's text shadow for white text and icons over video.

### Bars

- `TopBar("Title", leading: .back | .close | .none, centered:, onLeading:, onHome:) { actions }`
  and `.topBar(…)`: the web's phone bar, 64 tall. `onHome` adds the house
  beside Back.
- `BottomBar([TabBarItem(id, label:, icon:)], accessory:, selection:) { id in }`,
  `TabBarItem(id, label:) { selected in picture }` for the avatar, and
  `.bottomBar(bar)`: the web's floating tab capsule and search circle, with
  no fade under it. It steps aside for the keyboard; toasts rise over it.
- `NavBar([TabBarItem], trailing: [TabBarItem], selection:) { id in } leading: { logo }`
  and `.navBar(bar)`: the web's bar from `sm` up, for a tablet: one frosted
  capsule, centered at the top over a fade, of the logo, the tabs by name,
  and search and the account. The page's safe area starts below it.
- Both bars keep their size at the accessibility text sizes, as iOS's tab
  bar does, show a tab's name large on a long press, and take ⌘1, ⌘2, …

### Calendar and icons

- `MatineeCalendar(selected:, latest:) { date in }`.
- `LucideIcon(.film, label:, size: 20, tint:, scales:)`, and
  `Image(Lucide.film)`. `Lucide.all` lists every icon. Arrows and chevrons
  mirror in right-to-left layouts.

## Replacing the stock controls

| Stock                                                               | Kit                                                                       |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `Button`, `.buttonStyle`                                            | `MatineeButton`, `RoundIconButton`, `Pressable`, `ListRow`                |
| `Toggle`                                                            | `Switch`, `SwitchRow`, `Checkbox`, `ToggleChip`                           |
| `Picker`                                                            | `Select`, `SelectRow`, `SegmentedControl`, `ChoiceChip`                   |
| `Slider`                                                            | `MatineeSlider`, `RangeSlider`                                            |
| `DatePicker`                                                        | `MatineeCalendar`                                                         |
| `TextField`, `SecureField`, `TextEditor`, `.searchable`             | `MatineeTextField` (`.text`, `.secure`, `.search`, `lines:`), `FormField` |
| `ProgressView`, `Gauge`                                             | `Spinner`, `ProgressBar`, `ProgressRing`, `Skeleton`                      |
| `List`, `Form`, `Section`                                           | `ScrollView` of `ListSection` with `ListRow` and the setting rows         |
| `Menu`, `.contextMenu`, `.popover`                                  | `.dropdownMenu`, or `.matineeSheet` with `SheetItem`                      |
| `.sheet`                                                            | `.matineeSheet`                                                           |
| `.alert`, `.confirmationDialog`                                     | `.dialog`, `.confirmDialog`                                               |
| `.navigationTitle`, `.toolbar`, `ToolbarItem`, UIKit bar appearance | `.topBar`, `TopBar`                                                       |
| `TabView` with `.tabItem`                                           | `BottomBar`                                                               |
| `Label`, `Image(systemName:)`                                       | `LucideIcon` beside `Text`                                                |
| `Divider`                                                           | `Separator`                                                               |
| `.font(.body)`                                                      | `.textStyle(.sm)`                                                         |
| `.secondary`, `Color.accentColor`                                   | `palette.mutedForeground`, `palette.accent`                               |

## The gallery

`Sources/MatineeKitGallery` is every component in every state, in light
and dark, in each palette (Matinee's and three server accents), in English
and German, left to right and right to left, and at any text size. It runs
as its own app, without the main one:

```sh
cd apps/ios/Packages/MatineeKit/Gallery
nix run nixpkgs#xcodegen -- generate      # KitGallery.xcodeproj, git-ignored
./shoot.sh buttons-dark -page buttons -scheme dark
SIMULATOR=matinee-design-ipad ./shoot.sh menu -page overlays -open menu
```

`shoot.sh` builds into `apps/ios/build/KitDerivedData`, installs on a
simulator (`matinee-design-iphone` unless `SIMULATOR` says otherwise), and
saves a screenshot under `apps/ios/build/kit-screenshots`. Launch
arguments: `-page` (`foundations`, `palettes`, `buttons`, `inputs`,
`chips`, `lists`, `overlays`, `feedback`, `navigation`, `calendar`,
`icons`), `-scheme light|dark`, `-accent matinee|ember|moss|sun`,
`-locale de`, `-rtl YES`, `-text xxxLarge|accessibility2|…`, `-open
menu|more|sheet|long|dialog|confirm|toast|panel`, and `-scroll "<demo title>"`.
Or open `KitGallery.xcodeproj` and run it; the settings at its top change
all of these live. `KitGallery()` is also a view the main app can show in
a debug build.

The package builds alone for both platforms:

```sh
cd apps/ios/Packages/MatineeKit
xcodebuild -scheme MatineeKit -destination 'generic/platform=iOS Simulator' -derivedDataPath ../../build/KitDerivedData build
xcodebuild -scheme MatineeKit -destination 'generic/platform=tvOS Simulator' -derivedDataPath ../../build/KitDerivedData build
```

## The boundary test

`Tests/MatineeKitBoundaryTests` is Android's `KitBoundaryTest` for Swift:
it fails when a file outside the kit uses a stock control the kit replaces.
By default it scans the gallery, which passes. Point it elsewhere with
`KIT_BOUNDARY_ROOT`, and let folders through with `KIT_BOUNDARY_ALLOW`
(comma-separated, relative to the root); through `xcodebuild`, prefix both
with `TEST_RUNNER_`:

```sh
TEST_RUNNER_KIT_BOUNDARY_ROOT="$PWD/../../Matinee/UI" \
TEST_RUNNER_KIT_BOUNDARY_ALLOW="theme/,components/" \
xcodebuild test -scheme MatineeKit-Package -only-testing:MatineeKitBoundaryTests \
  -destination 'platform=iOS Simulator,name=matinee-design-iphone' -derivedDataPath ../../build/KitDerivedData
```

It prints a count per stock control and every use. The rules are the
`rules` list at the top of the test, each with what to use instead.
`KIT_BOUNDARY_ALLOW_FILE` names a file of folders to let through, one a
line, and a folder on it that no longer uses a stock control fails the test,
so the list only shrinks. The app runs it on the Mac, without a simulator,
over `Matinee/UI` with `Matinee/UI/kit-exclusions.txt`: `just ios boundary`,
and as part of `just ios test`.

## Generated files

- `Theme/ThemePresets.gen.swift`, Matinee's palettes, from
  `packages/ui/src/lib/theme-presets.ts`: `node apps/ios/scripts/themes.mjs`
  writes it with the app's copies, and `--check` checks it.
- `Icons/Lucide.gen.swift` and `Resources/Lucide.xcassets`, from the
  Android kit's `Lucide` object and drawables plus the script's
  `KIT_EXTRAS`: `apps/ios/scripts/lucide.py --kit`, and `--kit --check`.
  To add an icon, add it to Android's kit, or to `KIT_EXTRAS` when Android
  doesn't draw it, and run the script.
- `Resources/Fonts/red_hat_text.ttf` is a link to Android's copy, so the
  repository has one.

## TV

`Sources/MatineeKit/TV` is the kit for Apple TV: Android TV's `ui/tv`
(`apps/android/.../ui/tv`) ported the way the rest of the kit ports
`ui/kit`, with the web's colors, Red Hat Text, and radii. Every file is
`#if os(tvOS)`, so none of it exists on a phone. A TV screen imports
`SwiftUI` and `MatineeKit` and builds from the `TV` components; the phone's
still compile for tvOS, and the TV boundary test (below) keeps them out
of TV screens.

### Focus

Focus moves by the system's focus engine. Every focusable thing takes one
of two looks, as on Android TV:

- A picture (a poster, a still, a person's photo) lifts with the system's
  own focus effect: it grows (about 11% for a poster, more for smaller
  things), casts a shadow, tilts under the thumb on the remote's touch
  surface, and a sheen runs across it. `TVPictureButton`, and every card.
- A control (a button, a chip, a list row, a drawer entry, the search
  field) fills with the text color and its content takes the page's color.
  It grows by `TVFocus.controlScale` (1.05), a list row by `rowScale`
  (1.02), with a soft shadow. Pressed, it sinks back most of the way.
  `TVControlButton`, and every TV control. This is also how tvOS draws its
  own buttons, so the two halves agree.

Android TV draws a ring round a focused picture, because Android has no
lift of its own. On Apple TV the kit takes the system's lift instead and
drops the ring. The alternatives, side by side on the gallery's Focus page:

- Matinee's own, Android's 6% grow, shadow, and a ring in the text color
  6 points clear of the edge, still under the thumb. Consistent with
  Android, crisp, but static: no tilt, no sheen, and it reads as foreign
  next to every other Apple TV app. One line away for an app that wants
  it: `.tvPictureFocus(.matinee)` on the root.
- The system's lift, the kit's choice. The tilt is how a viewer feels
  where focus is while the thumb rests on the remote, and Apple TV viewers
  expect it from every poster. It reads in light mode too, by its shadow.
- Both. The ring can't ride the lift. Drawn outside the picture, the
  lift's platter clips it. Drawn on the picture's edge, tvOS 26's glass rim
  lights it in color (the third poster). Drawn as a layer of its own, it
  stays flat while the picture tilts.

The phone kit's controls on a TV draw focus through `FocusIndicator`, whose
tvOS branch draws the TV ring (`TVFocusRing`): the text color, 6 points, 6
clear of the shape or inside it for rows.

Rows and panels are focus sections, so a move lands in the nearest row or
panel along its way. `TVFocusMemory` keeps where focus was per row and per
page, as Android's `TvFocusMemory`: focus coming back into a row lands on
the card it left, and `restore(fallback:)` puts focus back on the card that
had it last when a page appears or the drawer hands focus back. A page owns
one (`@State private var memory = TVFocusMemory()`), gives it to its
`TVRow`s and `TVPosterGrid`, and calls `memory.restore(fallback: (row, item))`
in `onAppear`. For a row of something else, `.tvFocusRow(key, memory:,
focused:, first:)` does the same with the row's own `@FocusState`.

A page puts its first focus itself, with `restore` or a `defaultFocus`;
otherwise the focus engine starts at the top left, in the drawer.

### Scale

Apple TV lays out 1920 by 1080 points, at 1x on a 1080p set and 2x on a 4K
one, so one scale serves both. Android TV lays out 960 by 540 dp, so the kit
takes its numbers at two points a dp, and a page takes the same share of the
screen on both TVs. Where Apple has a number of its own, the margins and the
least text size, Apple's wins.

| Token                                                                | Value                     | From                                                                          |
| -------------------------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------- |
| `.textStyle(.hero)`                                                  | 88/100 bold, -0.02 em     | `TvType.Hero` 44/50                                                           |
| `.display`, `.headline`                                              | 68/80 bold, 52/64 bold    | `Display` 34/40, `Headline` 26/32                                             |
| `.title`                                                             | 40/52 semibold            | `Title` 20/26, a row's heading                                                |
| `.facts`, `.body`                                                    | 32/44 medium, 32/48       | `Facts`, `Body` 16; Apple's body is 29                                        |
| `.label`, `.caption`                                                 | 30/40 medium, 28/40       | `Label` 15, `Caption` 14; Apple's least is 23                                 |
| `.clock`, `.iconNumber`, `TVCodeText`                                | 40/52, 22/24, 88/108 mono | `Clock`, `IconNumber`, `Code`                                                 |
| `TVOverscan.horizontal`, `.vertical`                                 | 80, 60                    | Apple's safe area (Android's 32 and 27 dp would be 64 and 54)                 |
| `TVPage.start`, `.end`                                               | 176, 80                   | Past the drawer's rail, with room for a card's lift; Android's 80 dp, rounded |
| `TVButtons.height`, `.iconSize`                                      | 88, 40                    | Apple's buttons are 86; Android's 48 dp would be 96                           |
| `TVListItems.height`, `.inset`, `.radius`                            | 96, 40, 28                | Android's 60, 20, 14 dp; a row with a subtitle grows                          |
| `TVCards.posterWidth`, `.landscapeWidth`, `.gap`, `.radius`          | 248, 448, 40, 20          | Android's 124, 224, 20, 10 dp; Apple's catalog sample has 250 and 40          |
| `TVGrid.columns`, `.gap`, `.rowGap`                                  | 7, 36, 48                 | Android's 7, 18, 24 dp                                                        |
| `TVPanels.width`                                                     | 760                       | Android's 380 dp                                                              |
| `TVDrawerSize.row`, `.expanded`                                      | 88, 472                   | Android's 48, 236 dp, the row as tall as a button                             |
| `TVFocus.ring`, `.gap`, `.room`, `.captionGap`                       | 6, 6, 40, 32              | Android's 3 dp ring and gap; room and gap clear the system's lift             |
| `TVSpace.s1` … `.s8`, `.rows`; `TVRadius.sm`, `.card`, `.row`, `.lg` | 8 … 56, 56; 8, 20, 28, 32 | Android TV's steps, doubled                                                   |

tvOS has no Dynamic Type: the system offers no text size (`simctl ui
content_size` says "unsupported"), and the TV styles stay as they are. Bold
Text in the TV's accessibility settings is honoured: every style's weight
goes up a step. The phone's `.textStyle(.sm)` and the rest still exist on
tvOS, and the TV boundary test flags them in a TV screen.

TV pages lay out from the screen's edges, the kit's margins being the safe
area: give a page's root `.ignoresSafeArea()`, so rows can run off the
right edge and backdrops fill the screen.

### Components

- `TVButton("Resume", icon: .play, detail: "18 min left", trailingIcon:, active:, rest:) { }`:
  the pill. `active` is a choice in force, in the accent; `rest` replaces
  its fill without focus, as over the moving picture.
- `TVIconButton(.heart, label: "Favorite", tint:) { }`: a round icon that
  opens to say its label while focused.
- `TVRoundButton(.pause, label: "Pause", size: 88, lit:) { }`, or with any
  content: stays an icon, like the player's. `lit` shows focus before it
  arrives.
- `TVChip("Drama", selected:) { }`.
- `TVListItem("Subtitles", subtitle:, icon:, quiet:, selected:, destructive:, checked:, action:, onLongPress:) { leading } trailing: { TVListValue("English") }`:
  the row. `quiet` rows have no fill until focused, for long lists and
  panels. `TVListValue(value, chevron:)`, `TVListSwitch(isOn)`,
  `TVListHeading("Account")` go with it, and
  `TVStepRow(value, title:) { step in }` is a value Left and Right step,
  like a subtitle delay or a date's day.
- `TVControlButton(shape:, rest:, content:, scale:, lit:, action:, onLongPress:) { }`
  and `TVPictureButton(shape:, action:, onLongPress:, onPlayPause:) { }`:
  anything else pressed, in the control or the picture look. Inside a
  control, `@Environment(\.tvFocused)` says whether it shows focus.
- `.tvSidePanel(isPresented:, title:, description:, loading:) { rows }`,
  or `item:`: the right-edge panel, in place of sheets and menus. It slides
  in over a dimmed screen, focus starts on its first row (or where a
  `defaultFocus` inside says) and stays in it, Menu closes it, and focus
  goes back to what opened it. `@Environment(\.overlayDismiss)` closes it
  from inside, then runs what it's given.
- `.tvOptionsPanel(isPresented:, title:, selection: $sort, options: [TVOption(value, "Name", detail:)])`:
  pick one; focus starts on the one in force, which is checked.
- `.tvActionsPanel(isPresented:, title:, subtitle:, actions: [TVAction("Play", icon: .playOutline) { }])`,
  or `item:` with `actions: { item in [...] }`: a card's actions, as a long
  press opens them. Choosing one closes the panel, then runs it.
- `TVSearchField(text: $query, placeholder:, focus: $focused) { submit }`:
  rests like a button, so moving past it doesn't raise the keyboard;
  Select opens the system's full-screen keyboard, with dictation, and the
  text shows in the field as it's typed. Search or Menu closes it, focus
  back on the field. A clear button follows while there's text.
- `TVClock()`, and `.tvClock(visible:)` to put it top right, fading out
  under a panel or while a grid has the top. It follows the locale's 12 or
  24 hour style.

The words the TV components say on their own (Watched, Clear search, the
search field's placeholder, a card's progress) are in the `TV` table of
`Resources/en.lproj` and `de.lproj`, through `TVText`.

- `TVNavDrawer(top:, entries:, bottom:, selection:, state:, onLeave:, onPick:) { avatar }`
  with `TVDrawerEntry(id, label:, icon:)` (no icon draws the avatar): the
  rail at the left edge, which grows into a labelled drawer on a shade
  while it has focus. Left from a page's first column comes in, on the
  current page's entry; Right leaves and calls `onLeave`, for the page to
  `restore` its focus. `TVDrawerState.open()` comes in from code, as Back
  on Home does on Android.

### Layout pieces

Each takes plain values, a title, a key, a progress, and the picture as a
view the app supplies, or a `URL` for the kit's `TVPicture`
(`AsyncImage`, faded in) when the app has no loader of its own. None knows
MatineeCore.

- `TVPosterCard("Dune", watched:, width:, action:, onLongPress:, onPlayPause:) { art }`
  or `url:`: a 2:3 poster, its name on a tone until the picture is in.
  `width: nil` fills a grid's column.
- `TVLandscapeCard("Severance", detail: "S2 · E4 · 18 min left", progress: 0.6, watched:, action:) { art }`
  or `url:`: a 16:9 still with its progress or watched dot and the caption
  under it.
- `TVCaptionedPoster("Season 2", detail:, badge: "3", watched:) { art }`.
- `TVPersonCard("Zendaya", role: "Chani") { photo }` or `url:`: a round
  photo, initials until it's in.
- `TVArtCard(toneKey:, aspect:, label:, action:) { art }`, `TVProgress(0.6)`,
  `TVWatchedMark()`.
- `TVRow("Continue watching", key: "continue", items:, itemKey: \.id, memory:) { item in card }`:
  a titled row that scrolls sideways, cards going out of sight just right
  of the drawer's rail, remembering its card.
- `TVPosterGrid(items, itemKey:, memory:, columns:, onNearEnd:, onHeaderChange:) { card } header: { } line: { TVFocusLine(info) } footer: { }`:
  a library's grid. The header folds away once focus leaves the first row
  and comes back with it; `onNearEnd` loads the next page.
- `TVItemInfo(name:, subtitle:, facts:, contentRating:, rating:, overview:)`
  with `TVFacts(info)`, `TVFocusLine(info)`, and
  `TVItemHeader(info, height:) { info in TVTitleLogo(info.name, url: logo) }`:
  what a page says about the focused item.
- `TVTitleLogo("Dune", url:, style:, width:, height:, alignment:)`, or with
  the app's own logo view: the logo, or the name when there's none or it
  fails.
- `TVBackdrop(focused) { item in TVPicture(item.backdrop, alignment: .topTrailing) }`:
  the picture behind a page under `TVScrim`, crossfading once focus rests
  for 350 ms.

Long press of Select on a card runs its `onLongPress`, Apple TV's way to
ask for more, which opens the actions panel where Android TV uses Menu;
Play/Pause on a focused card runs its `onPlayPause`, as the TV app plays a
focused title.

### The remote

`TVRemote.swift` gives screens the remote without UIKit:

- `.onTVPlayPause { }`.
- `.tvBackLayers([TVBackLayer(isActive: menuOpen) { menuOpen = false }, TVBackLayer(isActive: controls) { controls = false }])`:
  Menu closes the first active layer, one per press; with none active it
  goes on to the system, which leaves the page or the app. `.onTVBack(isActive:) { }`
  for one layer. A side panel closes itself.
- `.onTVPress([.left, .right], isEnabled: focused) { button, phase in }`:
  a press going down and coming up, for a held press. While it listens,
  that arrow doesn't move focus.
- `.onTVSwipe(isEnabled: focused) { swipe in }`: the touch surface's
  translation and velocity.
- `TVScrub(step: 10)` with `.tvScrubbing(scrub, position:, duration:, isEnabled:) { seekTo in }`:
  Android's `KeySeek`. A press steps, a held press glides faster the longer
  it's held, up to a tenth of the video a second, and a swipe across the
  whole surface moves a tenth of the video. It seeks once, when the press
  or the swipe ends; `scrub.target` is where to draw the head meanwhile.
- `TVFocusSurface { showControls() }`: holds focus and draws nothing, the
  player's picture while its controls are away.

Presses and swipes reach every listener on screen, so give `isEnabled` only
while what listens has focus.

### Phone components on TV

They compile and take focus, wearing the TV ring, at phone sizes. Use the
TV components instead; the TV boundary test flags these:

| Phone                                                      | On TV                                                          |
| ---------------------------------------------------------- | -------------------------------------------------------------- |
| `.matineeSheet`, `.dropdownMenu`                           | `.tvSidePanel`, `.tvActionsPanel`, `.tvOptionsPanel`           |
| `BottomBar`, `TopBar`                                      | `TVNavDrawer`; a `.headline` title, Menu to go back            |
| `MatineeButton`, `RoundIconButton`, `Pressable`            | `TVButton`, `TVIconButton`, `TVRoundButton`, `TVControlButton` |
| `Chip`, `ChoiceChip`, `ToggleChip`                         | `TVChip`                                                       |
| `ListSection`, `ListRow`, `SwitchRow`, `SelectRow`         | `TVListItem` with `TVListValue`, `TVListSwitch`                |
| `Select`, `SegmentedControl`, `Switch`, `Slider`, calendar | a `TVListItem` opening `.tvOptionsPanel`, `TVStepRow`          |
| `MatineeTextField`                                         | `TVSearchField`                                                |
| `.textStyle(.sm)` and the phone sizes                      | `TVTextStyle`                                                  |

Sheets and the bottom bar are left available on tvOS rather than marked
unavailable: the gallery's phone pages build for tvOS, and marking them
would mean wrapping those pages too. `Spinner`, `ProgressBar`, `Avatar`,
`Badge`, `LucideIcon`, and `Separator` take no focus and are fine on a TV
at a size the screen gives them. Toasts and dialogs work, at phone sizes;
the TV app will want TV versions of both.

### The TV gallery

On tvOS the gallery app opens the TV gallery (`TVKitGallery`), whose last
page is the phone gallery as it looks on a TV. Its pages: `focus`,
`scale`, `buttons`, `lists`, `panels`, `search`, `cards`, `grid`, `home`
(a mock-up of Home with the backdrop, header, rows, drawer, and clock),
`remote` (a mock player), and `phone`. Launch arguments: `-page`, `-scheme
light|dark`, `-accent matinee|ember|moss|sun`, `-locale de`, and `-open
sort|actions|day|loading` on `panels`, `drawer` on `search`, `grid`, and
`home`, `keyboard` on `search`. Its home page changes the appearance, the
accent, and the language live.

The simulators are "Apple TV 4K (4th generation)" and "Apple TV 4K (4th
generation) (at 1080p)"; `TVKitGallery()` is also a view the TV app can
show in a debug build.

### Driving the remote

`xcrun simctl` can't press the Siri Remote, and scripting the Simulator's
keyboard takes over the Mac's screen and needs accessibility rights. The
gallery's project has a UI test, `KitGalleryRemote`, that presses the remote
through `XCUIRemote`, which goes through the real focus engine, and saves
screenshots. `Gallery/remote.sh` runs it:

```sh
cd apps/ios/Packages/MatineeKit/Gallery
nix run nixpkgs#xcodegen -- generate
./remote.sh run "-page buttons -scheme dark" "shot:start right*2 shot:third select menu"
```

A run builds, starts a test session (most of a minute), runs the steps, and
quits. To iterate, keep a session and send it steps, which run at once:

```sh
./remote.sh serve "-page home"                     # build, launch, stay
./remote.sh send "down right*3 shot:row hold:select:1 shot:panel menu"
./remote.sh install                                # rebuild the app; the session stays
./remote.sh send "relaunch:-page+home+-scheme+light shot:light"
./remote.sh stop
```

Steps: `up`, `down`, `left`, `right`, `select`, `menu`, `playpause`,
`home`, each with `*n` to repeat; `hold:<button>:<seconds>`;
`wait:<seconds>`; `shot:<name>`, saved as `OUT/<name>.png`; and
`relaunch:<arguments>` with `+` for spaces. `SIMULATOR` picks the device
(the 4K one unless set), `OUT` the folder (`apps/ios/build/tv-kit-screenshots`,
fixed when the session starts), `SETTLE` the seconds before a shot. A
session ends after two hours without steps. `XCUIRemote` has buttons but no
touch surface, so swipes can only be tried by hand, in the Simulator's Apple
TV Remote window.

A screen of the TV app can take the same approach: a UI test in its own
project, `XCUIRemote.shared.press(.right)`, and
`XCUIScreen.main.screenshot()`.

### The TV boundary test

`Tests/MatineeKitBoundaryTests/TVBoundaryTests.swift` scans TV screens for
phone components and phone type sizes, and for the stock controls the main
boundary test catches. By default it scans the TV gallery; point it at the
TV app's screens with `KIT_TV_BOUNDARY_ROOT` (`TEST_RUNNER_KIT_TV_BOUNDARY_ROOT`
through `xcodebuild`).
