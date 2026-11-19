# Matinee for phones, tablets, and TVs

One Flutter app for Android, Android tablets, Android TV, iPhone, iPad,
and Apple TV. It replaces the Kotlin app in `apps/android` and the SwiftUI
apps in `apps/ios`, which keep shipping until it reaches them. Video plays
in each platform's native player, behind the Flutter view.

So far it has the toolchain, the kit, the API client, the strings, and
the tabs. Every screen behind them is a placeholder that shows its route.

## Build

The recipes enter the flake's Flutter shell for you. Entering it accepts
the Android SDK license.

| Recipe                 | What it does                                  |
| ---------------------- | --------------------------------------------- |
| `just flutter build`   | Debug APK in `build/app/outputs/flutter-apk/` |
| `just flutter install` | Builds and installs the debug app             |
| `just flutter run`     | Installs the debug app and opens it           |
| `just flutter check`   | What CI runs: analyzer, format check, tests   |
| `just flutter format`  | Formats the Dart code                         |
| `just flutter api`     | Regenerates the API client                    |
| `just flutter pigeon`  | Regenerates the platform channels             |
| `just flutter reverse` | Forwards `localhost:5173` to the device       |
| `just flutter logcat`  | Follows the debug app's log                   |

By hand:

```sh
cd apps/flutter
nix develop ../..#flutter -c flutter build apk --debug
```

The version comes from the root `package.json`, like every other part of
the repository, so `pubspec.yaml` has none.

## Run on an emulator

The Flutter shell has no emulator. Use one from your own Android SDK or
Android Studio: a Pixel phone, the Pixel Tablet, and a Television AVD
cover the three layouts. `just flutter run` installs on whichever device
adb sees, or on `ANDROID_SERIAL`.

Use one adb for everything. A second adb of another version restarts the
server, and the running emulators drop off it. If your emulator comes
from your own SDK, put that SDK's `platform-tools` first on the PATH.

The debug app is `io.github.zekurio.matinee.debug`, the same ID as the
Kotlin app's debug build, so installing one replaces the other.

Debug builds render with Vulkan (`src/debug/AndroidManifest.xml`). On an
emulator Impeller would pick OpenGL ES, and the emulator's software GPU,
which `-gpu auto` picks when there's no display, crashes in its GLES
decoder as soon as the app draws.

## Layout

| Folder            | What's in it                                             |
| ----------------- | -------------------------------------------------------- |
| `lib/api`         | The generated API client, from the contract              |
| `lib/core`        | What the screens share: the device, width classes        |
| `lib/kit`         | The UI kit and theme, see below                          |
| `lib/l10n`        | The strings, as ARB files                                |
| `lib/platform`    | Generated platform channels, from `pigeons/`             |
| `lib/screens`     | One folder per screen; `shell` holds the tabs            |
| `lib/router.dart` | Every route, and `Routes`, which builds their paths      |
| `pigeons`         | Pigeon definitions for what Dart asks the platform       |
| `android`         | The Android project, with the native half of each bridge |

State is Riverpod, without code generation. Routing is go_router. Screens
open a page with `context.push(Routes.title(id))`, never with a path
typed out. On a phone or tablet the three tabs (Home, Media, Downloads)
each keep their own stack, and every other page opens over them without
the bar. The bar sits along the bottom up to 840 dp wide, which covers a
phone and a tablet held upright, and becomes a rail on the left past that.
A TV gets its own routes.

A platform channel starts as a Pigeon file in `pigeons/`. Run
`just flutter pigeon`, then implement the generated interface on the
native side, as `MainActivity.kt` does for `DeviceApi`.

## Sessions and sign-in

`lib/core/session.dart` holds the saved servers, the one in use, and the
session on it; the Kotlin app's `Session` is its model. Screens read
`authStateProvider`, `savedServersProvider`, and `apiProvider`, and call
the methods on `sessionProvider.notifier`. `sign_in_state.dart` has what
the sign-in screens do apart from how they look.

- Tokens live in flutter_secure_storage, one per server. The server list,
  the server in use, and offline mode live in shared_preferences.
- Every HTTP client adds the User-Agent, and the bearer token only to its
  server's origin. A client made for one sign-in refuses to send once the
  sign-in changes, so use `apiProvider` again after one.
- Browser sign-in is RFC 8252 with PKCE through flutter_web_auth_2, back
  to `matinee://auth/callback`. A TV signs in with a code instead.
- On Android 17, reaching or finding a server on the local network needs
  `ACCESS_LOCAL_NETWORK`, asked through the platform bridge before
  connecting, retrying, and searching.
- This APK installs over the Kotlin app, and existing installs start
  fresh: on the first launch the platform deletes the Kotlin app's
  preference files and downloads folder (`freshStart` in `main`).

## Strings

The ARB files in `lib/l10n` hold every string, English in `app_en.arb`
and German in `app_de.arb`. Add a message to the English file first,
with its placeholders declared, then translate it. `flutter pub get`
writes the `AppLocalizations` class from them. `test/l10n_test.dart`
fails when a German message has a key the English lacks or uses a
placeholder the English doesn't declare.

`scripts/android_strings.mjs` moved the strings over from the Kotlin app.
It overwrites both files, so don't run it again once this app has strings
of its own.

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
