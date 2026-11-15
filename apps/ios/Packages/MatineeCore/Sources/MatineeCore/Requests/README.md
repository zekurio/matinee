# Requests logic port status

This is a partial port, not ready to build all request screens on.

## Available

- `RequestData`: catalog detail, related rails, related titles, Discover rails and pages, browse options and pages, catalog search, library show gaps, My requests and admin queue fetches. These are stateless fetches for the existing `Loader` type, not complete paging controllers.
- `RequestAvailabilityState`: observable availability overlay from one `requests.live` stream. Deduplicates inputs and caps them at 100. The app owns cancellation and reconnection. Season snapshots are available in `titles[ref].seasons`.
- `RequestActions`: ask, add seasons, cancel, follow, unfollow, admin approve and decline. Throws the transport error; no optimistic state or local permission inference.
- `RequestView.swift`: state words, actions, blocked reasons, decline answers, release dates, chooser labels/defaults, season ordering and episode details, askable results.
- `RequestNoticeSettings`, `newRequestNotices`, `requestNoticeTarget`: settings values, fresh unseen notifications and IDs to mark read, navigation targets. Persist settings and seen IDs per server and account. Call after fetching notification pages when foregrounded or in an app-owned background task; present fresh results then mark all returned IDs read. The freshness window is Android's three days. No scheduling, permission prompts or notification delivery is implemented.

## Page attachment

Catalog detail uses title and related fetches. Search uses search and Discover. Browse uses browseOptions/browse. Library show detail composes gaps. Home and profile compose mine. Admin profile composes queue. Every visible collection must supply its refs to the availability overlay and render the overlay instead of the fetched availability.

## Sources and omissions

View values derive from RequestView.kt; fetches correspond to CatalogScreen.kt, Browse.kt, Discover.kt, Related.kt, ShowGaps.kt, Asked.kt and Admin.kt. Mutations correspond to Ask.kt and RequestsHub.kt. Notices derive from Notices.kt and NoticeSettings.kt. Compose drawing, Android notification posting and scheduling are intentionally absent.

Still missing: person's catalog credits; paging controllers and merging; automatic live stream restart and reference rebatching; automatic reload of My requests/queue/gaps after changes; show-gap retry/recovery; request sheet destination and quota flow; admin waiting-request lookup and delayed undo of decisions; request undo timing; recommendation dismissal; badge/card-line values and complete resource-key comments; full RequestViewTest.kt parity; fake-transport loader/action tests. These are omissions, not behavior intentionally removed from the feature. Existing tests only cover a subset of view values, live overlay replacement and notices.

The client computes season ordering, chooser defaults, freshness and date-based release wording just as Android does. No contract or generator changes were made.

## Checks

- swift build passed.
- swift test passed 264 tests before adding the opt-in live test. The live test subsequently compiled and passed on its own.
- Full frozen install plus pnpm verify passed.
- tvOS xcodebuild was attempted twice, each timing out at 200 seconds. No successful tvOS build is claimed.
- Live admin fixture: mine encoded to 30 bytes, queue to 140 bytes; Discover returned enabled=false, rails=[], browse=[]; Dune catalog search returned zero results. This exercises transport/decoding only, not a functioning metadata fixture or request state transitions.
