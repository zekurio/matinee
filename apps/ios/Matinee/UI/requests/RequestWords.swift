import Foundation
import MatineeCore

/*
 * RequestWords.kt: the words for what MatineeCore's request values say
 * (Requests/RequestView.swift, RequestScreens.swift),
 * in the app's language, from the web's strings Android copied into
 * strings_web_*.xml. Nothing here decides anything; it only says it.
 */

/// "Requested", "On its way · 64 %", "Out 14 Aug", "Not out yet", "Not available".
func requestStateText(_ word: RequestStateWord) -> String {
  switch word {
  case .asked: Str.webCatalogStateAsked
  case .coming(let progress):
    progress.map { Str.webCatalogStateComingPercent(formatPercent($0)) } ?? Str.webCatalogStateComing
  case .out(let day): Str.webCatalogStateOut(formatShortDay(day))
  case .notOut: Str.webCatalogStateNotOut
  case .unavailable: Str.webCatalogStateUnavailable
  }
}

/// "14 Aug" in the current year, else the whole date, as the web's `formatDay`.
func formatShortDay(_ day: String) -> String {
  guard let date = parseDay(day) else { return day }
  return formatShortDate(date)
}

func formatShortDate(_ date: Date) -> String {
  let calendar = Calendar.current
  if calendar.component(.year, from: date) == calendar.component(.year, from: Date()) {
    return date.formatted(Date.FormatStyle(locale: .app).day().month(.abbreviated))
  }
  return date.formatted(Date.FormatStyle(date: .abbreviated, time: .omitted).locale(.app))
}

/// "Movie", "Show".
func requestKindWord(_ kind: String) -> String {
  kind == TitleKind.show ? Str.webRequestsKindShow : Str.webRequestsKindMovie
}

/// "2021 · Movie".
func requestYearKind(_ year: Int?, _ kind: String) -> String {
  guard let year else { return requestKindWord(kind) }
  return Str.requestsYearKind(String(year), requestKindWord(kind))
}

/// A catalog card's second line, straight from what the server said.
func requestCardLine(_ line: RequestCardLine) -> String {
  switch line {
  case .state(let word): requestStateText(word)
  case .detail(let text): text
  case .yearKind(let year, let kind): requestYearKind(year, kind)
  }
}

func requestCardLine(year: Int?, ref: CatalogRef, availability: Availability, detail: String? = nil) -> String {
  requestCardLine(availability.cardLine(year: year, ref: ref, today: todayDay(), detail: detail))
}

/// A season the server lacks, under its name: its state, else its episodes,
/// as Android's `seasonLineText`.
func requestSeasonLine(_ season: CatalogSeason) -> String {
  let today = todayDay()
  if let word = season.availability.stateWord(today: today) { return requestStateText(word) }
  return requestSeasonDetailText(requestSeasonDetail(season, today: today))
}

func requestSeasonDetailText(_ detail: RequestSeasonDetail) -> String {
  switch detail {
  case .episodes(let count): Str.mediaEpisodeCount(count)
  case .airing(let aired, let count): Str.webCatalogSeasonAiring(String(aired), String(count))
  case .release(let word): requestStateText(word)
  }
}

/// "Season 4 isn't here yet" while it can be asked for, else "Season 4 · Requested".
func requestNextSeasonLine(_ season: SeasonAvailability) -> String {
  let label = seasonName(season.number)
  if let word = season.stateWord(today: todayDay()) {
    return Str.requestsSeasonState(label, requestStateText(word))
  }
  return Str.requestsSeasonNotHere(label)
}

/// A decline's reason, "Not for this server.", as the web's `declineLine`.
func requestDeclineText(_ reason: Availability.Reason) -> String {
  switch requestDeclineWord(reason) {
  case .notFound: Str.webAskReasonNotFound
  case .alreadyHere: Str.webAskReasonAlreadyHere
  case .notForServer: Str.webAskReasonNotForServer
  case .declined: Str.webAskReasonDeclined
  }
}

