package io.github.zekurio.matinee.ui.requests

import io.github.zekurio.matinee.api.Availability
import io.github.zekurio.matinee.api.CatalogRef
import io.github.zekurio.matinee.api.CatalogSeason
import io.github.zekurio.matinee.api.SeasonAvailability
import io.github.zekurio.matinee.api.TitleKind
import java.time.Instant
import java.time.LocalDate

/*
 * What a card, a poster, and the request sheet show for the `Availability`
 * the server sent, as the web's catalog/words.ts has it. The server decides the state, the action, and every number; these
 * only pick which of the web's words and marks go where. Nothing here
 * reads Resources, so the unit tests cover it; RequestWords.kt puts each
 * piece in the app's language.
 */

/** The contract's `Availability.state`. */
object AvailabilityState {
    const val NONE = "none"
    const val ASKED = "asked"
    const val COMING = "coming"
    const val RELEASE = "release"
    const val UNAVAILABLE = "unavailable"
    const val HERE = "here"
}

/** The contract's `Availability.action`. */
object AvailabilityAction {
    const val ASK = "ask"
    const val ADD = "add"
    const val FOLLOW = "follow"
    const val UNFOLLOW = "unfollow"
    const val CANCEL = "cancel"
}

/** The contract's `Availability.disabledReason`. */
object DisabledReason {
    const val OFF = "off"
    const val LIMIT = "limit"
    const val NO_DESTINATION = "noDestination"
    const val DECLINED = "declined"
}

/** A stable string for a reference, for keys and card tones. */
val CatalogRef.key: String get() = "$kind:$provider:$providerId"

val CatalogRef.isShow: Boolean get() = kind == TitleKind.SHOW

/** A season's availability read as a title's, which it extends. */
fun SeasonAvailability.asTitle(): Availability = Availability(
    state = state,
    action = action,
    progress = progress,
    etaSeconds = etaSeconds,
    releaseDate = releaseDate,
    stillLooking = stillLooking,
    reason = reason?.let { Availability.Reason(it.kind, it.code, it.note) },
    askedBySelf = askedBySelf,
    following = following,
    requestId = requestId,
    others = Availability.Others(others.count, others.names),
    limit = limit?.let { Availability.Limit(it.left, it.resetsAt) },
    libraryTitleId = libraryTitleId,
    disabledReason = disabledReason,
)

/** Whether the main action asks or adds, the two that start a request. */
val Availability.asks: Boolean get() = action == AvailabilityAction.ASK || action == AvailabilityAction.ADD

/** Whether it adds without anyone saying yes. */
val Availability.adds: Boolean get() = action == AvailabilityAction.ADD

/** A calendar day the server sent as `2026-08-14`, or null. */
fun parseDay(day: String?): LocalDate? = day?.let { runCatching { LocalDate.parse(it.take(10)) }.getOrNull() }

/** An instant the server sent, or null. */
fun parseInstant(value: String?): Instant? = value?.let { runCatching { Instant.parse(it) }.getOrNull() }

/** A state's word, as the four a viewer learns. */
sealed interface StateWord {
    data object Asked : StateWord

    /** On its way, with the share that's in once the server knows it. */
    data class Coming(val progress: Double?) : StateWord

    /** "Out 14 Aug": the release day is ahead. */
    data class Out(val day: LocalDate) : StateWord

    data object NotOut : StateWord

    data object Unavailable : StateWord
}

/** "Out {date}" while the day is ahead, else "Not out yet". */
fun releaseWord(day: String?, today: LocalDate): StateWord {
    val date = parseDay(day)
    return if (date != null && date.isAfter(today)) StateWord.Out(date) else StateWord.NotOut
}

/**
 * The state's word, for a state that has one; null for none and here.
 * With [percent], on its way carries the share that's in.
 */
