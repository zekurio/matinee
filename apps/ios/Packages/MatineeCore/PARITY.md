# Android parity audit

Profile, statistics, actions, errors, state and general preferences are covered
by another agent in `PARITY-profile.md`. Player, Auth, Admin, Home and Requests
implementation remains assigned elsewhere.

## Title

| Behaviour                                                                | Kotlin location                                     | Swift location                                          | Action                                                                                                         |
| ------------------------------------------------------------------------ | --------------------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Resume only unfinished positive progress                                 | ui/title/TitleData.kt                               | Title/TitlePresentation.swift                           | Added helper and tests                                                                                         |
| Season next, watched aggregation, next up                                | ui/title/TitleData.kt                               | Title/TitleData.swift                                   | Existing helpers match; existing tests retained                                                                |
| Trailer language base tag, then first trailer                            | ui/title/TitleParts.kt                              | Title/TitleData.swift                                   | Existing helper matches                                                                                        |
| Hidden specials remain addressable by direct link                        | ui/title/TitleScreens.kt                            | Title/TitlePresentation.swift                           | Added titleSeason                                                                                              |
| Inline one regular season, exclude current season from rail              | ui/title/TitleScreens.kt, TitleParts.kt             | Title/TitlePresentation.swift                           | Added inlineSeason and titleSeasons                                                                            |
| Episode rail initially scrolls to next, else zero                        | ui/title/TitleScreens.kt                            | Title/TitlePresentation.swift                           | Added helper and tests                                                                                         |
| Biography, local credits, catalog credits                                | ui/browse/BrowseScreen.kt                           | Api/ContractModels.swift, Title/TitlePresentation.swift | Added loadPerson; generated Person already carries all fields                                                  |
| Person line, credit sections known-for first, kind counts, credit detail | ui/browse/BrowseScreen.kt, web people.$name.tsx     | Title/PersonPresentation.swift                          | Added helpers and PersonPresentationTests; sections and the kind picker follow the web, Android lists one grid |
| Specials visibility is account-owned and server-applied                  | ui/settings/SettingsData.kt                         | Api/ContractApi.swift                                   | setPreferences exists; session update wiring belongs to Auth owner, no local filtering added                   |
| Catalog gap recovery and live availability                               | ui/title/TitleScreens.kt, ui/browse/BrowseScreen.kt | Requests                                                | Other agent owns request tracking                                                                              |
| File information prefers loaded track languages, falls back to probe     | ui/title/TitleData.kt                               | missing                                                 | Still needs a dedicated track-info loader                                                                      |

## Browse

| Behaviour                                                                   | Kotlin location                   | Swift location                             | Action                                                                                    |
| --------------------------------------------------------------------------- | --------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Five sorts, both directions, usual default                                  | ui/browse/TitleFilters.kt         | Browse/TitleFilters.swift                  | Added structured state alongside legacy API                                               |
| Structured filters and active count                                         | ui/browse/TitleFilters.kt         | Browse/TitleFilters.swift                  | Added state and count; generated filters passed unchanged                                 |
| Page identity includes filters, direction and settled search                | ui/browse/TitleFilters.kt         | Browse/TitleFilters.swift                  | Added JSON identity                                                                       |
| Search debounce, paging, refresh retention                                  | ui/browse/LibraryData.kt, Grid.kt | Browse/LibraryData.swift, TitlePages.swift | Existing tests cover these                                                                |
| Filter chips, each removing only itself, rating chips named with both kinds | ui/browse/TitleFilters.kt         | Browse/TitleFilterChips.swift              | Added `activeTitleFilters` and `TitleFilterChip`, words in the app; TitleFilterChipsTests |
| Sort-dependent card detail (score or runtime before the year)               | ui/browse/TitleFilters.kt         | Browse/TitleFilterChips.swift              | Added `titleCardDetail`; TitleFilterChipsTests                                            |
| Sort menu offers the list's sorts, both ways; current order                 | ui/browse/TitleFilters.kt         | Browse/TitleFilterChips.swift              | Added `offeredTitleOrders`, `currentOrder`, `apply`                                       |
| Empty reason: search, then filters, then none                               | ui/browse/LibraryData.kt          | Browse/TitleFilterChips.swift              | Added `libraryEmpty(TitleListState)`                                                      |
| Genre or studio page sends its own scope first, once                        | ui/browse/LibraryData.kt          | Browse/TitleFilterChips.swift              | Added `browseFilters`                                                                     |
| Kind chips with counts, hidden with one kind                                | web browse/kind-picker.tsx        | Browse/TitleFilterChips.swift              | Added `browseKindChoices`; Android always shows three chips without counts                |

