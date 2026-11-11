package io.github.zekurio.matinee.ui.tv

import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester

/** A choice in a [TvOptionsPanel]: [detail] at its end, like a count; [selected] is the one in force. */
class TvOption(val key: String, val label: String, val detail: String? = null, val selected: Boolean = false)

/**
 * A [TvSidePanel] to pick one of [options] while [open], as a sort or a
 * filter, focus starting on the selected one. [onPick] gets the option,
 * [onClose] runs on Back, and both should close it; [returnFocus] then
 * puts focus back on what opened it. While [loading], a spinner instead
 * of the options.
 */
@Composable
fun TvOptionsPanel(
    open: Boolean,
    title: String,
    options: List<TvOption>,
    onPick: (TvOption) -> Unit,
    onClose: () -> Unit,
    returnFocus: () -> Unit,
    loading: Boolean = false,
) {
    val first = remember { FocusRequester() }
    val selected = options.indexOfFirst { it.selected }.coerceAtLeast(0)
    TvSidePanel(
        open,
        title,
        onBack = onClose,
        returnFocus = returnFocus,
        initial = first,
        initialIndex = selected,
        loading = loading,
    ) {
        itemsIndexed(options, key = { _, option -> option.key }) { index, option ->
            TvListItem(
                option.label,
                onClick = { onPick(option) },
                modifier = if (index == selected) Modifier.focusRequester(first) else Modifier,
                quiet = true,
                checked = option.selected,
                trailing = option.detail?.let { detail -> { TvListValue(detail, chevron = false) } },
            )
        }
    }
}
