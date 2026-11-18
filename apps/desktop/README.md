# Matinee for the desktop

A desktop app for Linux on Wayland, macOS, and Windows. It shows the server's own web
app in a window and plays with [mpv](https://mpv.io), so it plays every
container and codec mpv does, picks any audio track inside a file, and
draws subtitles with libass. The server sends most files as they are.

It's a native shell (`native/`, C++ with Qt 6) around web pages. Qt
WebEngine shows the pages, and libmpv puts the picture underneath them, so
the video shows wherever a page is transparent. The player's controls,
menus, and everything else are the web app's.

On Wayland, and on macOS with the app's own build of libmpv, HDR video
reaches the display as HDR. Elsewhere mpv tone maps it to SDR.
[The window](#the-window) says why.

Linux is the system it's built and tried on, and there it needs a Wayland
session: X11 has no HDR and no way to put the video under the window.
On macOS it builds and plays on GitHub's runners, which are virtual Macs
without HDR. Nobody has tried it on a Mac of their own yet. The Windows
build hasn't been run by anyone yet.

## Install

On NixOS, or anywhere with Nix:

```sh
nix run github:zekurio/matinee#matinee-desktop
```

or add `matinee.packages.${system}.matinee-desktop` to your packages.
There are no installers for Windows yet. Build it as below.

### macOS

There is no signed release yet. Each run of the `desktop (macos)`
workflow builds the app for Macs with Apple's chip and keeps it for 14
days as `Matinee-macos-arm64.zip`. Download it from the run's page on
GitHub, under Artifacts, or the newest one with `gh`:

```sh
run=$(gh run list --repo zekurio/matinee --workflow 'desktop (macos)' \
  --status success --limit 1 --json databaseId --jq '.[0].databaseId')
gh run download "$run" --repo zekurio/matinee -n Matinee-macos-arm64.zip
```

It needs the macOS the runner had, macOS 26 for now, because Homebrew
builds the libraries inside it for that. An older macOS says so when you
open it.

No developer signed it, so macOS won't open it the first time. Move it
to Applications and take off the mark the download left on it:

```sh
xattr -dr com.apple.quarantine /Applications/Matinee.app
```

Or open it once, then choose Open Anyway in System Settings → Privacy &
Security.

## Use

The first start asks for a server. Type its address, or pick one found on
the local network. Then sign in one of two ways:

- **With the browser.** Your browser opens the server's page, where
  passkeys and single sign-on work as usual, and you approve the app.
- **With a code.** The app shows a code to enter at the server's `/link`
  on any device. For a PC at the TV with no keyboard.

The app keeps a session of its own for each server, listed under
Settings → Account like any other device. The token goes into the
system's keychain. On a Linux session without one, as on a bare window
manager, it goes into a file only you can read,
`~/.local/share/matinee-desktop/tokens.json`.

| Where             | What                                                   |
| ----------------- | ------------------------------------------------------ |
| Account menu      | Switch server, Quit                                    |
| Settings          | Desktop app: decoding, audio output, passthrough, size |
| F11               | Full screen                                            |
| Ctrl+Shift+S      | The server list, from any page                         |
| `--fullscreen`    | Open full screen                                       |
| `MATINEE_WEB_APP` | A web app to show in place of each server's own        |
| `--verbose`       | Log what mpv and the pages say, for a bug report       |

Media keys and the desktop's media controls work through MPRIS on Linux.
The screen stays on while a video plays.

mpv reads `mpv.conf` from `~/.config/matinee-desktop/mpv/`, with its
scripts and shaders, as it does from `~/.config/mpv`. The app sets what it
depends on after that file, so it can't turn off the picture or the
controls. Files the web app offers to save go to your downloads folder.

## How it's put together

| Part                                                       | What it is                                          |
| ---------------------------------------------------------- | --------------------------------------------------- |
| `native/`                                                  | The shell: window, mpv, sign-in, system integration |
| `src/`                                                     | The app's own pages: servers and sign-in            |
| [`packages/desktop-bridge`](../../packages/desktop-bridge) | What pages and shell say to each other              |
| [`apps/web`](../web)                                       | The server's web app, with an mpv player for here   |

The shell shows two kinds of pages. Its own, built into the program and
served at `matinee-shell://app/`, pick a server and sign in. The server's
web app loads from the server, so it's always the server's version.

Both talk to the shell through `window.matineeDesktop`, which the shell
puts on every page. `packages/desktop-bridge/src/protocol.ts` describes
it: the methods a page calls, the events it gets, and which kind of page
may use which. The web app may drive the player but never sees a token or
the server list. The app's own pages may sign in but never see a token
either. The shell adds the session's token to the requests the web app
makes to its server, and to mpv's, and to nothing else. mpv only opens
addresses on the server the app is connected to.

The web app and the shell come in different versions, since one is the
server's and the other is installed. The protocol has a number for
changes an older side can't read. A web app that finds a shell too old
for it plays in the web view like a browser and asks for an update, and a
shell that loads an older server's web app is a browser for it.

mpv decides what the player's state is. The shell mirrors mpv's
properties to the page (`PlayerState`), and the page's `MpvMedia`
(`apps/web/src/components/mpv-media.ts`) turns them into the properties
and events the web player already read from a `<video>`. The server decides what plays, as
for every client: the page sends a device profile that says mpv plays
everything, and loads what `playback.start` answers.

### The window

The video gets under the page in one of two ways (`VideoOutput`), picked
once at start.

**Under the window**, on Wayland and macOS. mpv makes a surface of its own, a
subsurface below the window's, and presents on it through Vulkan with
`vo=gpu-next`, exactly as in a window of its own. The window is
transparent where the video shows, and the compositor puts the two
together. Since mpv owns the surface, everything that needs one works:
its own frame timing, and HDR. An HDR source goes out as HDR10 with its
own metadata, and the compositor fits it to the display.

Upstream mpv can't do this: it only presents in a window it made, on its
own connection to the compositor. `mpv/wayland-parent-surface.patch`
adds an option, `--wayland-parent-surface`, that has it use the
application's connection, with an event queue of its own, and make its
surface a subsurface of the application's. The flake builds libmpv with
it. The app asks mpv whether it has the option, and with a stock libmpv
it falls back to the second way.

On macOS the window's content is Qt's view, which Qt draws with Metal
into a layer with an alpha channel. `MacVideoLayer` keeps a layer of its
own right below that one, in the layer of the window's frame view. mpv
adds its Metal layer to it and presents through Vulkan on MoltenVK, and
the system puts the layers together. An HDR video stays HDR under an SDR
page. Upstream mpv on macOS only presents in a window it made, so
`mpv/macos-parent-layer.patch` adds `--macos-parent-layer`, which takes
the app's layer. The workflow builds libmpv with it
(`tools/ci/mpv-macos.mjs`). With Homebrew's mpv the app falls back to
the second way.

**In the window**, everywhere else. Qt Quick draws the window with
OpenGL, and each frame, after Qt clears the window, `MpvRenderer` has mpv
draw the video straight into the window's framebuffer through its render
API, before Qt draws the web view over it. Nothing is copied. An OpenGL
window is SDR, so mpv tone maps HDR here.

A few things are easy to break:

- Qt WebEngine draws the web view as opaque once a page has had a
  background of its own, so `Main.qml` sets the view's background color
  anew each time a video has its first frame. Without that the page stays
  black over the video.
- In the window, mpv draws at the far plane and assumes a fresh OpenGL
  context, so `MpvRenderer` resets the state Qt left before each frame,
  or the depth test discards the whole picture.
- Under the window, the compositor acts on a new subsurface when the
  window next commits, so `WaylandVideoSurface` has the window draw once
  mpv has set its output up. And the window's surface can go away while
  the app runs, which stops playback: mpv without a parent would open a
  window of its own.
- On macOS the system orders the window's layers and may build them
  anew, so `MacVideoLayer` checks its place after each frame the window
  draws. It has to be a layer and not a view: with a view of the app's in
  the window's frame view, macOS 26 lays the title bar out the old way,
  with the title over the buttons.
- mpv on macOS opens and closes its video output on the main thread and
  waits for it. Ending mpv from the main thread while it has one would
  wait forever, so before the app quits it stops playback and runs the
  main thread until mpv's layer is gone.

### HDR

On Wayland it needs a compositor with the color management protocol and
a display in HDR mode. On Hyprland with its defaults (`render:cm_auto_hdr = 1`), the
display switches to HDR while the app is full screen with an HDR video,
and back after. In a window it stays in SDR, and the compositor tone
maps, unless the monitor is set to HDR all the time (`cm, hdr`).

By default mpv sends the source's own colors and metadata
(`target-colorspace-hint-mode=source`), since a compositor that switches
on demand reports an SDR display until something HDR shows. With the
monitor always in HDR, `target-colorspace-hint-mode=target` in `mpv.conf`
has mpv fit the picture to the display itself.

To check that the display got HDR, run `drm_info` while a video plays.
It lists the connector's `Colorspace` and `HDR_OUTPUT_METADATA`.

On macOS it needs a screen that can show HDR: the built-in screen of a
MacBook Pro from 2021 or later, a Pro Display XDR, or an external HDR
display with High Dynamic Range turned on in System Settings → Displays.
macOS shows HDR per window, so there's nothing to switch for the app.
To check, start it from a terminal and play an HDR title:

```sh
/Applications/Matinee.app/Contents/MacOS/Matinee --verbose 2>&1 | grep 'Metal layer'
```

When the picture goes out as HDR, mpv logs
`Metal layer colorspace changed: ITUR_2100_PQ` and
`Metal layer HDR active`. An SDR title logs `ITUR_709` instead. The
highlights of an HDR title should look brighter than the page's white.

## Build

The flake's `desktop` shell has CMake, Qt, and libmpv. The recipes enter
it for you.

| Recipe                        | What it does                                           |
| ----------------------------- | ------------------------------------------------------ |
| `just desktop build`          | Builds the pages, then the program in `native/build`   |
| `just desktop run`            | Builds and runs it. Arguments go to the app            |
| `just desktop smoke`          | Runs it against a stand-in server and plays a clip     |
| `just desktop pages`          | Serves the app's own pages on :5174, without the shell |
| `nix build .#matinee-desktop` | Builds the package                                     |

By hand:

```sh
nix develop .#desktop
pnpm install
pnpm --filter @matinee/desktop build        # the pages, into apps/desktop/dist
cmake -S apps/desktop/native -B build -G Ninja
cmake --build build
build/matinee-desktop --verbose
```

Without Nix you need CMake 3.24, a C++20 compiler, Qt 6.8 or newer with
Qt WebEngine and Qt WebChannel, and libmpv 0.38 or newer, built with
the patch in `mpv/` for HDR on Wayland or macOS. On Linux, also
Wayland's client library, `wayland-protocols`, `wayland-scanner`, and
QtKeychain. CMake finds mpv through pkg-config, or in `-DMPV_ROOT=` where
there is none, and builds QtKeychain itself where the system has none.
`.github/workflows/desktop-macos.yml` and `desktop-windows.yml` are the
recipes for those two.

To work on the web app's side, run the server and `pnpm dev` as usual and
connect the app to `localhost:5173`. To try a web app against a server
that doesn't have it yet, like a deployed one, point the dev server at it
and tell the app to show the dev server's pages:

```sh
VITE_SERVER_URL=https://watch.example.com pnpm dev:web
MATINEE_WEB_APP=http://localhost:5173 just desktop run
```

The app signs in to the server and plays from it as always, and loads
the pages from `MATINEE_WEB_APP`, which passes their requests on. `QTWEBENGINE_REMOTE_DEBUGGING=9222`
opens the pages to Chrome's DevTools at `localhost:9222`.

`just desktop smoke` runs the app against a stand-in for a server
(`smoke/`) and checks the shell's part: the page gets the session's
token, the bridge answers and refuses what it should, and mpv plays,
pauses, and seeks a clip. With `SMOKE_SCREENSHOT` set to a screenshot
command, it also takes a picture while the clip plays, to check by eye
that the page shows over the video.

`just desktop pages` runs the app's own pages in a browser against a
stand-in for the shell (`src/dev/mock-shell.ts`). A panel in the corner
switches the state the shell reports and ends a sign-in each way it can
end. What you type decides the answer: an address starting with `offline`
is unreachable, `router` isn't Matinee, and `flaky` can't start a
sign-in. The pages are in English and German, in `src/i18n`.

A change to the bridge has three places: `protocol.ts`, the shell's
handlers in `native/src/app/application.cpp`, and the page that calls it.

## Not built yet

- Installers for macOS and Windows, and an AppImage or Flatpak for Linux.
- The system's media controls on macOS and Windows. Media keys work
  there while the window has the keyboard.
- HDR on Windows, where the video is drawn in the window. mpv's newer
  Direct3D 11 render API may make it possible there.
- A signed and notarized app for macOS, and one for Intel Macs.
- A list of downloads. Files save to the downloads folder without one.
- Signing in to a server whose certificate the system doesn't trust.

## License

GPL-3.0, because it links mpv, whose builds are GPL. See
[LICENSE](LICENSE).
