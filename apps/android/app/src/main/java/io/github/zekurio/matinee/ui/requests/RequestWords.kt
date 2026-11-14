package io.github.zekurio.matinee.ui.requests

import android.content.res.Resources
import android.icu.text.ListFormatter
import android.text.format.DateFormat
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.Availability
import io.github.zekurio.matinee.api.CatalogRef
import io.github.zekurio.matinee.api.CatalogSeason
import io.github.zekurio.matinee.api.DeclineReason
import io.github.zekurio.matinee.api.TitleKind
import io.github.zekurio.matinee.ui.seasonName
import java.text.NumberFormat
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.FormatStyle
import java.util.Locale
import kotlin.math.roundToInt

/*
 * The words for what RequestView.kt picked, in the app's language: the
 * web's, copied into strings_web_ask.xml and the rest by
 * scripts/web_strings.py.
 */

private val Resources.locale: Locale get() = configuration.locales[0] ?: Locale.getDefault()

/** "14 Aug" in the current year, else the whole date, as the web's `formatDay`. */
fun formatShortDay(day: LocalDate, res: Resources): String {
    val locale = res.locale
    val formatter = if (day.year == LocalDate.now().year) {
        DateTimeFormatter.ofPattern(DateFormat.getBestDateTimePattern(locale, "dMMM"), locale)
    } else {
        DateTimeFormatter.ofLocalizedDate(FormatStyle.MEDIUM).withLocale(locale)
    }
    return formatter.format(day)
}

fun formatShortDay(at: Instant, res: Resources): String = formatShortDay(at.atZone(ZoneId.systemDefault()).toLocalDate(), res)

/** "64%" or "64 %", as the language writes a share. */
fun formatPercent(share: Double, res: Resources): String =
    NumberFormat.getPercentInstance(res.locale).apply { maximumFractionDigits = 0 }.format(share.coerceIn(0.0, 1.0))

/** "20 minutes", for how long is left. */
fun formatSpan(seconds: Int, res: Resources): String = when {
    seconds < 60 -> res.getQuantityString(R.plurals.requests_span_seconds, maxOf(1, seconds), maxOf(1, seconds))
    seconds < 3600 -> (seconds / 60.0).roundToInt().let { res.getQuantityString(R.plurals.requests_span_minutes, it, it) }
    seconds < 86_400 -> (seconds / 3600.0).roundToInt().let { res.getQuantityString(R.plurals.requests_span_hours, it, it) }
    else -> (seconds / 86_400.0).roundToInt().let { res.getQuantityString(R.plurals.requests_span_days, it, it) }
}

/** "A, B and C" in the app's language. */
fun formatList(items: List<String>, res: Resources): String = ListFormatter.getInstance(res.locale).format(items)

fun kindWord(kind: String, res: Resources): String =
    res.getString(if (kind == TitleKind.SHOW) R.string.web_requests_kind_show else R.string.web_requests_kind_movie)

/** "2021 · Movie" */
fun yearKind(year: Int?, kind: String, res: Resources): String =
    if (year == null) kindWord(kind, res) else res.getString(R.string.requests_year_kind, year.toString(), kindWord(kind, res))

fun stateText(word: StateWord, res: Resources): String = when (word) {
    StateWord.Asked -> res.getString(R.string.web_catalog_state_asked)
    is StateWord.Coming -> word.progress?.let { res.getString(R.string.web_catalog_state_comingPercent, formatPercent(it, res)) }
        ?: res.getString(R.string.web_catalog_state_coming)
    is StateWord.Out -> res.getString(R.string.web_catalog_state_out, formatShortDay(word.day, res))
    StateWord.NotOut -> res.getString(R.string.web_catalog_state_notOut)
    StateWord.Unavailable -> res.getString(R.string.web_catalog_state_unavailable)
}

fun cardLineText(line: CardLine, res: Resources): String = when (line) {
    is CardLine.State -> stateText(line.word, res)
    is CardLine.Detail -> line.text
    is CardLine.YearKind -> yearKind(line.year, line.kind, res)
}

/** A catalog card's second line, straight from what the server said. */
fun cardLineText(year: Int?, ref: CatalogRef, availability: Availability, res: Resources, detail: String? = null): String =
    cardLineText(cardLine(year, ref, availability, LocalDate.now(), detail), res)

fun seasonDetailText(detail: SeasonDetail, res: Resources): String = when (detail) {
    is SeasonDetail.Episodes -> res.getQuantityString(R.plurals.media_episode_count, detail.count, detail.count)
    is SeasonDetail.Airing -> res.getString(R.string.web_catalog_season_airing, detail.aired.toString(), detail.count.toString())
    is SeasonDetail.Release -> stateText(detail.word, res)
}

/** A season the server lacks, under its name: its state, else its episodes. */
fun seasonLineText(season: CatalogSeason, res: Resources): String {
    val today = LocalDate.now()
    return stateWord(season.availability.asTitle(), today, percent = true)?.let { stateText(it, res) }
        ?: seasonDetailText(seasonDetail(season, today), res)
}

