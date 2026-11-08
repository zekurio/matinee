# Matinee for Android

A native app for Android phones and tablets, written in Kotlin with Jetpack
Compose and Media3. The same APK installs on Android TV, where it signs in
with a code and moves with the D-pad, but phones come first for now.

It looks like the web app on a phone: the same dark theme, Red Hat Text,
lucide icons, the banner on Home, library chips, rails of cards, and title
pages over their backdrop. Text comes in English and German, copied from the
web app's catalogs where the words are the same.

## What it does

- Connects to a server by its address. Without a scheme it tries https, then
  http, since a server on a home network often has no certificate.
- Signs in two ways, both from the contract's `auth.app` and `auth.device`
  (see "Signing in apps" in the repository README):
  - In the browser: a Custom Tab opens `/authorize` with a PKCE challenge,
    the page signs in with a passkey or the OIDC provider, and sends the
    browser back to `matinee://auth/callback`.
  - With a code: the app shows a user code, someone signed in enters it at
    `/link`, and the app polls until it's approved. TVs only offer this.
  The token lives in the app's preferences, encrypted with a key in the
  Android Keystore, and stays out of backups.
- Home: the featured banner, Continue watching, Next up, and what each
  library got last. Libraries with sorting, a genre filter, and search;
  genres, studios, people, search across the server.
- Title, season, and episode pages, with watched marks and favorites. A
  long press on any card offers the rest.
- The player plays the file as it is when the device decodes it, a stream of
  the copied video with converted audio when only the audio doesn't play, and
  an HLS encode otherwise or at a picked quality, falling back in that order
  when something fails. Audio and subtitle tracks start as the account's
  preferences say. The player draws WebVTT subtitles itself, on the file's
  timeline, so they stay in step with every source; picture subtitles burn
  into an encode. It shows trickplay frames while scrubbing, counts down to
  the next episode, reports progress, and keeps playing in picture in
  picture.
- Settings: the account's language preferences, this device's quality,
  sessions, and the server.

Not built yet: downloads, Chromecast, a media session for the lock screen,
and a TV layout of its own.

## Building

The flake has a shell with a JDK and the Android SDK this needs. Entering it
accepts the Android SDK license.

```sh
cd apps/android
nix develop ../..#android -c ./gradlew assembleDebug
adb install app/build/outputs/apk/debug/app-debug.apk
```

Without Nix, install JDK 17 or later and the Android SDK with platform
`android-37.0` and build tools 36.0.0, point `ANDROID_HOME` at it, and run
`./gradlew assembleDebug`. Android Studio opens the folder as it is.

`nix develop ../..#android-emulator -c matinee-emulator` starts an emulator
with a Pixel 7 profile. To reach a dev server on the host from it, forward
the port, so the app connects to the same `PUBLIC_URL` the browser uses:

```sh
adb reverse tcp:5173 tcp:5173   # then connect to http://localhost:5173
```

Release builds sign with the keystore that `MATINEE_KEYSTORE_PROPERTIES`
names (`storeFile`, `storePassword`, `keyAlias`, `keyPassword`), or the debug
key without one.

## Layout

```
app/src/main/java/io/github/zekurio/matinee/
  api/        The REST API under /api/v1 and the plain routes from paths.ts
  auth/       The server, the session and its token, browser sign-in
  ui/         Compose screens: home, browse, title, search, settings, player
  ui/player/  Source choice, track picks, the WebVTT renderer, and the player
scripts/
  lucide.py   Turns lucide icons into vector drawables
```

The models in `api/Models.kt` follow `packages/contracts`. An API change
starts in the contract, as always; the app then reads the new fields.
Strings go in `res/values/strings.xml` and `res/values-de/strings.xml`.

Icons are lucide's, as on the web. Add one with
`scripts/lucide.py <name>` (or `<name>:filled`) from a checkout where
`pnpm install` has run, and reference it in `Lucide` in
`ui/components/Picture.kt`.
