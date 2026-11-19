# Matinee for phones, tablets, and TVs

One Flutter app for Android, Android tablets, Android TV, iPhone, iPad,
and Apple TV. It replaces the Kotlin app in `apps/android` and the SwiftUI
apps in `apps/ios`, which keep shipping until it reaches them. Video plays
in each platform's native player, behind the Flutter view.

This is the first part of that work: the toolchain, the project, and the
pieces the screens build on. It doesn't do anything useful yet.

## Build

The recipes enter the flake's Flutter shell for you. Entering it accepts
the Android SDK license.

| Recipe                 | What it does                                  |
| ---------------------- | --------------------------------------------- |
| `just flutter build`   | Debug APK in `build/app/outputs/flutter-apk/` |
| `just flutter install` | Builds and installs the debug app             |
| `just flutter run`     | Installs the debug app and opens it           |
| `just flutter analyze` | Runs the analyzer                             |
| `just flutter test`    | Runs the Dart tests                           |
| `just flutter api`     | Regenerates the API client                    |

By hand:

```sh
cd apps/flutter
nix develop ../..#flutter -c flutter build apk --debug
```

The version comes from the root `package.json`, like every other part of
the repository, so `pubspec.yaml` has none.

## The kit

Screens build from `lib/kit`, the port of `packages/ui` and its theme. It
keeps the web's and the Android kit's names: `MatineeButton` (looks, sizes,
`shape`, `dimmed`, and the `glass` and `frosted` looks for buttons over a
picture), `Checkbox`, `ChoiceChip`, `ToggleChip`, `Dialog`, `ConfirmDialog`,
`Menu`, `PageDots`, `ProgressRing`, `SearchPill`, `Sheet`, `Slider`,
`RangeSlider`, `Spinner`, `Switch`, `TabBar` with `TabBarState`,
`MatineeTextField`, `Toast` with `ToastState`, `Calendar`, and
`PressIndication`, which stands in for Material's ripple. Words come in as
parameters. `KitIcon` draws the lucide icons in `Lucide` and follows the
text color around it.

Only `lib/kit` and `lib/app.dart` import Material or Cupertino, and only
for behavior (dragging, menus, the text field's editing) that the kit then
draws as the web does; `test/kit_boundary_test.dart` fails on anything
else. If a screen needs a widget the kit doesn't have, add it to the kit.

`MatineeTheme` carries the web's color roles, `KitText` its font sizes and
line heights, and `KitRadius` its radii; Red Hat Text is the default
family. `themeStoreProvider` keeps the preset and light, dark, or system
in shared preferences. Presets and icons are generated, so a change to the
web's palettes or a new icon needs:

```sh
pnpm themes:dart   # lib/kit/theme_presets.g.dart, from packages/ui
pnpm icons:dart    # lib/kit/lucide.g.dart, from lucide-react
```

Add an icon to the list in `scripts/lucide.mjs` first. `pnpm verify` fails
while either file is out of date.

`lib/kit/gallery.dart` shows every component. `test/kit` renders it, and
each group, at 412 by 915 in dark and light with the real font, and
compares them with `test/kit/goldens`. After changing a component, run
`just flutter test --update-goldens` and look at the images that changed.

## License

GPL-3.0, like the native apps it replaces, since it bundles libmpv.
