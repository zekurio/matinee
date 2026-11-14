package io.github.zekurio.matinee.ui.requests

import io.github.zekurio.matinee.api.Availability
import io.github.zekurio.matinee.api.CatalogRef
import io.github.zekurio.matinee.api.CatalogSeason
import io.github.zekurio.matinee.api.SeasonAvailability
import io.github.zekurio.matinee.api.TitleKind
import java.time.LocalDate
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** What cards, posters, and the request sheet pick for each `Availability` the server sends. */
class RequestViewTest {
    private val today = LocalDate.of(2026, 5, 1)
    private val film = CatalogRef(TitleKind.MOVIE, "tmdb", "438631")

    private fun availability(
        state: String = AvailabilityState.NONE,
        action: String? = AvailabilityAction.ASK,
        progress: Double? = null,
        releaseDate: String? = null,
        reason: Availability.Reason? = null,
        askedBySelf: Boolean = false,
        following: Boolean = false,
        requestId: String? = null,
        others: Availability.Others = Availability.Others(0, emptyList()),
        limit: Availability.Limit? = null,
        disabledReason: String? = null,
        etaSeconds: Int? = null,
        stillLooking: Boolean = false,
    ) = Availability(
        state = state, action = action, progress = progress, etaSeconds = etaSeconds, releaseDate = releaseDate,
        stillLooking = stillLooking, reason = reason, askedBySelf = askedBySelf, following = following,
        requestId = requestId, others = others, limit = limit, libraryTitleId = null,
        disabledReason = disabledReason,
    )

    private fun season(number: Int, state: String = AvailabilityState.NONE, action: String? = AvailabilityAction.ASK, aired: Int = 10, count: Int? = 10, selected: Boolean = true) =
        CatalogSeason(
            number = number, overview = null, poster = null, episodeCount = count, airDate = null, selected = selected,
            availability = SeasonAvailability(
                state = state, action = action, progress = null, etaSeconds = null, releaseDate = null, stillLooking = false,
                reason = null, askedBySelf = false, following = false, requestId = null,
                others = SeasonAvailability.Others(0, emptyList()), limit = null, libraryTitleId = null,
                disabledReason = null, number = number, episodesHere = 0, episodesAired = aired,
            ),
        )

    @Test
    fun nothingRequestedOffersRequestAndNoBadge() {
        val a = availability()
        assertEquals(PosterAction.Request, posterAction(a))
        assertNull(badgeOf(a))
        assertEquals(CardLine.YearKind(2021, TitleKind.MOVIE), cardLine(2021, film, a, today))
        assertNull(requestBlocked(a))
        assertNull(declineAnswer(a))
        assertEquals(PosterAction.Request, posterAction(availability(action = AvailabilityAction.ADD)))
    }

    @Test
    fun requestedCanBeCancelledByWhoeverRequestedIt() {
        val a = availability(AvailabilityState.ASKED, AvailabilityAction.CANCEL, requestId = "r", askedBySelf = true)
        assertEquals(PosterAction.Cancel, posterAction(a))
        assertEquals(CardBadge(Glyph.Clock), badgeOf(a))
        assertNull(declineAnswer(a))
    }

    @Test
    fun onItsWayCarriesItsShareOnTheCard() {
        val a = availability(AvailabilityState.COMING, null, progress = 0.64, requestId = "r")
        assertEquals(CardLine.State(StateWord.Coming(0.64)), cardLine(null, film, a, today))
        assertEquals(CardBadge(Glyph.Ring, 0.64), badgeOf(a))
        assertNull(posterAction(a))
        val none = availability(AvailabilityState.COMING, null)
        assertEquals(CardLine.State(StateWord.Coming(null)), cardLine(null, film, none, today))
        assertEquals(CardBadge(Glyph.Ring, null), badgeOf(none))
    }

    @Test
    fun releaseSaysTheDayWhileItsAhead() {
        val ahead = availability(AvailabilityState.RELEASE, null, releaseDate = "2026-08-14")
        assertEquals(CardLine.State(StateWord.Out(LocalDate.of(2026, 8, 14))), cardLine(null, film, ahead, today))
        assertEquals(CardBadge(Glyph.Calendar), badgeOf(ahead))
        val past = availability(AvailabilityState.RELEASE, null, releaseDate = "2026-01-02")
        assertEquals(CardLine.State(StateWord.NotOut), cardLine(null, film, past, today))
        assertEquals(CardLine.State(StateWord.NotOut), cardLine(null, film, availability(AvailabilityState.RELEASE, null), today))
    }

