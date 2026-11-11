package io.github.zekurio.matinee.ui.tv

import android.text.format.DateFormat
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import io.github.zekurio.matinee.ui.theme.Palette
import java.util.Date
import kotlinx.coroutines.delay

/** The time at the top right of every TV page, in the device's 12 or 24 hour style. */
@Composable
fun TvClock(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }
    LaunchedEffect(Unit) {
        while (true) {
            now = System.currentTimeMillis()
            // Wake at the turn of the next minute.
            delay(60_000 - now % 60_000)
        }
    }
    val format = remember(context) { DateFormat.getTimeFormat(context) }
    Text(format.format(Date(now)), style = TvType.Clock, color = Palette.Foreground.copy(alpha = 0.9f), modifier = modifier)
}
