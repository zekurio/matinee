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

## License

GPL-3.0, like the native apps it replaces, since it bundles libmpv.