    @Test
    fun aDeclineGivesItsRequesterTheAnswer() {
        val reason = Availability.Reason("declined", "notForServer", "We have the cut")
        val a = availability(
            AvailabilityState.UNAVAILABLE, null, reason = reason, disabledReason = DisabledReason.DECLINED, askedBySelf = true,
        )
        assertEquals(CardBadge(Glyph.Slash), badgeOf(a))
        assertNull(posterAction(a))
        // The poster keeps a dimmed Request, and a tap gives the answer.
        assertTrue(hasPosterButton(a))
        assertEquals(Answer("notForServer", "We have the cut"), declineAnswer(a))
        assertEquals(Blocked.Declined, requestBlocked(a))
    }

    @Test
    fun aDeclineClosesTheTitleForEveryoneElseWithoutTheAnswer() {
        // The server sends no reason to someone who didn't request it.
        val a = availability(AvailabilityState.UNAVAILABLE, null, requestId = "r", disabledReason = DisabledReason.DECLINED)
        assertEquals(CardBadge(Glyph.Slash), badgeOf(a))
        assertNull(posterAction(a))
        assertTrue(hasPosterButton(a))
        assertNull(declineAnswer(a))
        assertEquals(Blocked.Declined, requestBlocked(a))
    }

    @Test
    fun aRequestGivenUpOnSaysNoCopyWasFound() {
        val reason = Availability.Reason("declined", "notFound", null)
        val a = availability(AvailabilityState.UNAVAILABLE, null, reason = reason, disabledReason = DisabledReason.DECLINED, following = true)
        assertEquals(Answer("notFound", null), declineAnswer(a))
        assertEquals(Decline(ReasonWord.NotFound), declineOf(reason))
    }

    @Test
    fun someoneElseRequestedOffersNotifyMe() {
        val a = availability(AvailabilityState.ASKED, AvailabilityAction.FOLLOW, requestId = "r", others = Availability.Others(2, listOf("Anna")))
        assertEquals(PosterAction.Follow, posterAction(a))
        assertNull(requestBlocked(a))
        val following = a.copy(action = AvailabilityAction.UNFOLLOW, following = true, state = AvailabilityState.COMING)
        assertEquals(PosterAction.Unfollow, posterAction(following))
    }

    @Test
    fun theLimitKeepsADimmedRequestThatSaysWhen() {
        val a = availability(action = null, disabledReason = DisabledReason.LIMIT, limit = Availability.Limit(0, "2026-05-04T00:00:00.000Z"))
        assertNull(posterAction(a))
        assertNull(badgeOf(a))
        assertTrue(hasPosterButton(a))
        assertEquals(Blocked.LimitUntil(java.time.Instant.parse("2026-05-04T00:00:00.000Z")), requestBlocked(a))
    }

    @Test
    fun aDimmedButtonSaysWhy() {
        fun blocked(reason: String) = requestBlocked(availability(action = null, disabledReason = reason))
        assertEquals(Blocked.Off, blocked(DisabledReason.OFF))
        assertEquals(Blocked.NoDestination, blocked(DisabledReason.NO_DESTINATION))
        assertEquals(Blocked.Declined, blocked(DisabledReason.DECLINED))
        assertTrue(hasPosterButton(availability(action = null, disabledReason = DisabledReason.OFF)))
    }

    @Test
    fun theSheetNamesWhatItRequests() {
        val seasons = listOf(season(1), season(2), season(0, selected = false))
        assertEquals(setOf(1, 2), chooserStart(seasons))
        assertEquals(setOf(0), chooserStart(seasons, only = 0))
        assertEquals(ChooserLabel.Many(2), chooserLabel(seasons.take(2), future = true, first = true))
        assertEquals(ChooserLabel.One(2), chooserLabel(listOf(seasons[1]), future = false, first = true))
        assertEquals(ChooserLabel.Specials, chooserLabel(listOf(seasons[2]), future = false, first = true))
        assertEquals(ChooserLabel.Future, chooserLabel(emptyList(), future = true, first = true))
        assertEquals(ChooserLabel.PickOne, chooserLabel(emptyList(), future = true, first = false))
    }

    @Test
    fun aSeasonSaysItsEpisodesOrWhereItsAiring() {
        assertEquals(SeasonDetail.Episodes(10), seasonDetail(season(1), today))
        assertEquals(SeasonDetail.Airing(3, 10), seasonDetail(season(4, aired = 3), today))
        assertEquals(SeasonDetail.Release(StateWord.NotOut), seasonDetail(season(5, aired = 0), today))
    }

    @Test
    fun anAccountThatCantAskSeesNoCatalogResults() {
        val items = listOf(availability(), availability(action = null, disabledReason = DisabledReason.OFF))
        assertEquals(1, askable(items) { it }.size)
    }
}