fun stateWord(availability: Availability, today: LocalDate, percent: Boolean = false): StateWord? = when (availability.state) {
    AvailabilityState.ASKED -> StateWord.Asked
    AvailabilityState.COMING -> StateWord.Coming(if (percent) availability.progress else null)
    AvailabilityState.RELEASE -> releaseWord(availability.releaseDate, today)
    AvailabilityState.UNAVAILABLE -> StateWord.Unavailable
    else -> null
}

/** The glyph in a catalog card's corner. */
enum class Glyph { Clock, Ring, Calendar, Slash }

/** What the corner shows: its glyph, and for the ring, the share that's in, or null for a dotted ring. */
data class CardBadge(val glyph: Glyph, val progress: Double? = null)

/**
 * The round glass mark in a catalog card's corner, once the title has a
 * state. Null for a title nobody requested, and for one that's here: a
 * card shows nothing at rest, as the web's does.
 */
fun badgeOf(availability: Availability): CardBadge? = when (availability.state) {
    AvailabilityState.ASKED -> CardBadge(Glyph.Clock)
    AvailabilityState.COMING -> CardBadge(Glyph.Ring, availability.progress)
    AvailabilityState.RELEASE -> CardBadge(Glyph.Calendar)
    AvailabilityState.UNAVAILABLE -> CardBadge(Glyph.Slash)
    else -> null
}

/** A catalog card's second line. */
sealed interface CardLine {
    data class State(val word: StateWord) : CardLine

    /** What the card was given in place of the year, like Coming soon's day. */
    data class Detail(val text: String) : CardLine

    /** "2021 · Movie" */
    data class YearKind(val year: Int?, val kind: String) : CardLine
}

/**
 * The second line: the state once there is one, with the share that's in
 * while it's on its way, else [detail], else the year and kind.
 */
fun cardLine(year: Int?, ref: CatalogRef, availability: Availability, today: LocalDate, detail: String? = null): CardLine {
    stateWord(availability, today, percent = true)?.let { return CardLine.State(it) }
    if (detail != null) return CardLine.Detail(detail)
    return CardLine.YearKind(year, ref.kind)
}

/** The one thing a poster offers to do about a title. */
enum class PosterAction { Request, Cancel, Follow, Unfollow }

/** What the server lets the viewer do, as the poster's one button, or null. */
fun posterAction(availability: Availability): PosterAction? = when {
    availability.asks -> PosterAction.Request
    availability.requestId == null -> null
    availability.action == AvailabilityAction.CANCEL -> PosterAction.Cancel
    availability.action == AvailabilityAction.FOLLOW -> PosterAction.Follow
    availability.action == AvailabilityAction.UNFOLLOW -> PosterAction.Unfollow
    else -> null
}

/** Why a declined title isn't coming. */
enum class ReasonWord { AlreadyHere, NotForServer, NotFound, Declined }

/** The reason's words, for My requests and notifications. */
data class Decline(val reason: ReasonWord)

fun declineOf(reason: Availability.Reason): Decline = Decline(
    when {
        reason.kind == "notFound" || reason.code == "notFound" -> ReasonWord.NotFound
        reason.code == "alreadyHere" -> ReasonWord.AlreadyHere
        reason.code == "notForServer" -> ReasonWord.NotForServer
        else -> ReasonWord.Declined
    },
)

/**
 * Why the poster's Request can't be pressed, as the web's
 * `requestDimmed`: the poster keeps it, dimmed, and a tap says this,
 * after a decline's answer ([declineAnswer]). Null when the button works.
 */
sealed interface Blocked {
    data object Off : Blocked

    data object NoDestination : Blocked

    /** When someone out of requests can request again, or later when the server doesn't say. */
    data class LimitUntil(val at: Instant?) : Blocked

    /**
     * An admin declined the title, which closes it for everyone until an
     * admin lifts it. Whoever requested or follows it has the answer.
     */
    data object Declined : Blocked
}