## Search

| Behaviour                                              | Kotlin location         | Swift location          | Action                                                       |
| ------------------------------------------------------ | ----------------------- | ----------------------- | ------------------------------------------------------------ |
| 250ms debounce, limit 40, trimmed query, cancellation  | ui/search/SearchData.kt | Browse/SearchData.swift | Existing implementation and BrowseTests cover this           |
| Same successful query retained, failed query can retry | ui/search/SearchData.kt | Browse/SearchData.swift | Retry uses update with same text rather than attempt counter |
| Empty includes users; grouping preserves server order  | ui/search/SearchData.kt | Browse/SearchData.swift | Existing implementation and tests match                      |

## Favourites

| Behaviour                                            | Kotlin location             | Swift location             | Action                                                                        |
| ---------------------------------------------------- | --------------------------- | -------------------------- | ----------------------------------------------------------------------------- |
| Own favourites limit 200, null means empty           | ui/media/FavoritesData.kt   | Browse/FavoritesData.swift | Added loader                                                                  |
| Shows, seasons, episodes, movies retain server order | ui/media/FavoritesScreen.kt | Browse/FavoritesData.swift | Added filtering with independent season predicate                             |
| Unified Favorite dispatch includes showSeason        | ui/media/FavoritesData.kt   | Browse/FavoritesData.swift | Added four-kind predicate dispatch                                            |
| Live season marks                                    | ui/ViewerState.kt           | Browse/FavoritesData.swift | Added `Favorites.live(viewer)`, seasons by their own mark; FavoritesLiveTests |

## Routes

| Behaviour                                                                                        | Kotlin location | Swift location         | Action                                                       |
| ------------------------------------------------------------------------------------------------ | --------------- | ---------------------- | ------------------------------------------------------------ |
| Typed payloads for library sort, person provider ID, browse scopes, metadata targets and folders | ui/Nav.kt       | Browse/CoreRoute.swift | Added Codable payload enum; existing app navigator unchanged |
| Android -1 unnumbered season / absent metadata target                                            | ui/Nav.kt       | Browse/CoreRoute.swift | Uses optional numbers; 0 still means specials                |
| Catalog, Discover, asked and request list payloads                                               | ui/Nav.kt       | Browse/CoreRoute.swift | Included payloads only; request implementation elsewhere     |

## Format

| Behaviour                                                                                         | Kotlin location              | Swift location                                | Action                                                                 |
| ------------------------------------------------------------------------------------------------- | ---------------------------- | --------------------------------------------- | ---------------------------------------------------------------------- |
| Progress, runtime, clock, rating, decimal bytes, bitrate, codecs, video summary, languages, flags | ui/Format.kt                 | Format/Format.swift                           | Existing arithmetic matches; localized wording remains in app target   |
| Reject invalid calendar day rather than normalize                                                 | ui/Format.kt LocalDate.parse | Format/Format.swift parseDay                  | Fixed and added leap-day / malformed-date tests                        |
| Labels use server label, special / episode / season wording                                       | ui/Format.kt                 | Api/ContractModels.swift; app UI/Format.swift | No file-name inference added; localized wording not duplicated in core |

## Downloads and Metadata small-gap check

| Behaviour                                                              | Kotlin location                | Swift location                      | Action                                                                                                |
| ---------------------------------------------------------------------- | ------------------------------ | ----------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Pending progress per item and offline plays per session                | downloads/PendingProgress.kt   | Downloads/PendingProgress.swift     | Existing persistent queue present; full concurrency audit not completed                               |
| Original range resume, version segments, transfer failure decisions    | downloads/DownloadWorker.kt    | Downloads/DownloadWorker.swift      | Existing native background worker present; full decision comparison not completed                     |
| Offline track selection                                                | ui/player/DownloadTracks.kt    | Player/DownloadTracks.swift         | Owned by Player agent, untouched                                                                      |
| Fix-match query, current provider match, image state/buttons, captions | ui/metadata/MetadataScreens.kt | Metadata/Metadata.swift             | Existing helpers and MetadataTests present                                                            |
| Upload type validation                                                 | ui/metadata/MetadataScreens.kt | Metadata/Metadata.swift checkUpload | Android trusts resolver MIME; Swift sniffs bytes. Native difference retained, server validates upload |

No Android TitleData, TitleFilters or SearchData unit-test files exist in this
checkout. Swift already has direct tests for these areas; no expectations changed.
This remains a partial audit: title file-info loading and full download/metadata
mutation comparisons are not signed off.
