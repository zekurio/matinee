package io.github.zekurio.matinee.ui.tv.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.focusable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.Leaderboard
import io.github.zekurio.matinee.api.LeaderboardBoard
import io.github.zekurio.matinee.api.LeaderboardEntry
import io.github.zekurio.matinee.api.name
import io.github.zekurio.matinee.ui.Load
import io.github.zekurio.matinee.ui.components.Avatar
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.components.Lucide
import io.github.zekurio.matinee.ui.components.LucideIcon
import io.github.zekurio.matinee.ui.profile.BoardStanding
import io.github.zekurio.matinee.ui.profile.metricName
import io.github.zekurio.matinee.ui.profile.metricValue
import io.github.zekurio.matinee.ui.profile.rangeName
import io.github.zekurio.matinee.ui.profile.rememberLeaderboard
import io.github.zekurio.matinee.ui.profile.standings
import io.github.zekurio.matinee.ui.profile.startsNeighborhood
import io.github.zekurio.matinee.ui.theme.Palette
import io.github.zekurio.matinee.ui.tv.TvFocus
import io.github.zekurio.matinee.ui.tv.TvFocusMemory
import io.github.zekurio.matinee.ui.tv.TvListItems
import io.github.zekurio.matinee.ui.tv.TvRow
import io.github.zekurio.matinee.ui.tv.TvSidePanel
import io.github.zekurio.matinee.ui.tv.TvType
import io.github.zekurio.matinee.ui.tv.tvClickable
import io.github.zekurio.matinee.ui.tv.tvContent
import io.github.zekurio.matinee.ui.tv.tvControl
import io.github.zekurio.matinee.ui.tv.tvFocusOnTap

internal const val STANDING = "standing"

/** A board's card in the row. */
private val BoardWidth = 300.dp

/** A place's line on a board's card. */
private val PlaceHeight = 40.dp

/**
 * The leaderboard for [range], the last range's kept while the next one
 * loads, so the row doesn't drop out from under focus.
 */
@Composable
internal fun rememberStandings(range: String, zone: String): List<BoardStanding> {
    val state = rememberLeaderboard(range, zone).state
    var last by remember { mutableStateOf<Leaderboard?>(null) }
    LaunchedEffect(state) { if (state is Load.Ready) last = state.value }
    return standings((state as? Load.Ready)?.value ?: last)
}

/**
 * Where the user stands on each board, a card per board with their place
 * between the people just above and below them. Select opens the board
 * whole in [onOpen]'s panel.
 */
@Composable
internal fun Standing(standings: List<BoardStanding>, memory: TvFocusMemory, onOpen: (LeaderboardBoard) -> Unit) {
    // The cards are as tall as the one with the most places, so the row reads as one.
    val places = standings.maxOf { it.places.size }
    TvRow(stringResource(R.string.stats_standing_title), STANDING, memory) {
        items(standings, key = { it.board.metric }) { standing ->
            BoardCard(standing, places, with(memory) { Modifier.item(STANDING, standing.board.metric) }) { onOpen(standing.board) }
        }
    }
}

