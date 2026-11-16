# mpv first-load investigation

Tested on a dedicated `matinee-mpv-iphone` iPhone 17 simulator, iOS 27.2,
against the existing localhost:18420 fixture. No server changes or fixture
file changes. Only this simulator was rebooted. It was deleted afterward.

## First-source failures

`-player.firstURL` substitutes the URL only on the first mpv load. The core
still receives the server's real direct plan, marks direct failed, and asks
`playback.start` again. The next source is the server's remux, not a
client-constructed alternative. Tested with The Matrix Alternate, 640x360.
A separate temporary HTTP server on 127.0.0.1:18421 supplied the failures.

| First response                                                       | Observed mpv result                                | Time from engine load to failure | Next source after fix                          |
| -------------------------------------------------------------------- | -------------------------------------------------- | -------------------------------- | ---------------------------------------------- |
| HTTP 404                                                             | `loadFailed(-13, "loading failed")`                | 0.026 s                          | remux, playing by first 1 s sample             |
| No headers or response for 90 s                                      | No native failure before adapter deadline          | 20.02 s                          | remux requested at 20.05 s, playing at 21.15 s |
| HTTP 200, `not media` bytes                                          | `loadFailed(-17, "unrecognized file format")`      | 0.031 s                          | remux, playing by first 1 s sample             |
| MP4 with video sample entry `avc1` replaced by `zzzz`, audio removed | `loadFailed(-16, "no audio or video data played")` | 0.055 s                          | remux, playing by first 1 s sample             |

These are app runs, not fake-engine results. Each remux advanced position
and sample-build counts over successive seconds; screenshots captured the
fixture's colored pattern and advancing timecode. The fourth case exercises
an unrecognized codec in a valid container, not every possible decoder
failure after opening. No physical device was used.

### Fault fixed

Before the change, the no-response run reached `load timeout` after 20 s
and never requested remux. The adapter threw `URLError(.timedOut)` for its
entire readiness deadline. Core's `serverOutOfReach` intentionally treats
URL timeouts as server outages and stops without blaming a source.

The adapter's deadline also covers demux, decoder and surface setup, so it
cannot establish a network outage. It now throws `MPVLoadError.readinessTimedOut`,
which allows the normal server-directed fallback. Repeating the no-response
run then played remux. The engine package test checks this error against
Core's real outage classifier. The shared engine fixes tvOS too; no TV
screen change is needed. This does not change classification of real URL
network errors or the shared post-load stall policy.

Example from the successful no-response recheck, seconds since epoch:

```text
1794869317.3232331 load timeout
1794869317.3542829 load method=remux
1794869317.447297 state=loading position=0.0 ready=false samples=0
1794869318.452923 state=playing position=0.7000000000000002 ready=true samples=2
1794869319.470632 state=playing position=1.6 ready=true samples=14
1794869320.483173 state=playing position=2.6 ready=true samples=23
```

## Cold launches

32 scripted terminate/launch cycles went directly to `player/<id>?start=0`
with mpv. Files rotated between Breaking Bad S01E03, The Matrix main file
and The Matrix Alternate. Run 0 uninstalled and reinstalled the ad-hoc-signed
app first. Run 16 shut down and booted only this simulator. Each run waited
for three one-second `playing` samples with advancing position and sample
counts, with a 30 s outer limit. All 32 passed. None logged a failed load
or readiness timeout. Launch-to-third-sample times were 5.12 to 17.61 s,
including app startup, sign-in and route presentation, not just mpv loading.

The historical all-sources cold-start failure remains unreproduced and its
cause unknown. No claim that the deadline fix explains that event.

Code review of candidates:

- Engine not ready for `loadfile`: MPVPlayer constructs MPVSession in init;
  session load work is serialized, retained as a pending source, and creates
  its handle when absent. The load is not simply dropped before native init.
- Surface not attached: MPVUI discovers tracks before requiring the video
  surface and defers video startup. The screen publishes the controller
  before awaiting start, allowing the surface to mount while load yields.
  This rules out a synchronous wait blocking SwiftUI, but not a slow or
  failed OS surface attachment on hardware.
- Audio session: Core enables Now Playing before engine load. Session
  activation errors pause the controller, rather than becoming failures for
  every source. Hardware route or interruption behavior was not exercised.
- Cold-start deadline: the 20 s deadline starts inside engine load, after
  the server response, not during initial library/sign-in loading. It can
  still expire on slow native setup. Its previous _outage classification_
  was demonstrably wrong and is fixed; there is no evidence to justify
  increasing it or attributing the historical incident to it.
- Old failure carried into later sources: MPVPlayer.load synchronously resets
  state, readiness and generation. Snapshot delivery ignores old generations;
  MPVUI also filters displaced playlist entry end events. The adapter checks
  cancellation and generation while waiting. No concrete stale-failure fault
  was found to patch.
- Engine-wide failure blamed on each method: a persistent native renderer or
  decoder initialization error can still exhaust the server's methods. No
  typed engine-wide recovery rule or actual occurrence was established.
  Automatically recreating the engine without evidence would hide the cause.

The fallback item can be closed for these simulator first-load failures.
The cold-start item cannot be called fixed. Physical iPhone/iPad and Apple
TV testing still needs real audio routes, hardware decode, HDR and render
startup under device memory pressure.

## Repeating the test

Use the DEBUG-only `-player.firstURL URL` and `-player.trace YES` arguments
in the UI README. Trace output is `tmp/mpv-trace.txt` in the simulator app
data container, found using `xcrun simctl get_app_container <device>
io.github.zekurio.matinee data`. Re-query that path after installing; it can
change. Delete the trace between launches. Neither URLs nor headers are
written to it. Release builds have neither hook.

Do not corrupt the shared fixture or change its server. Use a separate local
HTTP responder for 404, a delayed response and invalid bytes. The unknown
codec case was made by copying only two seconds of video from Toy Story to
a temporary MP4 with ffmpeg, dropping audio, then replacing the sample-entry
fourcc in that copy. Stop the temporary responder afterward.