/// Why a dimmed Request can't be pressed. A declined title says only that
/// it's closed, and to an admin where to open it again.
func requestBlockedText(_ blocked: RequestBlocked, admin: Bool) -> String {
  switch blocked {
  case .off: Str.webAskDisabledOff
  case .noDestination: Str.webAskDisabledNoDestination
  case .limitUntil(let at): at.map { Str.webAskLimitUntil(formatShortDate($0)) } ?? Str.webAskLimitLater
  case .declined: admin ? Str.webAskDisabledDeclinedAdmin : Str.webAskDisabledDeclined
  }
}

/// A decline reason as the admin picks it: "Not for this server".
func requestReasonLabel(_ code: String) -> String {
  switch code {
  case DeclineReason.alreadyHere: Str.webRequestsReasonAlreadyHere
  case DeclineReason.notForServer: Str.webRequestsReasonNotForServer
  default: Str.webRequestsReasonNotFound
  }
}

/// "Declined: Not for this server.", or "No copy of this could be found."
func requestAnswerText(_ answer: RequestAnswer) -> String {
  if answer.code == DeclineReason.notFound { return Str.webAskDeclinedNotFound }
  guard let code = answer.code else { return Str.webAskReasonDeclined }
  return Str.webAskDeclinedWhy(requestReasonLabel(code))
}

/// What a tap on a dimmed Request says, as the web's tooltip: the admin's
/// answer with their note cut short, for whoever asked; else why it can't
/// be pressed. Nil for a Request that works.
func requestDimmedText(_ availability: Availability, admin: Bool) -> (text: String, note: String?)? {
  guard let blocked = availability.requestBlocked else { return nil }
  let answer = availability.declineAnswer
  let text = answer.map(requestAnswerText) ?? requestBlockedText(blocked, admin: admin)
  return (text, answer?.note.map { Str.webAskDeclinedNote(requestShortNote($0)) })
}

/// What the request sheet's button says it asks for.
func requestChooserText(_ label: RequestChooserLabel) -> String {
  switch label {
  case .pickOne: Str.webAskChooserNone
  case .title: Str.webAskAsk
  case .future: Str.webAskChooserNewOnly
  case .specials: Str.webAskChooserSpecials
  case .one(let number): Str.webAskChooserOne(String(number))
  case .many(let count): Str.webAskChooserMany(count)
  }
}

/// The poster button's words.
func requestPosterActionText(_ action: RequestPosterAction) -> String {
  switch action {
  case .request: Str.webAskAsk
  case .cancel: Str.webAskCancel
  }
}

/// A season's name with its show's, for toasts: "Firefly: Season 2".
func requestSeasonOf(_ show: String, _ number: Int) -> String { Str.titleSeasonOf(show, seasonName(number)) }

/// "Seasons 1–4 + new", for a show's request.
func requestScopeText(_ scope: ShowScope?) -> String? {
  guard let parts = requestScopeParts(scope) else { return nil }
  var seasons = parts.seasons.map { Str.webRequestsScopeSeasons($0.runs, $0.count) }
  if parts.specials {
    seasons = seasons.map(Str.webRequestsScopeSpecialsAnd) ?? Str.webRequestsScopeSpecials
  }
  guard let seasons else { return parts.future ? Str.webRequestsScopeFutureOnly : nil }
  return parts.future ? Str.webRequestsScopeAndFuture(seasons) : seasons
}

/// "A, B and C" in the app's language.
func requestNames(_ names: [String]) -> String { names.formatted(.list(type: .and).locale(.app)) }

/// Who asked, for a tap on a waiting title's badge, with what a show's
/// request covers on a line under it.
func requestRequestedText(_ item: AdminRequestItem) -> String {
  let who =
    switch requestedBy(item) {
    case .waiting: Str.webRequestsBadgeWaiting
    case .one(let name, let at): Str.webRequestsBadgeRequested(name, relativeTime(at))
    case .many(let names): Str.webRequestsBadgeRequestedMany(requestNames(names))
    }
  return [who, requestScopeText(item.scope)].compactMap(\.self).joined(separator: "\n")
}

