package io.github.zekurio.matinee.ui.requests

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.CatalogRef
import io.github.zekurio.matinee.api.CatalogSeason
import io.github.zekurio.matinee.api.ShowScope
import io.github.zekurio.matinee.ui.components.ArtFrame
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.components.Picture
import io.github.zekurio.matinee.ui.components.art
import io.github.zekurio.matinee.ui.kit.Checkbox
import io.github.zekurio.matinee.ui.kit.MatineeButton
import io.github.zekurio.matinee.ui.kit.Shapes
import io.github.zekurio.matinee.ui.kit.SheetFooter
import io.github.zekurio.matinee.ui.kit.Switch
import io.github.zekurio.matinee.ui.seasonName
import io.github.zekurio.matinee.ui.theme.Palette
import java.time.LocalDate

/**
 * Where a request that needs a decision is made, in a sheet from the
 * bottom, as the web's request dialog: a show's seasons, each the viewer
 * may still request with a box, the server's pick already ticked (or only
 * [only], from a season's card), the rest with their state, and on a
 * [first] request "New seasons as they air". Where it lands is the
 * server's call; an admin moves a request from the queue. The button says
 * what pressing it requests.
 */
@Composable
fun RequestSheet(
    titleRef: CatalogRef,
    name: String,
    seasons: List<CatalogSeason>,
    first: Boolean,
    defaultFuture: Boolean,
    libraryId: String?,
    only: Int? = null,
    onDismiss: () -> Unit,
) {
    val res = LocalResources.current
    val hub = LocalRequests.current
    val today = LocalDate.now()
    val show = titleRef.isShow
    // The sheet is made for each opening, so each starts from the server's pick.
    var picked by remember { mutableStateOf(chooserStart(seasons, only)) }
    var future by remember { mutableStateOf(first && defaultFuture && only == null) }
    val chosen = seasons.filter { it.number in picked }
    val label = if (show) chooserLabel(chosen, future, first) else ChooserLabel.Title
    // Opened from a season's card, the list starts at that season.
    val list = rememberLazyListState(initialFirstVisibleItemIndex = seasons.indexOfFirst { it.number == only }.coerceAtLeast(0))
    AskSheet(res.getString(R.string.web_ask_dialog_title, name), onDismiss) { close ->
        if (show) {
            // The seasons scroll between the title and the button, which
            // stay put however many seasons a show has, as the web's do.
            LazyColumn(
                Modifier.fillMaxWidth().weight(1f, fill = false),
                state = list,
                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 8.dp),
            ) {
                items(seasons, key = { it.number }) { season ->
                    val checked = season.number in picked
                    SeasonRow(titleRef, season, checked, today) {
                        picked = if (checked) picked - season.number else picked + season.number
                    }
                }
            }
        }
        SheetFooter(line = show) {
            if (show && first) {
                Row(
                    Modifier.fillMaxWidth().heightIn(min = 48.dp).clickable(role = Role.Switch) { future = !future },
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(stringResource(R.string.web_ask_chooser_future), style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
                    Switch(checked = future, onCheckedChange = { future = it })
                }
            }
            MatineeButton(
                onClick = {
                    val scope = if (show) ShowScope(chosen.map { it.number }, future && first) else null
                    hub.ask(titleRef, name, libraryId, scope, undo = first) { close {} }
                },
                enabled = label != ChooserLabel.PickOne && hub.busy[titleRef.key] != true,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text(chooserText(label, res))
            }
        }
    }
}

/**
 * A season in the request sheet: its box while it may still be
 * requested, its poster, its name, and what's coming or its state.
 */
@Composable
private fun SeasonRow(titleRef: CatalogRef, season: CatalogSeason, checked: Boolean, today: LocalDate, onToggle: () -> Unit) {
    val api = LocalApi.current
    val res = LocalResources.current
    val availability = season.availability.asTitle()
    val open = availability.asks
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 52.dp)
            .clip(Shapes.Md)
            .then(if (open) Modifier.toggleable(value = checked, role = Role.Checkbox, onValueChange = { onToggle() }) else Modifier)
            .padding(horizontal = 8.dp, vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        // A season that can't be asked for keeps the box's room, so the posters line up.
        Box(Modifier.size(20.dp), contentAlignment = Alignment.Center) {
            if (open) Checkbox(checked = checked, onCheckedChange = null)
        }
        Box(Modifier.width(28.dp)) {
            ArtFrame("${titleRef.key}:${season.number}", 2f / 3f) {
                Picture(listOfNotNull(api.art(season.poster)), Modifier.fillMaxSize())
            }
        }
        Text(
            seasonName(season.number, res),
            style = MaterialTheme.typography.bodyLarge,
            fontWeight = FontWeight.Medium,
            color = if (open) Palette.Foreground else Palette.Muted,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
        Text(
            if (open) seasonDetailText(seasonDetail(season, today), res)
            else stateWord(availability, today)?.let { stateText(it, res) } ?: stringResource(R.string.web_ask_chooser_unavailable),
            style = MaterialTheme.typography.bodySmall,
            color = Palette.Muted,
            maxLines = 1,
        )
    }
}
