package io.github.zekurio.matinee.ui.requests

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.api.Availability
import io.github.zekurio.matinee.api.isAdmin
import io.github.zekurio.matinee.ui.LocalUser
import io.github.zekurio.matinee.ui.components.LocalSnackbar
import io.github.zekurio.matinee.ui.kit.ButtonLook
import io.github.zekurio.matinee.ui.kit.Lucide
import io.github.zekurio.matinee.ui.kit.LucideIcon
import io.github.zekurio.matinee.ui.kit.MatineeButton
import io.github.zekurio.matinee.ui.kit.ProgressRing
import io.github.zekurio.matinee.ui.theme.Palette
import java.time.LocalDate
import kotlinx.coroutines.launch

/*
 * A title's state and the one thing its viewer may do about it, on its
 * poster, as the web's poster-request.tsx has them: the state as a glass
 * badge in the corner, the action as a button along the lower edge over
 * a soft shade. A Request that can't be pressed stays, dimmed, and a tap
 * says why, with the admin's answer when he declined it. No sheet tells
 * the story so far.
 */

/**
 * The state as a glass pill in a poster's corner: the card badge's glyph
 * with its word, and the share that's in while it's on its way. Nothing
 * for a title nobody requested. With [tip], for an admin who requested
 * it, a tap says it at the bottom of the screen, as the web's tooltip
 * does, and screen readers read it with the state.
 */
@Composable
fun PosterBadge(availability: Availability, modifier: Modifier = Modifier, tip: String? = null) {
    val res = LocalResources.current
    val snackbar = LocalSnackbar.current
    val scope = rememberCoroutineScope()
    val word = stateWord(availability, LocalDate.now()) ?: return
    val badge = badgeOf(availability) ?: return
    Row(
        modifier
            .heightIn(min = 28.dp)
            .clip(CircleShape)
            .then(
                if (tip == null) {
                    Modifier
                } else {
                    Modifier
                        .semantics { stateDescription = tip }
                        .clickable {
                            scope.launch {
                                snackbar.currentSnackbarData?.dismiss()
                                snackbar.showSnackbar(tip)
                            }
                        }
                },
            )
            .background(Palette.Background.copy(alpha = 0.75f))
            .border(1.dp, Palette.Foreground.copy(alpha = 0.1f), CircleShape)
            .padding(horizontal = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        when (badge.glyph) {
            Glyph.Clock -> LucideIcon(Lucide.Clock, null, size = 14.dp)
            Glyph.Calendar -> LucideIcon(Lucide.Calendar, null, size = 14.dp)
            Glyph.Slash -> LucideIcon(Lucide.CircleSlash, null, size = 14.dp, tint = Palette.Muted)
            Glyph.Ring -> ProgressRing(badge.progress, size = 18.dp)
        }
        Text(
            stateText(word, res),
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.Medium,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f, fill = false),
        )
        val progress = availability.progress
        if (availability.state == AvailabilityState.COMING && progress != null) {
            Text(formatPercent(progress, res), style = MaterialTheme.typography.labelMedium, color = Palette.Foreground.copy(alpha = 0.75f), maxLines = 1)
        }
    }
}

/**
 * The title's one button: "Request" or "Cancel request", whichever the
 * server's action allows, else nothing. Cancelling happens here; a
 * request goes to [onRequest], which requests at once or opens the
 * request sheet. A Request the viewer
 * can't make, out of requests, with requests off, or declined, stays
 * dimmed, and a tap says why at the bottom of the screen ([dimmedText]),
 * as the web's tooltip does. [plain] draws it off a picture, as an
 * ordinary button rather than glass; [page] draws it leading a catalog
 * page's row, as large as Play is in a library title's.
 */
@Composable
fun PosterActionButton(
    availability: Availability,
    name: String,
    onRequest: () -> Unit,
    modifier: Modifier = Modifier,
    busy: Boolean = false,
    action: PosterAction? = null,
    label: String? = null,
    plain: Boolean = false,
    page: Boolean = false,
) {
    val hub = LocalRequests.current
    val res = LocalResources.current
    val snackbar = LocalSnackbar.current
    val scope = rememberCoroutineScope()
    val blocked = action == null && requestBlocked(availability) != null
    val act = action ?: posterAction(availability) ?: PosterAction.Request.takeIf { blocked } ?: return
    val id = availability.requestId
    val admin = LocalUser.current.isAdmin
    val why = if (blocked) dimmedText(availability, res, admin)?.takeIf { it.isNotBlank() } else null
    MatineeButton(
        onClick = {
            if (blocked) {
                if (why != null) {
                    scope.launch {
                        snackbar.currentSnackbarData?.dismiss()
                        snackbar.showSnackbar(why)
                    }
                }
                return@MatineeButton
            }
            when (act) {
                PosterAction.Request -> onRequest()
                PosterAction.Cancel -> id?.let { hub.cancel(it, name) }
            }
        },
        modifier = if (why != null) modifier.semantics { stateDescription = why } else modifier,
        look = when {
            act == PosterAction.Request -> ButtonLook.Primary
            plain || page -> ButtonLook.Secondary
            else -> ButtonLook.Glass
        },
        enabled = !busy,
        dimmed = busy || blocked,
        height = if (page) 44.dp else 36.dp,
        contentPadding = if (page) PaddingValues(horizontal = 16.dp) else PaddingValues(horizontal = 10.dp, vertical = 6.dp),
    ) {
        val icon = when (act) {
            PosterAction.Request -> Lucide.Plus
            PosterAction.Cancel -> Lucide.X
        }
        LucideIcon(icon, null, size = if (page) 16.dp else 14.dp)
        Text(
            label?.takeIf { act == PosterAction.Request } ?: posterActionText(act, res),
            style = if (page) MaterialTheme.typography.labelLarge else MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.SemiBold,
            textAlign = TextAlign.Center,
            maxLines = if (page) 1 else 2,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f, fill = false),
        )
    }
}
