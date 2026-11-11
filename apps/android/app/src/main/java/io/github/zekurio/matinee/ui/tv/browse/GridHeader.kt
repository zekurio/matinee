package io.github.zekurio.matinee.ui.tv.browse

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.ui.theme.Palette
import io.github.zekurio.matinee.ui.tv.TvButtons
import io.github.zekurio.matinee.ui.tv.TvPage
import io.github.zekurio.matinee.ui.tv.TvTitleGrid
import io.github.zekurio.matinee.ui.tv.TvType

/** Clear of the clock at the top right. */
private val CLOCK_ROOM = 140.dp

/** The key a grid page's controls have in its focus memory. */
internal const val CONTROLS = "controls"

/**
 * The top of a grid page: its [title] with [detail] after it, like a
 * count, and a row of [controls] under them. It's the [TvTitleGrid]'s
 * header, which puts the focused card's name and facts under it.
 */
@Composable
internal fun GridHeader(title: String, detail: String?, controls: @Composable RowScope.() -> Unit) {
    Column(Modifier.fillMaxWidth().padding(start = TvPage.Start)) {
        Row(Modifier.padding(end = TvPage.End + CLOCK_ROOM), horizontalArrangement = Arrangement.spacedBy(16.dp)) {
            Text(
                title,
                style = TvType.Headline,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.alignByBaseline().weight(1f, fill = false),
            )
            if (detail != null) Text(detail, style = TvType.Facts, color = Palette.Muted, maxLines = 1, modifier = Modifier.alignByBaseline())
        }
        Row(
            Modifier.padding(top = 16.dp, end = TvPage.End).height(TvButtons.Height),
            horizontalArrangement = Arrangement.spacedBy(14.dp),
            verticalAlignment = Alignment.CenterVertically,
            content = controls,
        )
    }
}
