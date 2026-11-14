package io.github.zekurio.matinee.ui.components

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.WatchedAt
import io.github.zekurio.matinee.ui.kit.ButtonLook
import io.github.zekurio.matinee.ui.kit.Calendar
import io.github.zekurio.matinee.ui.kit.Dialog
import io.github.zekurio.matinee.ui.kit.DialogButton
import io.github.zekurio.matinee.ui.kit.Lucide
import io.github.zekurio.matinee.ui.kit.Sheet
import io.github.zekurio.matinee.ui.kit.SheetHeader
import io.github.zekurio.matinee.ui.kit.SheetItem
import io.github.zekurio.matinee.ui.kit.rememberSheetState
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset
import kotlinx.coroutines.launch

/**
 * Someone marking [name] watched, to be asked when, as the web's tick and
 * menus ask, after Trakt: just now, on the release date, on a day they
 * pick, or some time they don't remember. [mark] gets the contract's
 * `watchedAt`, null for now.
 */
class WatchedAsk(val name: String, val mark: suspend (watchedAt: String?) -> Unit)

/** The question, as a sheet of the three answers; the third opens a calendar. */
@Composable
internal fun WatchedAtSheet(ask: WatchedAsk, onDone: () -> Unit) {
    val actions = LocalActions.current
    val snackbar = LocalSnackbar.current
    val failure = stringResource(R.string.media_mark_watched_failed)
    val sheet = rememberSheetState()
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
    Sheet(onDismissRequest = onDone, state = sheet) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(vertical = 12.dp)) {
            SheetHeader(stringResource(R.string.media_mark_watched), ask.name)
            SheetItem(Lucide.Clock, stringResource(R.string.media_watched_at_now)) {
                mark(null)
                hide(onDone)
            }
            SheetItem(Lucide.Calendar, stringResource(R.string.media_watched_at_released)) {
                mark(WatchedAt.RELEASED)
                hide(onDone)
            }
            SheetItem(Lucide.CalendarClock, stringResource(R.string.media_watched_at_other)) {
                hide { picking = true }
            }
            SheetItem(Lucide.CalendarOff, stringResource(R.string.media_watched_at_unknown)) {
                mark(WatchedAt.UNKNOWN)
                hide(onDone)
            }
        }
    }
}

/** A calendar up to today, starting on today, as the web's watched-date form. */
@Composable
private fun WatchedDatePicker(onPick: (String) -> Unit, onDismiss: () -> Unit) {
    val today = remember { LocalDate.now() }
    var day by rememberSaveable { mutableStateOf(today) }
    Dialog(
        onDismissRequest = onDismiss,
        title = stringResource(R.string.media_watched_date_title),
        footer = {
            DialogButton(
                stringResource(R.string.media_mark_watched),
                // The day as midnight UTC, which is how watchedAtOn reads it.
                { onPick(watchedAtOn(day.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli())) },
                look = ButtonLook.Primary,
            )
            DialogButton(stringResource(R.string.common_cancel), onDismiss)
        },
    ) {
        Calendar(day, { day = it }, Modifier.align(Alignment.CenterHorizontally), latest = today)
    }
}

/**
 * When on the picked day to say the user watched: noon, as the server does
 * for a release date, so the play lands on that day in nearly every zone.
 * Today is now, since noon may not have come yet.
 */
internal fun watchedAtOn(utcMillis: Long): String {
    val day = Instant.ofEpochMilli(utcMillis).atZone(ZoneOffset.UTC).toLocalDate()
    val noon = day.atTime(12, 0).atZone(ZoneId.systemDefault()).toInstant()
    return minOf(noon, Instant.now()).toString()
}