/// "20 minutes", for how long is left.
func requestSpanText(_ seconds: Int) -> String {
  switch seconds {
  case ..<60: Str.requestsSpanSeconds(max(1, seconds))
  case ..<3600: Str.requestsSpanMinutes(Int((Double(seconds) / 60).rounded()))
  case ..<86_400: Str.requestsSpanHours(Int((Double(seconds) / 3600).rounded()))
  default: Str.requestsSpanDays(Int((Double(seconds) / 86_400).rounded()))
  }
}

/// How far along a request on its way is: "64 % · 20 minutes left", "Looking for a copy".
func requestProgressText(_ progress: RequestProgress) -> String {
  switch progress {
  case .release(let day): day.map { Str.webRequestsProgressRelease(formatShortDay($0)) } ?? Str.webRequestsProgressNotOut
  case .share(let share, let eta):
    [formatPercent(share), eta.map { Str.webRequestsProgressLeft(requestSpanText($0)) }].compactMap(\.self)
      .joined(separator: " · ")
  case .looking: Str.webRequestsProgressLooking
  case .queued: Str.webRequestsProgressQueued
  case .byHand: Str.webRequestsProgressByHand
  case .sent: Str.webRequestsProgressSent
  }
}

/// What became of a done request: "Declined 2 days ago · Not for this server".
func requestOutcomeText(_ outcome: RequestOutcome) -> String {
  switch outcome {
  case .declined(let at, let reason, let gaveUp):
    let when =
      at.map { gaveUp ? Str.webRequestsDoneGaveUp(relativeTime($0)) : Str.webRequestsDoneDeclined(relativeTime($0)) }
      ?? (gaveUp ? Str.webRequestsDoneGaveUpUndated : Str.webRequestsDoneDeclinedUndated)
    return [when, reason.map(requestReasonLabel)].compactMap(\.self).joined(separator: " · ")
  case .arrived(let at):
    return at.map { Str.webRequestsDoneArrived(relativeTime($0)) } ?? ""
  }
}

/// The queue's lists by name.
func requestListLabel(_ list: RequestQueueList) -> String {
  switch list {
  case .waiting: Str.webRequestsListWaiting
  case .needsAttention: Str.webRequestsListNeedsAttention
  case .onTheWay: Str.webRequestsListOnTheWay
  case .done: Str.webRequestsListDone
  }
}

/// "Popular movies", or "Because you watched Dune".
func discoverRailName(_ rail: DiscoverRail) -> String {
  switch rail.id {
  case "popularFilms": Str.webDiscoverRailPopularFilms
  case "popularShows": Str.webDiscoverRailPopularShows
  case "forYou": Str.webDiscoverRailForYou
  case "becauseWatched": Str.webDiscoverRailBecauseWatched(rail.seed?.name ?? "")
  default: Str.webDiscoverRailComingSoon
  }
}

/// Coming soon says when, where other rows say the year: "14 Aug · Movie".
func discoverReleaseLine(_ rail: String, _ item: CatalogTitleSummary) -> String? {
  guard rail == "comingSoon", let day = item.availability.releaseDate, parseDay(day) != nil else { return nil }
  return Str.webDiscoverCardRelease(formatShortDay(day), requestKindWord(item.ref.kind))
}

/// "Browse movies", "Browse shows".
func browseName(_ kind: String) -> String {
  kind == TitleKind.show ? Str.webDiscoverBrowseShow : Str.webDiscoverBrowseMovie
}

/// What a browse card says under its name.
func browseDetailText(_ detail: BrowseCardDetail) -> String? {
  switch detail {
  case .score(let score, let year):
    year.map { Str.webFiltersCardScore(formatRating(score), String($0)) } ?? Str.webFiltersCardScoreOnly(formatRating(score))
  case .day(let day): formatDay(day) ?? day
  case .year(let year): formatYear(year)
  }
}
