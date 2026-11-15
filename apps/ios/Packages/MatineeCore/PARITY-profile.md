# Profile parity progress

Profile loaders, card actions, and error state policy are implemented. Profile rail
favorite filtering and the preferences inventory remain open for a later run.
No generated API files or old screen entry points changed.

## Profile and statistics

| Behaviour                                              | Kotlin location                    | Swift location                  | Work                                                      |
| ------------------------------------------------------ | ---------------------------------- | ------------------------------- | --------------------------------------------------------- |
| Per-account profile and per-range stats cache          | `profile/ProfileSnapshot.kt`       | `Profile/ProfileSnapshot.swift` | Already present                                           |
| Chart scale, bars, bucket labels, standings, activity  | `profile/StatsData.kt`, `Stats.kt` | `Profile/Stats.swift`           | Already present; no arithmetic changed                    |
| Range starts at all; last figures stay while switching | `profile/ProfileData.kt`           | `Profile/ProfileData.swift`     | Added observable `ProfileStats`                           |
| Offline range reads only its own saved answer          | `profile/ProfileData.kt`           | `Profile/ProfileData.swift`     | Added `showSaved`; missing range is disconnected          |
| Profile cache loader                                   | `profile/ProfileScreen.kt`         | `Profile/ProfileData.swift`     | Added factory; caller configures fetch and resume refresh |
| Recent page limit 100                                  | `profile/RecentScreen.kt`          | `Profile/ProfileData.swift`     | Added loader                                              |
| Full favorites uses profiles.favorites                 | Favorites page                     | `Profile/ProfileData.swift`     | Added loader returning contract `Favorites`               |
| Tagged profile rail favorites and viewer overrides     | `profile/ProfileScreen.kt`         | missing                         | Not ported; `Favorite` already generated                  |
| Leaderboard fetch with range and zone                  | `profile/StatsData.kt`             | `Profile/ProfileData.swift`     | Added loader                                              |
| My requests                                            | `profile/ProfileScreen.kt`         | separate Requests area          | Left to other agent; attaches beside profile data         |

`profiles.favorites` currently returns grouped `Favorites` lists. The profile
rail's `Profile.favorites` is the tagged `Favorite` union. Neither contract shape
was changed. Resume refresh remains the screen's responsibility, using existing
`Loader.refreshIfStale` and viewer version observation.

## Card actions

| Behaviour                                     | Kotlin location           | Swift location                                           | Work                                                      |
| --------------------------------------------- | ------------------------- | -------------------------------------------------------- | --------------------------------------------------------- |
| Item/title/season menu and own-page omissions | `components/Actions.kt`   | `Actions/CardActions.swift`                              | Added `cardActions`                                       |
| Watched/favorite mutations and rollback       | `components/Actions.kt`   | Actions, `State/ViewerState.swift`                       | Uses shared marks; added season favorite marks            |
| Play and start-over                           | `components/Actions.kt`   | Actions                                                  | Returns item/position command; title resolves server next |
| Download and remove downloaded file           | `components/Actions.kt`   | Actions                                                  | Permission/device gates; returns platform command         |
| Refresh, fix match, images                    | `components/Actions.kt`   | Actions                                                  | Provider/admin/device gates; refresh updates viewer       |
| Watched-at choices and day conversion         | `components/WatchedAt.kt` | existing `Format/WatchedAt.swift`, `WatchedAt` constants | Reused; caller asks before marking                        |

Navigation, sheets, and removing local downloads return typed effects for the
platform owner rather than importing UI or Downloads services. `.updated` asks
the screen to reload; viewer marks are already reconciled. Refresh failures do
not invalidate viewer state. Removal means a downloaded copy, not library media.
Android has no library-media deletion action here.

Recommendation dismissal in the optional `recommended` title context is not
ported in this run; it belongs with recommendation row state and remains open.
The title-play lookup of `titles.get.next`, season count watched predicate, and
image target selection are copied from Android, not new server policy.

## Error classification and load state

| Behaviour                          | Kotlin location        | Swift location               | Work                                                            |
| ---------------------------------- | ---------------------- | ---------------------------- | --------------------------------------------------------------- |
| Stale/cached load and cancellation | `ui/State.kt`          | `State/Load.swift`           | Existing code unchanged                                         |
| Retry and Home context policy      | `components/Errors.kt` | `State/PageErrorState.swift` | Added page/section/tab/offline/player gates                     |
| Disconnected display               | `components/Errors.kt` | `State/PageErrorState.swift` | Exposes disconnected; no network internals in message           |
| HTTP categories                    | HTTP status            | `State/PageErrorState.swift` | Diagnostic signed-out/forbidden/not-found/server/rejected kinds |

Android does not offer sign-in-again in Errors.kt. HTTP categories deliberately
share retry/Home policy; no automatic sign-in action was invented. Cancellation
returns no visible error. Screens localize non-server failure descriptions via
the existing `Failure` helper. Retry remains present but disabled while retrying.

## Preferences

| Behaviour                                   | Kotlin location                   | Swift location            | Work                                         |
| ------------------------------------------- | --------------------------------- | ------------------------- | -------------------------------------------- |
| Account playback preference save            | `settings/SettingsData.kt`        | existing auth/player APIs | Not changed; player owned by another agent   |
| Specials save updates session and viewer    | `settings/SettingsData.kt`        | missing helper            | Not ported                                   |
| Language choices come from playback options | `settings/SettingsData.kt`        | not audited               | Not ported                                   |
| Theme system/light/dark and Material You    | `theme/ThemeStore.kt`             | not audited               | Not ported; Material You is Android-specific |
| Download and home stored preferences        | downloads, `home/HomeSections.kt` | not audited               | Not ported                                   |

The key/type/default inventory and player preference comparison remain undone.

## Android test comparison

| Android test                  | Swift port                                      | Same cases?                                                                                                           |
| ----------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `ui/LoadTest.kt`              | `LoadTest.swift`                                | All 10 named cases already present; Swift also tests cancellation and unreadable answers                              |
| `ui/MarksTest.kt`             | `MarksTest.swift`                               | All 9 named cases already present                                                                                     |
| `ui/home/HomeSectionsTest.kt` | `HomeSectionsTest.swift`                        | Exists; not audited here, Home belongs to another agent                                                               |
| Profile/statistics            | No corresponding Android test file found        | Existing `StatsTests.swift`; added `ProfileDataTests.swift` for range retention and offline saved/missing/null ranges |
| Actions/preferences           | No dedicated test file found in filename search | Full suite inventory not completed                                                                                    |

No existing tests were removed or had their expectations changed.
`CardActionsTests.swift` adds four tests: own-page/resume/removal policy,
season/admin/device policy, account/device download gates, and fake-transport
favorite/watched success plus favorite rollback. Fake endpoints reject wrong
paths and methods. Refresh and title-next lookup execution are not yet covered
by fake-response tests. `PageErrorStateTests.swift` adds three tests covering
HTTP categories, network/parsing/cancellation, and contextual error actions.

No new
client-side media decisions were introduced. The existing chart arithmetic is
presentation arithmetic. No server-boundary issue was identified in the code
ported here.
