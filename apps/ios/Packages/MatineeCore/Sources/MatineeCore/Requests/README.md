# Requests logic port status

This is a partial port, not ready to build all request screens on.

## Available

- `RequestData`: catalog detail, related rails, related titles, Discover rails and pages, browse options and pages, catalog search, library show gaps, My requests and admin queue fetches. These are stateless fetches for the existing `Loader` type, not complete paging controllers.
- `RequestLiveController`: owns visibility-driven cancellation and reconnection. Calls a supplied reload callback on snapshots and disconnections so composed non-streamed structures can refresh. `RequestAvailabilityState` remains the underlying overlay; season snapshots are in `titles[ref].seasons`.
- `RequestPages<Item>`: observable paging with first-occurrence deduplication, cursor retry, generation-safe reset and stale accumulation. `browseBatch`, `railBatch` and `searchBatch` adapt the corresponding fetches. Browse batches preserve server filters, sort, vote floor and detail. Change the configure key when query, filters, sort or rail change.
- `RequestChooser`: season selection and future-season defaults; `RequestAskFlow`: busy/error state, notification-permission intent and six-second first-ask undo window. This is not yet the complete destination/quota flow.
- `RequestActions`: ask, add seasons, cancel, follow, unfollow, admin approve and decline. Throws the transport error; no optimistic state or local permission inference.
- `RequestView.swift`: state words, actions, blocked reasons, decline answers, release dates, chooser labels/defaults, season ordering and episode details, askable results.
- `RequestNoticeSettings`, `newRequestNotices`, `requestNoticeTarget`: settings values, fresh unseen notifications and IDs to mark read, navigation targets. Persist settings and seen IDs per server and account. Call after fetching notification pages when foregrounded or in an app-owned background task; present fresh results then mark all returned IDs read. The freshness window is Android's three days. No scheduling, permission prompts or notification delivery is implemented.

## Page attachment

Catalog detail uses title and related fetches. Search uses search and Discover. Browse uses browseOptions/browse. Library show detail composes gaps. Home and profile compose mine. Admin profile composes queue. Every visible collection must supply its refs to the availability overlay and render the overlay instead of the fetched availability.

## Sources and omissions

View values derive from RequestView.kt; fetches correspond to CatalogScreen.kt, Browse.kt, Discover.kt, Related.kt, ShowGaps.kt, Asked.kt and Admin.kt. Mutations correspond to Ask.kt and RequestsHub.kt. Notices derive from Notices.kt and NoticeSettings.kt. Compose drawing, Android notification posting and scheduling are intentionally absent.

Still missing: person's catalog credits; complete destination and quota flow; automatic page-specific wiring for My requests/queue/gaps reload callbacks; show-gap retry/recovery; admin waiting-request lookup and delayed undo of decisions; recommendation dismissal; complete resource-key comments; success-payload and request-body fake-transport loader/action tests and ask/undo timing integration tests. Badge/card-line values and Android RequestViewTest cases are now covered. Paging, chooser and reconnect controllers have focused tests, but do not yet constitute the full requested port.

The client computes season ordering, chooser defaults, freshness and date-based release wording just as Android does. No contract or generator changes were made.

## Checks

- Final swift build passed. Focused request tests passed, 16 tests across the selected suites. The final full swift test run timed out after 15 minutes; it did not produce a suite summary. Existing Player/Search tests were among those without a completion line.
- Full frozen install plus pnpm verify passed.
- Final tvOS Simulator xcodebuild succeeded with the requested 15-minute timeout.
- Live admin fixture: mine encoded to 30 bytes, queue to 140 bytes; Discover returned enabled=false, rails=[], browse=[]; Dune catalog search returned zero results. This exercises transport/decoding only, not a functioning metadata fixture or request state transitions.
