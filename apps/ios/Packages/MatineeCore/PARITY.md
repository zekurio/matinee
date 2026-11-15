# Android parity audit

Profile, statistics, actions, errors, state and general preferences are covered
by another agent in `PARITY-profile.md`. Player, Auth, Admin, Home and Requests
implementation remains assigned elsewhere.

## Title

| Behaviour | Kotlin location | Swift location | Action |
| --- | --- | --- | --- |
| Resume only unfinished positive progress | ui/title/TitleData.kt | Title/TitlePresentation.swift | Added helper and tests |
| Season next, watched aggregation, next up | ui/title/TitleData.kt | Title/TitleData.swift | Existing helpers match; existing tests retained |
| Trailer language base tag, then first trailer | ui/title/TitleParts.kt | Title/TitleData.swift | Existing helper matches |
| Hidden specials remain addressable by direct link | ui/title/TitleScreens.kt | Title/TitlePresentation.swift | Added titleSeason |
| Inline one regular season, exclude current season from rail | ui/title/TitleScreens.kt, TitleParts.kt | Title/TitlePresentation.swift | Added inlineSeason and titleSeasons |
| Episode rail initially scrolls to next, else zero | ui/title/TitleScreens.kt | Title/TitlePresentation.swift | Added helper and tests |
| Biography, local credits, catalog credits | ui/browse/BrowseScreen.kt | Api/ContractModels.swift, Title/TitlePresentation.swift | Added loadPerson; generated Person already carries all fields |
| Specials visibility is account-owned and server-applied | ui/settings/SettingsData.kt | Api/ContractApi.swift | setPreferences exists; session update wiring belongs to Auth owner, no local filtering added |
| Catalog gap recovery and live availability | ui/title/TitleScreens.kt, ui/browse/BrowseScreen.kt | Requests | Other agent owns request tracking |
| File information prefers loaded track languages, falls back to probe | ui/title/TitleData.kt | missing | Still needs a dedicated track-info loader |

## Browse

| Behaviour | Kotlin location | Swift location | Action |
| --- | --- | --- | --- |
| Five sorts, both directions, usual default | ui/browse/TitleFilters.kt | Browse/TitleFilters.swift | Added structured state alongside legacy API |
| Structured filters and active count | ui/browse/TitleFilters.kt | Browse/TitleFilters.swift | Added state and count; generated filters passed unchanged |
| Page identity includes filters, direction and settled search | ui/browse/TitleFilters.kt | Browse/TitleFilters.swift | Added JSON identity |
| Search debounce, paging, refresh retention | ui/browse/LibraryData.kt, Grid.kt | Browse/LibraryData.swift, TitlePages.swift | Existing tests cover these |
| Filter chips, sort-dependent card details | ui/browse/TitleFilters.kt | missing | Presentation helpers still needed |

## Search

| Behaviour | Kotlin location | Swift location | Action |
| --- | --- | --- | --- |
| 250ms debounce, limit 40, trimmed query, cancellation | ui/search/SearchData.kt | Browse/SearchData.swift | Existing implementation and BrowseTests cover this |
| Same successful query retained, failed query can retry | ui/search/SearchData.kt | Browse/SearchData.swift | Retry uses update with same text rather than attempt counter |
| Empty includes users; grouping preserves server order | ui/search/SearchData.kt | Browse/SearchData.swift | Existing implementation and tests match |

## Remaining owned checks

Favourites, Format, routes, Downloads and Metadata comparisons are not yet complete.
No Android TitleData, TitleFilters or SearchData unit-test files exist in this
checkout. Swift already has direct tests for these areas; no expectations changed.
