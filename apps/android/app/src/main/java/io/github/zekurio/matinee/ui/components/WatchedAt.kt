package io.github.zekurio.matinee.ui.components

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDefaults
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.SelectableDates
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.WATCHED_RELEASED
import io.github.zekurio.matinee.ui.theme.Palette
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset
import kotlinx.coroutines.launch

/**
 * Someone marking [name] watched, to be asked when, as the web's tick and
 * menus ask, after Trakt: just now, on the release date, or on a day they
 * pick. [mark] gets the contract's `watchedAt`, null for now.
 */
class WatchedAsk(val name: String, val mark: suspend (watchedAt: String?) -> Unit)

/** The question, as a sheet of the three answers; the third opens a calendar. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun WatchedAtSheet(ask: WatchedAsk, onDone: () -> Unit) {
    val actions = LocalActions.current
    val snackbar = LocalSnackbar.current
    val failure = stringResource(R.string.media_mark_watched_failed)
    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    val scope = rememberCoroutineScope()
    var picking by remember { mutableStateOf(false) }
    // The mark outlives the sheet, so it runs in the app's scope.
    val mark = { watchedAt: String? -> actions.scope.launchShowing(snackbar, failure) { ask.mark(watchedAt) } }
    val hide = { then: () -> Unit ->
        scope.launch { sheet.hide() }.invokeOnCompletion { then() }
        Unit
    }

    if (picking) {
        WatchedDatePicker(
            onPick = {
                mark(it)
                onDone()
            },
            onDismiss = onDone,
        )
        return
    }
    ModalBottomSheet(onDismissRequest = onDone, sheetState = sheet, containerColor = Palette.Raised, dragHandle = null) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(vertical = 12.dp)) {
            SheetHeader(stringResource(R.string.media_mark_watched), ask.name)
            SheetItem(Lucide.Clock, stringResource(R.string.media_watched_at_now)) {
                mark(null)
                hide(onDone)
            }
            SheetItem(Lucide.Calendar, stringResource(R.string.media_watched_at_released)) {
                mark(WATCHED_RELEASED)
                hide(onDone)
            }
            SheetItem(Lucide.CalendarClock, stringResource(R.string.media_watched_at_other)) {
                hide { picking = true }
            }
        }
    }
}

/** A calendar up to today, starting on today, as the web's watched-date form. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun WatchedDatePicker(onPick: (String) -> Unit, onDismiss: () -> Unit) {
    val today = remember { LocalDate.now() }
    // The picker counts days as midnight UTC.
    val todayMillis = remember(today) { today.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli() }
    val state = rememberDatePickerState(
        initialSelectedDateMillis = todayMillis,
        selectableDates = object : SelectableDates {
            override fun isSelectableDate(utcTimeMillis: Long) = utcTimeMillis <= todayMillis

            override fun isSelectableYear(year: Int) = year <= today.year
        },
    )
    val colors = DatePickerDefaults.colors(containerColor = Palette.Raised)
    DatePickerDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            TextButton(
                onClick = { state.selectedDateMillis?.let { onPick(watchedAtOn(it)) } },
                enabled = state.selectedDateMillis != null,
            ) { Text(stringResource(R.string.media_mark_watched)) }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text(stringResource(R.string.common_cancel), color = Palette.Foreground) }
        },
        colors = colors,
    ) {
        DatePicker(
            state,
            colors = colors,
            title = {
                Text(
                    stringResource(R.string.media_watched_date_title),
                    style = MaterialTheme.typography.titleMedium,
                    modifier = Modifier.padding(start = 24.dp, end = 12.dp, top = 16.dp),
                )
            },
        )
    }
}

/**
 * When on the picked day to say the user watched: noon, as the server does
 * for a release date, so the play lands on that day in nearly every zone.
 * Today is now, since noon may not have come yet.
 */
private fun watchedAtOn(utcMillis: Long): String {
    val day = Instant.ofEpochMilli(utcMillis).atZone(ZoneOffset.UTC).toLocalDate()
    val noon = day.atTime(12, 0).atZone(ZoneId.systemDefault()).toInstant()
    return minOf(noon, Instant.now()).toString()
}