/** A board's name, and the user's place with their neighbours. Focused, it fills with the text color. */
@Composable
private fun BoardCard(standing: BoardStanding, rows: Int, modifier: Modifier, onClick: () -> Unit) {
    val res = LocalResources.current
    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    val content = tvContent(focused)
    Column(
        modifier
            .width(BoardWidth)
            .tvControl(focused, CardShape, rest = Palette.Foreground.copy(alpha = 0.07f))
            .tvClickable(interaction, role = Role.Button, onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 16.dp),
    ) {
        Row(Modifier.padding(start = 6.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(
                metricName(standing.board.metric),
                style = TvType.Label,
                color = if (focused) content.copy(alpha = 0.7f) else Palette.Muted,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            LucideIcon(Lucide.ChevronRight, null, size = 18.dp, tint = if (focused) content.copy(alpha = 0.7f) else Palette.Muted)
        }
        Column(Modifier.height(PlaceHeight * rows + 4.dp * (rows - 1)), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            standing.places.forEach { place ->
                Place(place, metricValue(standing.board.metric, place.value, res), focused, Modifier.height(PlaceHeight), small = true)
            }
        }
    }
}

private val CardShape = RoundedCornerShape(16.dp)

/**
 * A place: the rank, the podium's in the accent, the person, and the
 * value, the user's own lit unless [lit] is false, for a row that lights
 * it itself. [inverted] is for a place drawn on a focused control, its
 * text dark.
 */
@Composable
private fun Place(
    place: LeaderboardEntry,
    value: String,
    inverted: Boolean,
    modifier: Modifier = Modifier,
    small: Boolean = false,
    lit: Boolean = true,
) {
    val api = LocalApi.current
    val user = place.user
    val content = tvContent(inverted)
    val podium = when (place.rank) {
        1 -> Palette.Accent
        2 -> Palette.Accent.copy(alpha = 0.6f)
        3 -> Palette.Accent.copy(alpha = 0.3f)
        else -> Color.Transparent
    }
    val fill = when {
        !place.self || !lit -> Color.Transparent
        inverted -> Palette.Background.copy(alpha = 0.08f)
        else -> Palette.AccentSoft
    }
    val text = if (small) TvType.Label else TvType.Facts
    Row(
        modifier.fillMaxWidth().clip(RoundedCornerShape(10.dp)).background(fill).padding(horizontal = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(Modifier.size(28.dp).clip(CircleShape).background(podium), contentAlignment = Alignment.Center) {
            Text(
                place.rank.toString(),
                style = TvType.Caption,
                color = when {
                    place.rank == 1 -> Color.Black
                    place.rank <= 3 || inverted -> content
                    else -> Palette.Muted
                },
                maxLines = 1,
            )
        }
        Avatar(user.name, user.avatarId?.let(api.paths::avatar), size = if (small) 28.dp else 36.dp)
        Text(
            if (place.self) "${user.name} ${stringResource(R.string.stats_you)}" else user.name,
            style = text,
            color = content,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        Text(value, style = text, color = content, maxLines = 1)
    }
}

/** Which board the panel shows, kept while it slides away. */
@Stable
internal class BoardPanelState {
    var board by mutableStateOf<LeaderboardBoard?>(null)
        private set
    var open by mutableStateOf(false)
        private set

    fun show(board: LeaderboardBoard) {
        this.board = board
        open = true
    }

    fun close() {
        open = false
    }
}

/**
 * A whole board in the right-edge panel: the top places, then the user's
 * neighbourhood, set off. Each place takes focus so a long board scrolls;
 * focus starts on the user's own. Back closes it and focus goes back to
 * the board's card.
 */
@Composable
internal fun BoardPanel(state: BoardPanelState, range: String, memory: TvFocusMemory) {
    val board = state.board ?: return
    val res = LocalResources.current
    val self = remember { FocusRequester() }
    val selfIndex = board.entries.indexOfFirst { it.self }
    TvSidePanel(
        state.open,
        metricName(board.metric),
        onBack = state::close,
        returnFocus = { memory.focusLast() },
        description = rangeName(range),
        initial = self.takeIf { selfIndex >= 0 },
        initialIndex = selfIndex.coerceAtLeast(0),
        focusKey = board.metric,
    ) {
        itemsIndexed(board.entries, key = { _, place -> place.user.id }) { index, place ->
            val interaction = remember { MutableInteractionSource() }
            val focused by interaction.collectIsFocusedAsState()
            Place(
                place,
                metricValue(board.metric, place.value, res),
                focused,
                Modifier
                    .padding(top = if (startsNeighborhood(board, index)) 16.dp else 0.dp)
                    .then(if (index == selfIndex) Modifier.focusRequester(self) else Modifier)
                    .tvControl(focused, TvListItems.Shape, rest = if (place.self) Palette.AccentSoft else Color.Transparent, scale = TvFocus.ROW_SCALE)
                    .tvFocusOnTap()
                    .focusable(interactionSource = interaction)
                    .height(TvListItems.Height)
                    .padding(horizontal = TvListItems.Inset - 6.dp),
                lit = false,
            )
        }
    }
}
