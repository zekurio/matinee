# Android parity audit

This is a partial audit, not a sign-off on browsing parity. Compared against the
Android sources in this checkout and reviewed the last 40 relevant origin/main
commits. Unreviewed areas below still need an audit before screen replacement.

## Browse

| Behaviour                                                                         | Kotlin location           | Swift location                                               | Action                                  |
| --------------------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------ | --------------------------------------- |
| All five sorts in both directions, default ascending name and descending others   | ui/browse/TitleFilters.kt | Browse/LibraryData.swift only has three legacy sorts         | Add TitleListState alongside legacy API |
| Structured genre, studio, year, score, age, language, runtime and watched filters | ui/browse/TitleFilters.kt | Generated TitleFilters exists; observable list state missing | Add structured state and active count   |
| Stable page identity includes filters, direction and settled search               | ui/browse/TitleFilters.kt | Legacy LibraryFilters.key omits new fields                   | Add structured key                      |
| Search debounce and explicit settlement                                           | ui/browse/TitleFilters.kt | Browse/LibraryData.swift                                     | Reuse existing implementation           |

## Title

| Behaviour                                                                | Kotlin location          | Swift location        | Action                                                             |
| ------------------------------------------------------------------------ | ------------------------ | --------------------- | ------------------------------------------------------------------ |
| Season next episode, watched aggregation, multilingual trailer selection | ui/title/TitleData.kt    | Title/TitleData.swift | Existing helpers and tests present; full screen comparison pending |
| Person biography, credits, specials preference                           | ui/title/TitleScreens.kt | Not audited           | Pending                                                            |

## Remaining audit

| Area                                          | Kotlin location                               | Swift location                          | Action                                                                             |
| --------------------------------------------- | --------------------------------------------- | --------------------------------------- | ---------------------------------------------------------------------------------- |
| Search                                        | ui/search/SearchData.kt                       | Browse/SearchData.swift                 | Pending detailed comparison                                                        |
| Favourites and unified season presentation    | ui/media/FavoritesData.kt, FavoritesScreen.kt | State/ViewerState.swift                 | Pending detailed comparison                                                        |
| Profile, stats, recent                        | ui/profile                                    | Profile                                 | Pending detailed comparison                                                        |
| Card actions                                  | ui/components/Actions.kt                      | State/ViewerState.swift                 | Pending detailed comparison                                                        |
| Error classification                          | ui/components/Errors.kt, ui/State.kt          | State/Load.swift                        | Existing disconnect classification present; presentation policy comparison pending |
| Metadata                                      | ui/metadata/MetadataScreens.kt                | Metadata/Metadata.swift                 | Pending; no changes                                                                |
| Routes and marks                              | ui/Nav.kt, ui/Marks.kt                        | State/Marks.swift; routes in app target | Pending; no changes                                                                |
| Downloads and offline decisions               | downloads, ui/player/DownloadTracks.kt        | Downloads, Player/DownloadTracks.swift  | Pending; no changes                                                                |
| Preferences and formatting                    | ui/settings/SettingsData.kt, ui/Format.kt     | Player/PlayerPrefs.swift, Format        | Pending; no changes                                                                |
| Player, authentication, admin, home, requests | Corresponding Android areas                   | Corresponding Swift areas               | Excluded from implementation by assignment                                         |

## Tests

BrowseTests and TitleDataTests were read before implementation. BrowseTests already
covers paging, debounce, cancellation, empty states and retry. TitleDataTests covers
season selection, watched aggregation, trailers and download sheets. Android has
no TitleFilters test file. Add direct Swift coverage for structured filter counts,
order defaults and page identity. No existing expectations changed.

The per-file Android unit-test inventory and case comparison are still pending.