/** "Season 4 isn't here yet" while it can be requested, else "Season 4 · Requested". */
fun nextSeasonLine(number: Int, availability: Availability, res: Resources): String {
    val label = seasonName(number, res)
    val state = stateWord(availability, LocalDate.now(), percent = true)
    return if (state != null) res.getString(R.string.requests_season_state, label, stateText(state, res))
    else res.getString(R.string.requests_season_not_here, label)
}

/** A decline's reason, "Not for this server.", as the web's `declineLine`. */
fun declineText(decline: Decline, res: Resources): String = res.getString(
    when (decline.reason) {
        ReasonWord.NotFound -> R.string.web_ask_reason_notFound
        ReasonWord.AlreadyHere -> R.string.web_ask_reason_alreadyHere
        ReasonWord.NotForServer -> R.string.web_ask_reason_notForServer
        ReasonWord.Declined -> R.string.web_ask_reason_declined
    },
)

fun declineText(reason: Availability.Reason, res: Resources): String = declineText(declineOf(reason), res)

/**
 * Why a dimmed Request can't be pressed. A declined title says only that
 * it's closed, and to an admin where to open it again; whoever requested
 * it reads the admin's answer instead ([answerText]).
 */
fun blockedText(blocked: Blocked, res: Resources, admin: Boolean = false): String = when (blocked) {
    Blocked.Off -> res.getString(R.string.web_ask_disabled_off)
    Blocked.NoDestination -> res.getString(R.string.web_ask_disabled_noDestination)
    is Blocked.LimitUntil -> blocked.at?.let { res.getString(R.string.web_ask_limit_until, formatShortDay(it, res)) }
        ?: res.getString(R.string.web_ask_limit_later)
    Blocked.Declined -> res.getString(
        if (admin) R.string.web_ask_disabled_declinedAdmin else R.string.web_ask_disabled_declined,
    )
}

/** A decline reason's words, as the admin picks them: "Not for this server". */
fun adminReasonText(code: String, res: Resources): String = res.getString(
    when (code) {
        DeclineReason.ALREADY_HERE -> R.string.web_requests_reason_alreadyHere
        DeclineReason.NOT_FOR_SERVER -> R.string.web_requests_reason_notForServer
        else -> R.string.web_requests_reason_notFound
    },
)

/**
 * "Declined: Not for this server.", in the reason words the admin picked
 * from, or "No copy of this could be found." for one given up on.
 */
fun answerText(answer: Answer, res: Resources): String {
    if (answer.code == DeclineReason.NOT_FOUND) return res.getString(R.string.web_ask_declined_notFound)
    val why = answer.code?.let { adminReasonText(it, res) }
    return if (why != null) res.getString(R.string.web_ask_declined_why, why)
    else res.getString(R.string.web_ask_reason_declined)
}

/** How much of an admin's note a tap shows; My requests has all of it. */
private const val NOTE_LENGTH = 140

/**
 * What a tap on a dimmed Request says, as the web's tooltip: for whoever
 * requested or follows a declined title, the admin's answer, as "Lukas
 * declined this: Not for this server.", with his note, cut short, on a
 * line of its own; for anyone else, why it can't be pressed. [admin]
 * points an admin to where a decline is lifted. Null for a Request that
 * works.
 */
fun dimmedText(availability: Availability, res: Resources, admin: Boolean = false): String? {
    val blocked = requestBlocked(availability) ?: return null
    val answer = declineAnswer(availability)
    val text = answer?.let { answerText(it, res) } ?: blockedText(blocked, res, admin)
    val note = answer?.note ?: return text
    val short = if (note.length <= NOTE_LENGTH) note
    else note.take(NOTE_LENGTH).substringBeforeLast(' ').trimEnd(',', '.', ';', ':') + "…"
    return text + "\n" + res.getString(R.string.web_ask_declined_note, short)
}

fun chooserText(label: ChooserLabel, res: Resources): String = when (label) {
    ChooserLabel.PickOne -> res.getString(R.string.web_ask_chooser_none)
    ChooserLabel.Title -> res.getString(R.string.web_ask_ask)
    ChooserLabel.Future -> res.getString(R.string.web_ask_chooser_newOnly)
    ChooserLabel.Specials -> res.getString(R.string.web_ask_chooser_specials)
    is ChooserLabel.One -> res.getString(R.string.web_ask_chooser_one, label.number.toString())
    is ChooserLabel.Many -> res.getQuantityString(R.plurals.web_ask_chooser_many, label.count, label.count)
}

/** The poster button's words. */
fun posterActionText(action: PosterAction, res: Resources): String = res.getString(
    when (action) {
        PosterAction.Request -> R.string.web_ask_ask
        PosterAction.Cancel -> R.string.web_ask_cancel
        PosterAction.Follow -> R.string.web_ask_notify
        PosterAction.Unfollow -> R.string.web_ask_stopNotifying
    },
)

/** A season's name with its show's, for toasts: "Firefly: Season 2". */
fun seasonOf(show: String, number: Int, res: Resources): String =
    res.getString(R.string.title_season_of, show, seasonName(number, res))