fun requestBlocked(availability: Availability): Blocked? = when (availability.disabledReason) {
    DisabledReason.OFF -> Blocked.Off
    DisabledReason.NO_DESTINATION -> Blocked.NoDestination
    DisabledReason.LIMIT -> Blocked.LimitUntil(parseInstant(availability.limit?.resetsAt))
    DisabledReason.DECLINED -> Blocked.Declined
    else -> null
}

/** Whether a poster has a button: one to press, or a Request that can't be, kept with its reason. */
fun hasPosterButton(availability: Availability): Boolean = posterAction(availability) != null || requestBlocked(availability) != null

/**
 * An admin's answer to the viewer's declined request, as the web's
 * `declineAnswer`: who declined it, the reason he picked (the contract's
 * code), and his note. Null when nothing of the viewer's was declined.
 */
data class Answer(val code: String?, val note: String?)

fun declineAnswer(availability: Availability): Answer? {
    val reason = availability.reason
    if (availability.state != AvailabilityState.UNAVAILABLE || reason == null) return null
    return Answer(
        code = reason.code ?: "notFound".takeIf { reason.kind == "notFound" },
        note = reason.note?.trim()?.takeIf { it.isNotEmpty() },
    )
}

/** A season's episodes: its count, how many have aired of it, or when it's out. */
sealed interface SeasonDetail {
    data class Episodes(val count: Int) : SeasonDetail

    data class Airing(val aired: Int, val count: Int) : SeasonDetail

    data class Release(val word: StateWord) : SeasonDetail
}

fun seasonDetail(season: CatalogSeason, today: LocalDate): SeasonDetail {
    val aired = season.availability.episodesAired
    val count = season.episodeCount ?: 0
    return when {
        aired == 0 && count > 0 -> SeasonDetail.Release(releaseWord(season.airDate, today))
        count > aired && aired > 0 -> SeasonDetail.Airing(aired, count)
        else -> SeasonDetail.Episodes(count)
    }
}

/** The request sheet's button: what pressing it requests. */
sealed interface ChooserLabel {
    data object PickOne : ChooserLabel

    /** A film's, with nothing to pick but the library. */
    data object Title : ChooserLabel

    data object Future : ChooserLabel

    data object Specials : ChooserLabel

    data class One(val number: Int) : ChooserLabel

    data class Many(val count: Int) : ChooserLabel
}

/** The sheet's button for the seasons [chosen], with new seasons as they air when [future] on a [first] request. */
fun chooserLabel(chosen: List<CatalogSeason>, future: Boolean, first: Boolean): ChooserLabel {
    if (chosen.isEmpty() && !(future && first)) return ChooserLabel.PickOne
    val only = chosen.singleOrNull()
    return when {
        chosen.isEmpty() -> ChooserLabel.Future
        only != null && only.number == 0 -> ChooserLabel.Specials
        only != null -> ChooserLabel.One(only.number)
        else -> ChooserLabel.Many(chosen.size)
    }
}

/**
 * The seasons the sheet starts with ticked: the server's pick, of those the
 * viewer may still request, or only [only], from a season's card.
 */
fun chooserStart(seasons: List<CatalogSeason>, only: Int? = null): Set<Int> =
    seasons.filter { (if (only != null) it.number == only else it.selected) && it.availability.asTitle().asks }.map { it.number }.toSet()

/** Whether there's anything to say about a season the server lacks: an ask or a state. */
fun offersSeason(season: CatalogSeason): Boolean =
    season.availability.state != AvailabilityState.NONE || season.availability.asTitle().asks

/** Numbered seasons in order, then the specials, as the web's rail and chooser have them. */
fun bySeason(seasons: List<CatalogSeason>): List<CatalogSeason> =
    seasons.sortedBy { if (it.number == 0) Int.MAX_VALUE else it.number }

/** The catalog's results someone could ask for: none for an account that can't ask. */
fun <T> askable(items: List<T>, availability: (T) -> Availability): List<T> =
    items.filter { availability(it).disabledReason != DisabledReason.OFF }
