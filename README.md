<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="brand/logo-dark.svg">
    <img alt="matinee" src="brand/logo-light.svg" width="380">
  </picture>
</p>

<p align="center">
  A self-hosted media server for your folders of movies and shows.
</p>

---

Matinee reads the folders your videos are already in, groups them into
movies and shows, and pulls metadata from TMDB or TheTVDB. New files from
Sonarr, Radarr, or Bazarr show up on their own. People sign in with a
passkey or OIDC and watch in the browser or the apps. Files play
as they are when the device can decode them. Otherwise the server copies
the video and converts the audio, or transcodes on the GPU with
jellyfin-ffmpeg.

It's an early MVP. Expect breaking changes until the first release.

## What's in here

One server, and a client for each kind of screen. Every folder has a
README with the details.

- [The server](apps/server) scans libraries, fetches metadata, streams,
  transcodes, and serves the web app, so one process is the whole
  install. Hosting it starts there.
- [The web app](apps/web) is what you get in a browser.
- [The Android app](apps/android) runs on phones, tablets, and Android
  TV, and keeps downloads for watching offline.
- [The Apple apps](apps/ios) are one for iPhone and iPad and one for
  Apple TV. They've only run on simulators so far.
- [The Samsung TV app](apps/tizen) is for Tizen TVs from 2018 on. Nobody
  has tried it on a real TV yet.
- [Brand](brand) has the logo, the app icons, and the scripts that draw
  them.

To work on Matinee, start with [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT, except the Android, Apple, and Flutter apps in `apps/android`,
`apps/ios`, and `apps/flutter`. They ship GPL builds of FFmpeg and mpv, so
they're GPL-3.0. See [LICENSE](LICENSE),
[apps/android/LICENSE](apps/android/LICENSE),
[apps/ios/LICENSE](apps/ios/LICENSE), and
[apps/flutter/LICENSE](apps/flutter/LICENSE).
