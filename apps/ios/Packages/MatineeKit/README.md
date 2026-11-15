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
dark. `.forceDarkTheme()` is for the player.

Every page in a `NavigationStack` gets `.topBar("Title")`, or
`.hidesSystemNavigationBar()` when it draws its own top (Back floating over
art). Both paint the page's background and keep the edge swipe back, which
hiding the system bar would otherwise lose.

## Tokens

| Token                                                                                                                     | What it is                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `palette.background`, `card`, `popover`, `secondary`, `muted`, `field`                                                    | Surfaces: `--background` (neutral-0), `--card` (50), `--popover` (100), `--secondary` (150), `--muted` (100, a surface, not text), `--field` (sunken)                                                                                                                                                                                                   |
| `palette.foreground`, `mutedForeground`, `foregroundFaint`                                                                | Text: neutral-900, neutral-600, `--foreground-faint`. Android's `Palette.Muted` is `mutedForeground`                                                                                                                                                                                                                                                    |
| `palette.border`, `input`, `inputHover`, `hairline`, `ring`                                                               | Lines: neutral-200, a field's border (300), its hover (400), `ring-foreground/10` round floating things, the accent focus ring                                                                                                                                                                                                                          |
| `palette.accent`, `accentForeground`, `accentHover`, `accentActive`, `accentSoft`, `accentBorder`, `accentDim`            | The accent family, fitted to the server's accent                                                                                                                                                                                                                                                                                                        |
| `palette.destructive`, `success`, `warning`, `info`, `live`, `*Soft`                                                      | Status colors and their 12% tints                                                                                                                                                                                                                                                                                                                       |
| `palette.popoverGlass`, `.glassBackground(in:)`                                                                           | The web's `glass`: the popover at 65% (84% in light) over a blur; solid under Reduce Transparency                                                                                                                                                                                                                                                       |
| `.textStyle(.sm, weight: .medium, tracking: .tight)`                                                                      | The web's type scale in Red Hat Text: `.xs` 12/16, `.sm` 14/20, `.base` 16/24, `.lg` 18/28, `.xl` 20/28, `.xl2` 24/32, `.xl3` 30/36, `.xl4` 36/40, `.xl5` 48/48, and globals.css's `.px9` … `.px32` (`text-13px` is `.px13`). Sizes and line heights grow with Dynamic Type; `.keepsWordsWhole(text, size)` steps a long word down rather than break it |
| `Radius.sm` 6, `.md` 8, `.lg` 10, `.xl` 14, `.xl2` 18; `RoundedRectangle.kit(_:)`, or `.kit(_:)` where a shape goes       | The web's radius scale, circular corners as the web's                                                                                                                                                                                                                                                                                                   |
| `Space.s1` 4 … `Space.s16` 64, `Space.gutter` 16, `Space.section` 32                                                      | Tailwind's 4-point steps (`gap-2.5` is `Space.s2_5`)                                                                                                                                                                                                                                                                                                    |
| `TouchTarget` 44                                                                                                          | The least a finger gets; every kit control takes it to hit                                                                                                                                                                                                                                                                                              |
| `KitShadow.menu`, `.dialog`, `.toast`, `.bar`, `.small`; `.kitShadow(_:)`                                                 | The web's shadows, lighter on light themes                                                                                                                                                                                                                                                                                                              |
| `Motion.move` 280 ms, `.enter` 200, `.exit` 150, `.color` 120; `.motion(_:value:)`, `withMotion`, `Reveal`, `Motion.fade` | The web's timing and its `cubic-bezier(0.22, 1, 0.36, 1)`; fades under Reduce Motion                                                                                                                                                                                                                                                                    |

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
  Toasts rise over a `.bottomBar` below the host, or by `clearance`, for an
  app that knows whether its bar shows (`BottomBar.clearance`).
- `@Environment(\.overlayDismiss)` and `\.sheetDismiss` close the dialog,
  menu, or sheet a view is in, then run what's passed.

### Feedback

- `Spinner(size:, tint:)`, `ProgressRing(progress or nil, size:)`,
  `ProgressBar(value, height:, track:, fill:)`, `Skeleton(radius:)` or
  `Skeleton(shape:)`.
- `EmptyState(icon:, title:, description:) { actions }`.
- `Badge("4K", look: .primary | .secondary | .destructive | .outline | .meta | .metaOutline, icon:)`.
- `Avatar("Name", size: 32, dot:) { picture }`: initials until the app
  gives it the loaded picture. The kit doesn't load images.
- `Separator(vertical:)`.

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
menu|more|sheet|long|dialog|confirm|toast`, and `-scroll "<demo title>"`.
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

The kit builds for tvOS, and its controls take focus: everything pressable
is a SwiftUI button, sliders move with the remote, overlays close on Menu.
Focus is drawn by `FocusIndicator` in `Interaction/Interaction.swift`, the
web's ring for now; the TV's own focus design (pictures grow and gain a
ring, controls fill with the text color, as Android's `ui/tv/Focus.kt`)
replaces it there, and sizes for the couch come with it.
