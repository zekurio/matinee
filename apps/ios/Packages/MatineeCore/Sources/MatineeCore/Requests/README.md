# Requests logic port status

The logic the app's request screens (`Matinee/UI/requests`) are built on. What's still open is listed at the end.

## Available

- `RequestData`: catalog detail, related rails, related titles, Discover rails and each row's cards (`row`), browse options and pages, catalog search, library show gaps, My requests and admin queue fetches. These are stateless fetches for the existing `Loader` type, not complete paging controllers.
- `RequestLiveController`: owns visibility-driven cancellation and reconnection. Calls a supplied reload callback on snapshots and disconnections so composed non-streamed structures can refresh. `RequestAvailabilityState` remains the underlying overlay; season snapshots are in `titles[ref].seasons`.
- `RequestPages<Item>`: observable paging with first-occurrence deduplication, cursor retry, generation-safe reset and stale accumulation. `browseBatch` and `searchBatch` adapt the corresponding fetches. Browse batches preserve server filters, sort, vote floor and detail. Change the configure key when query, kind, filters or sort change.
- `RequestChooser`: season selection and future-season defaults, including the server-selected destination; `RequestAskFlow`: busy/error state and six-second first-ask undo window. The app maps RequestPermission's values to its own quota/disabled explanations.
- `RequestActions`: ask, add seasons, cancel, admin approve and decline. Throws the transport error; no optimistic state or local permission inference.
- `RequestPermission`: exposes the server's blocked reason, decline answer, remaining quota and reset instant. A zero remaining count does not itself block a request; only disabledReason does. `RequestChooser(detail:availability:only:)` selects the first server-selected destination, or nil if none. Android has no local destination picker. `canSubmit` combines server permission, chooser selection and busy state.
- `RequestAdminQueue`: observable queue snapshot and held/undoable IDs. `waitingRequest(_:isAdmin:)` returns a matching waiting item only for admins and asked availability. `answer(id:answer:actions:changed:)` holds the row immediately, allows Undo for six seconds, sends Add or Decline, calls changed on success, then holds for one more second for live state to catch up. All timing is injectable. `undo` is ignored once a mutation starts. Failures are exposed as Failure and the row returns after the hold. Attach to the admin queue and use waitingRequest on title/season pages; keep held rows out of lists and disable their answer buttons.
- View values: state words, actions, blocked reasons, decline answers, release dates, chooser labels/defaults, season ordering and episode details, askable results.
- `RequestShowGaps`: loads a library show's missing/partial seasons with three provider-match retries at 5, 10 and 15 seconds. A recovery callback refreshes the library title. Missing and partial seasons read the live season overlay; use `followed` for visibility subscription, supplying the library ID when applicable. Attach this separately to library show detail.
- `RequestData.personCredits`: reads the server's catalog credits from people.get. Attach to the person page and follow visible credit refs.
- Seasons read as titles: `SeasonAvailability.asTitle`, with `stateWord`, `badge`, and `asks` on a season, and `requestRestCount`. These replace the title page's `gap…` helpers, which lived in `Title/TitlePresentation.swift`.
- One overlay for every page: `RequestAvailabilityState.apply` shows an ask's answer at once, `seasons(_:_:)` and `season(_:_:fallback:)` overlay a show's seasons, and `RequestLiveController(state:)` lets every page's stream write to the app's one overlay.
- `RequestScreens.swift`, what the screens decide, after Android's screens: `catalogPageAction` and `catalogAsksAtOnce` (the catalog page's button, "Request more"), `Availability.arrivedTitleId`, `RequestPermission.leftToSay` (the server's count, said when two or fewer, as the web's tip), `requestShortNote`, `askedCardKind` and `askedDeclined` (My requests), `RequestAdminQueue.needsYou`, `rows(_:)`, `count(_:)` and `RequestQueueList`, `requestAskers`, `requestedBy`, `requestSeasonRuns`, `requestScopeParts`, `requestProgress`, `requestOutcome` (the queue), the Discover helpers (`discoverRailKey`, `discoverRecommends`, `discoverRailBrowse`, the server's browse a row's heading opens as a `CatalogBrowseStart`, or none, `discoverRailCards`, `discoverRailFollowed`), `CatalogFilters.none`, `count`, `recommends` and `forOtherKind` (switching between movies and shows), `catalogSortFits` and `catalogSort(_:fitting:)` (best match only among recommendations), `browseCardDetail`, `browseLibraryTitle`, and `requestFollowWindow`, the blocks of a long grid one stream follows.

## Page attachment

Catalog detail uses title and related fetches. Search uses search and Discover. Browse uses browseOptions/browse. Library show detail composes gaps. Home and profile compose mine. Admin profile composes queue. Every visible collection must supply its refs to the availability overlay and render the overlay instead of the fetched availability.

## Sources and omissions

View values derive from RequestView.kt; fetches correspond to CatalogScreen.kt, Browse.kt, Discover.kt, Related.kt, ShowGaps.kt, Asked.kt and Admin.kt. Mutations correspond to Ask.kt and RequestsHub.kt. Compose drawing is intentionally absent. The server has no request notifications and no following a request, so neither is ported.

Still missing: success-payload and request-body fake-transport loader/action tests and ask/undo timing integration tests. Admin bulk Add, Give up, Retry, Allow again and Add after all remain unported, so the app's queue offers Add and Decline only and shows the other lists without their actions. The app checks every request flow against an in-app stand-in for these endpoints in debug builds (`-dev.requestFixtures`), since the dev server has no metadata provider.

The client computes season ordering, chooser defaults and date-based release wording just as Android does. No contract or generator changes were made.

## Checks

- Latest full serial validation after admin queue: 280 tests passed in 4.998 seconds; after destination/quota: 282 tests passed in 8.100 seconds. Earlier validation: base c0a569d passed 260 tests in 4.615 seconds; branch passed 278 tests three consecutive times in 13.354, 6.177 and 3.864 seconds at machine load averages around 495–717. No branch-specific hang was established. Timer-dependent request logic accepts injected sleep; recovery/reconnection/admin tests use an event-driven test clock rather than wall-clock waits.
- Full frozen install plus pnpm verify passed.
- Final tvOS Simulator xcodebuild succeeded with the requested 15-minute timeout.
- Live admin fixture: mine encoded to 30 bytes, queue to 140 bytes; Discover returned enabled=false, rails=[], browse=[]; Dune catalog search returned zero results. This exercises transport/decoding only, not a functioning metadata fixture or request state transitions.
