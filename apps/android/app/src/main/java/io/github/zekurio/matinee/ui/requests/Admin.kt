package io.github.zekurio.matinee.ui.requests

import android.content.res.Resources
import android.text.format.DateUtils
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.AdminRequestItem
import io.github.zekurio.matinee.api.Availability
import io.github.zekurio.matinee.api.DeclineReason
import io.github.zekurio.matinee.api.FulfilmentState
import io.github.zekurio.matinee.api.RequestStatus
import io.github.zekurio.matinee.api.ShowScope
import io.github.zekurio.matinee.api.WaitingDeclineReason
import io.github.zekurio.matinee.api.isAdmin
import io.github.zekurio.matinee.ui.LocalNavigator
import io.github.zekurio.matinee.ui.LocalUser
import io.github.zekurio.matinee.ui.Navigator
import io.github.zekurio.matinee.ui.TopBar
import io.github.zekurio.matinee.ui.components.ErrorBox
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.components.PosterArt
import io.github.zekurio.matinee.ui.components.art
import io.github.zekurio.matinee.ui.downloads.RadioRow
import io.github.zekurio.matinee.ui.kit.ButtonLook
import io.github.zekurio.matinee.ui.kit.Chip
import io.github.zekurio.matinee.ui.kit.Gap
import io.github.zekurio.matinee.ui.kit.Gutter
import io.github.zekurio.matinee.ui.kit.Lucide
import io.github.zekurio.matinee.ui.kit.LucideIcon
import io.github.zekurio.matinee.ui.kit.MatineeButton
import io.github.zekurio.matinee.ui.kit.MatineeTextField
import io.github.zekurio.matinee.ui.kit.RoundIconButton
import io.github.zekurio.matinee.ui.kit.Sheet
import io.github.zekurio.matinee.ui.kit.SheetHeader
import io.github.zekurio.matinee.ui.kit.SheetItem
import io.github.zekurio.matinee.ui.kit.Spinner
import io.github.zekurio.matinee.ui.kit.rememberSheetCloser
import io.github.zekurio.matinee.ui.kit.rememberSheetState
import io.github.zekurio.matinee.ui.theme.Palette
import java.io.IOException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch

/*
 * An admin's side of requests on a phone: the way in from the profile,
 * with a dot while requests wait; Add and Decline on a title's page,
 * where Request sits, with who requested it behind a tap on the poster's
 * badge; and the queue, a list behind the profile as Downloads
 * has one. Each row is the poster, the title and what it is, who
 * requested it and where it goes, with Add or Retry at its end; a tap
 * opens its menu with the rest. The queue has the web's four lists,
 * Add, Decline with a reason, Add all, Retry, Give up, and on a declined
 * request in Done, Allow requests again and Add after all. Removing a
 * request, searching Done, "Goes to", and the keyboard are left to the
 * web.
 */

/** "2 hours ago", in the device's words. */
fun relativeTime(iso: String?): String? {
    val at = parseInstant(iso) ?: return null
    return DateUtils.getRelativeTimeSpanString(at.toEpochMilli(), System.currentTimeMillis(), DateUtils.MINUTE_IN_MILLIS).toString()
}

/** "1–4, 6": season numbers, runs of three or more as a range, as the web writes them. */
private fun seasonRuns(numbers: List<Int>): String {
    val runs = mutableListOf<String>()
    var start = 0
    for (index in 1..numbers.size) {
        val first = numbers[start]
        val last = numbers[index - 1]
        if (index < numbers.size && numbers[index] == last + 1) continue
        if (last - first >= 2) runs += "$first–$last" else (first..last).mapTo(runs) { it.toString() }
        start = index
    }
    return runs.joinToString(", ")
}

/** "Seasons 1–4 + new", for a show's request. */
fun adminScopeText(scope: ShowScope?, res: Resources): String? {
    if (scope == null) return null
    val numbers = scope.seasons.filter { it > 0 }.sorted()
    var seasons: String? = null
    if (numbers.isNotEmpty()) {
        seasons = res.getQuantityString(R.plurals.web_requests_scope_seasons, numbers.size, seasonRuns(numbers))
    }
    if (0 in scope.seasons) {
        seasons = seasons?.let { res.getString(R.string.web_requests_scope_specialsAnd, it) } ?: res.getString(R.string.web_requests_scope_specials)
    }
    if (seasons == null) return if (scope.future) res.getString(R.string.web_requests_scope_futureOnly) else null
    return if (scope.future) res.getString(R.string.web_requests_scope_andFuture, seasons) else seasons
}

/** Who requested it first, and everyone else who requested or follows it. */
private fun askers(item: AdminRequestItem): Pair<AdminRequestItem.Follower?, List<AdminRequestItem.Follower>> {
    val sorted = item.followers.sortedWith(compareByDescending<AdminRequestItem.Follower> { it.asked }.thenBy { it.createdAt })
    return sorted.firstOrNull() to sorted.drop(1)
}

/** A request's title: its library page once it's here, its catalog page while it isn't. */
private fun open(nav: Navigator, item: AdminRequestItem) {
    val here = item.availability.libraryTitleId
    if (here != null) nav.title(here) else nav.catalog(item.title.ref, item.library.id)
}

/** "Films · Radarr": where a request goes, and what fills it. */
private fun whereText(item: AdminRequestItem, res: Resources): String =
    listOf(item.library.name, item.connection?.name ?: res.getString(R.string.web_requests_noConnection)).joinToString(" · ")

/**
 * For an admin, the waiting request behind a title's or a season's
 * "Requested", from the queue the whole app streams. A season outside the
 * request, which only shares its id, has none. Null for anyone else and
 * while nothing waits; still there while an answer waits out its Undo, so
 * check [RequestsHub.held] before offering Add and Decline.
 */
@Composable
fun waitingRequest(availability: Availability): AdminRequestItem? {
    val hub = LocalRequests.current
    if (!LocalUser.current.isAdmin) return null
    val id = availability.requestId ?: return null
    if (availability.state != AvailabilityState.ASKED) return null
    return hub.queue?.waiting?.firstOrNull { it.id == id }
}

/**
 * Who requested it, for a tap on the poster's badge: "anna requested this
 * 2 days ago", or "anna and ben requested this", with what a show's
 * request covers on a line under it.
 */
fun requestedText(item: AdminRequestItem, res: Resources): String {
    val (first, rest) = askers(item)
    val who = when {
        first == null -> res.getString(R.string.web_requests_badge_waiting)
        rest.isEmpty() -> res.getString(R.string.web_requests_badge_requested, first.name, relativeTime(first.createdAt).orEmpty())
        else -> res.getString(R.string.web_requests_badge_requestedMany, formatList((listOf(first) + rest).map { it.name }, res))
    }
    return listOfNotNull(who, adminScopeText(item.scope, res)).joinToString("\n")
}

/**
 * An admin's Add for a waiting request, where everyone else's Request
 * sits and in its style, held for the snackbar's Undo as the queue holds
 * it. [page] draws it leading a catalog page's row, as large as Play.
 */
@Composable
fun AddButton(item: AdminRequestItem, modifier: Modifier = Modifier, page: Boolean = false) {
    val hub = LocalRequests.current
    MatineeButton(
        onClick = { hub.answer(item, QueueAnswer.Add) },
        modifier = modifier,
        height = if (page) 44.dp else 36.dp,
        contentPadding = if (page) PaddingValues(horizontal = 16.dp) else PaddingValues(horizontal = 10.dp),
    ) {
        LucideIcon(Lucide.Check, null, size = if (page) 16.dp else 14.dp)
        Text(
            stringResource(R.string.web_requests_add),
            style = if (page) MaterialTheme.typography.labelLarge else MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

/**
 * The quiet button beside [AddButton], opening the queue's Decline sheet:
 * [look] Ghost off a picture, Glass on one.
 */
@Composable
fun DeclineButton(item: AdminRequestItem, modifier: Modifier = Modifier, page: Boolean = false, look: ButtonLook = ButtonLook.Ghost) {
    val hub = LocalRequests.current
    var declining by remember { mutableStateOf(false) }
    MatineeButton(
        onClick = { declining = true },
        modifier = modifier,
        look = look,
        height = if (page) 44.dp else 36.dp,
        contentPadding = if (page) PaddingValues(horizontal = 16.dp) else PaddingValues(horizontal = 10.dp),
    ) {
        Text(
            stringResource(R.string.web_requests_decline),
            style = if (page) MaterialTheme.typography.labelLarge else MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.SemiBold,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
    if (declining) DeclineSheet(item, onDismiss = { declining = false }) { hub.answer(item, it) }
}

/**
 * Decline, with why: the reason, picked as a sheet's choices are, and a
 * note for whoever requested it. With [giveUp], the same sheet gives up
 * on an accepted request, its reason fixed as "Can't find a copy".
 */
@Composable
fun DeclineSheet(item: AdminRequestItem, onDismiss: () -> Unit, giveUp: Boolean = false, onAnswer: (QueueAnswer) -> Unit) {
    val res = LocalResources.current
    var reason by remember { mutableStateOf<String?>(null) }
    var note by remember { mutableStateOf("") }
    val askedBy = item.followers.filter { it.asked }.map { it.name }
    val title = if (giveUp) R.string.web_requests_giveUp_title else R.string.web_requests_decline_title
    AskSheet(stringResource(title, item.title.name), onDismiss) { close ->
        Text(stringResource(R.string.web_requests_decline_reason), style = MaterialTheme.typography.labelLarge, color = Palette.Muted)
        // The sheet pads its content; the choices run to its edges, as a sheet's rows do.
        Column(Modifier.bleed(20.dp)) {
            if (giveUp) {
                // Only one reason fits giving up, so it's said, not offered.
                RadioRow(reasonLabel(DeclineReason.NOT_FOUND), null, true) {}
            } else {
                WaitingDeclineReason.all.forEach { code ->
                    RadioRow(reasonLabel(code), null, reason == code) { reason = code }
                }
            }
        }
        // The note's name sits above it, as the reason's does.
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(
                if (askedBy.isEmpty()) stringResource(R.string.web_requests_decline_note)
                else res.getString(R.string.web_requests_decline_noteFor, formatList(askedBy, res)),
                style = MaterialTheme.typography.labelLarge,
                color = Palette.Muted,
            )
            MatineeTextField(
                value = note,
                onValueChange = { note = it },
                placeholder = stringResource(R.string.web_requests_decline_notePlaceholder),
                modifier = Modifier.fillMaxWidth(),
            )
        }
        if (giveUp) {
            Text(
                // A by-hand connection holds nothing to keep.
                item.connection?.takeIf { it.reportsProgress }?.name?.let { res.getString(R.string.web_requests_giveUp_keeps, it) }
                    ?: stringResource(R.string.web_requests_giveUp_turnsUp),
                style = MaterialTheme.typography.bodySmall,
                color = Palette.Muted,
            )
        }
        MatineeButton(
            onClick = {
                val text = note.trim().ifEmpty { null }
                if (giveUp) {
                    close { onAnswer(QueueAnswer.GiveUp(text)) }
                } else {
                    val code = reason ?: return@MatineeButton
                    close { onAnswer(QueueAnswer.Decline(code, text)) }
                }
            },
            enabled = giveUp || reason != null,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(stringResource(if (giveUp) R.string.web_requests_giveUp_submit else R.string.web_requests_decline_submit))
        }
    }
}

/** Wider than the parent's padding by [by] on each side, for rows that run to a sheet's edges. */
private fun Modifier.bleed(by: Dp) = layout { measurable, constraints ->
    val extra = by.roundToPx()
    val placeable = measurable.measure(
        constraints.copy(minWidth = constraints.minWidth + extra * 2, maxWidth = constraints.maxWidth + extra * 2),
    )
    layout(placeable.width - extra * 2, placeable.height) { placeable.place(-extra, 0) }
}

@Composable
private fun reasonLabel(code: String): String = adminReasonText(code, LocalResources.current)

private val LISTS = listOf("waiting", "needsAttention", "onTheWay", "done")

/** Done comes a page at a time from its own call, newest first. */
private class DonePages {
    val items = mutableStateListOf<AdminRequestItem>()
    var cursor by mutableStateOf<String?>(null)
    var loaded by mutableStateOf(false)
    var loading by mutableStateOf(false)
    var error by mutableStateOf<String?>(null)
}

/**
 * The admin's requests: Waiting, Needs attention, On the way, and Done,
 * live from the stream the whole app follows.
 */
@Composable
fun RequestsScreen(start: String) {
    val api = LocalApi.current
    val hub = LocalRequests.current
    val res = LocalResources.current
    var list by rememberSaveable { mutableStateOf(start.takeIf { it in LISTS } ?: "waiting") }
    val queue = hub.queue
    val done = remember { DonePages() }
    val scope = rememberCoroutineScope()
    val loadDone = {
        if (!done.loading) {
            done.loading = true
            scope.launch {
                try {
                    val page = api.admin.requests.queue(cursor = done.cursor, limit = 20)
                    done.items.addAll(page.done.filter { new -> done.items.none { it.id == new.id } })
                    done.cursor = page.nextCursor
                    done.loaded = true
                    done.error = null
                } catch (e: CancellationException) {
                    throw e
                } catch (e: IOException) {
                    done.error = e.message
                } finally {
                    done.loading = false
                }
            }
        }
    }
    var menu by remember { mutableStateOf<AdminRequestItem?>(null) }
    var declining by remember { mutableStateOf<AdminRequestItem?>(null) }
    var givingUp by remember { mutableStateOf<AdminRequestItem?>(null) }
    Column(Modifier.fillMaxSize()) {
        TopBar(stringResource(R.string.web_requests_title))
        if (queue == null) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Spinner(size = 32.dp, color = Palette.Accent) }
            return@Column
        }
        val counts = mapOf(
            "waiting" to queue.waiting.count { it.id !in hub.held },
            "needsAttention" to queue.counts.needsAttention,
            "onTheWay" to queue.counts.onTheWay,
            "done" to queue.counts.done,
        )
        LazyRow(
            contentPadding = PaddingValues(horizontal = Gutter),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.padding(bottom = 8.dp),
        ) {
            items(LISTS) { key ->
                val count = counts[key] ?: 0
                val label = listLabel(key, res)
                Chip(if (key != "done" && count > 0) "$label $count" else label, list == key, { list = key })
            }
        }
        val rows = when (list) {
            "waiting" -> queue.waiting.filter { it.id !in hub.held }
            "needsAttention" -> queue.needsAttention
            "onTheWay" -> queue.onTheWay
            else -> done.items
        }
        if (list == "done" && !done.loaded) {
            if (done.error != null) {
                ErrorBox(stringResource(R.string.web_requests_loadFailed, done.error.orEmpty()), null, { loadDone() })
            } else {
                LaunchedEffect(Unit) { loadDone() }
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Spinner(size = 32.dp, color = Palette.Accent) }
            }
            return@Column
        }
        if (rows.isEmpty()) {
            Empty(list)
            return@Column
        }
        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = PaddingValues(start = Gutter, end = Gutter, bottom = 24.dp),
        ) {
            if (list == "waiting" && rows.size > 1) {
                item(key = "all") {
                    MatineeButton(
                        onClick = { hub.answerAll(rows) },
                        look = ButtonLook.Outline,
                        height = 40.dp,
                        modifier = Modifier.fillMaxWidth().padding(bottom = 4.dp),
                    ) {
                        LucideIcon(Lucide.ListChecks, null, size = 16.dp)
                        Text(res.getQuantityString(R.plurals.web_requests_addAll, rows.size, rows.size))
                    }
                }
            }
            rows.forEachIndexed { index, item ->
                item(key = item.id) {
                    Column {
                        if (index > 0) HorizontalDivider(color = Palette.Border)
                        QueueRow(item, list) { menu = item }
                    }
                }
            }
            // The next page of Done comes in as its end shows, as the web's lists load.
            if (list == "done" && done.cursor != null) {
                item(key = "more") {
                    LaunchedEffect(done.cursor) { if (done.error == null) loadDone() }
                    Box(Modifier.fillMaxWidth().padding(vertical = 16.dp), contentAlignment = Alignment.Center) {
                        if (done.error != null) {
                            MatineeButton(onClick = { done.error = null; loadDone() }, look = ButtonLook.Outline, height = 40.dp) {
                                Text(stringResource(R.string.web_requests_reload))
                            }
                        } else {
                            Spinner(size = 24.dp, color = Palette.Accent)
                        }
                    }
                }
            }
            item(key = "bottom") { Box(Modifier.navigationBarsPadding()) }
        }
    }
    menu?.let { item ->
        RowMenu(item, list, onDismiss = { menu = null }, onDecline = { declining = item }, onGiveUp = { givingUp = item }) { answer ->
            hub.answer(item, answer)
            // Done is read page by page, so an answered row leaves it here.
            done.items.removeAll { it.id == item.id }
        }
    }
    declining?.let { item -> DeclineSheet(item, onDismiss = { declining = null }) { hub.answer(item, it) } }
    givingUp?.let { item -> DeclineSheet(item, onDismiss = { givingUp = null }, giveUp = true) { hub.answer(item, it) } }
}

private fun listLabel(key: String, res: Resources): String = res.getString(
    when (key) {
        "waiting" -> R.string.web_requests_list_waiting
        "needsAttention" -> R.string.web_requests_list_needsAttention
        "onTheWay" -> R.string.web_requests_list_onTheWay
        else -> R.string.web_requests_list_done
    },
)

@Composable
private fun Empty(list: String) {
    val title = when (list) {
        "waiting" -> R.string.web_requests_empty_waiting
        "needsAttention" -> R.string.web_requests_empty_needsAttention
        "onTheWay" -> R.string.web_requests_empty_onTheWay
        else -> R.string.web_requests_empty_done
    }
    Column(Modifier.fillMaxWidth().padding(horizontal = 32.dp, vertical = 48.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        LucideIcon(Lucide.Inbox, null, size = 28.dp, tint = Palette.Muted)
        Gap(12.dp)
        Text(stringResource(title), style = MaterialTheme.typography.titleMedium)
    }
}

/**
 * A request in the queue, as Downloads lists files: the poster, then the
 * title and what it is, then who requested it and where it goes, or how
 * it stands; Add or Retry at the end. A tap opens its menu.
 */
@Composable
private fun QueueRow(item: AdminRequestItem, list: String, onMenu: () -> Unit) {
    val api = LocalApi.current
    val hub = LocalRequests.current
    val res = LocalResources.current
    val (first, rest) = askers(item)
    val small = MaterialTheme.typography.bodySmall
    Row(
        Modifier.fillMaxWidth().clickable(onClickLabel = stringResource(R.string.web_requests_more, item.title.name), onClick = onMenu)
            .padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.width(40.dp)) { PosterArt(item.title.name, api.art(item.title.poster)) }
        Column(Modifier.weight(1f)) {
            Text(item.title.name, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                listOfNotNull(yearKind(item.title.year, item.title.ref.kind, res), adminScopeText(item.scope, res)).joinToString(" · "),
                style = small,
                color = Palette.Muted,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            when (list) {
                "waiting" -> {
                    val who = first?.let {
                        listOfNotNull(
                            it.name + if (rest.isNotEmpty()) " " + res.getString(R.string.web_requests_othersCount, rest.size.toString()) else "",
                            relativeTime(it.createdAt),
                        ).joinToString(" · ")
                    }
                    Text(
                        listOfNotNull(who, item.library.name).joinToString(" · "),
                        style = small,
                        color = Palette.Foreground.copy(alpha = 0.85f),
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    if (item.connection == null) Text(stringResource(R.string.web_requests_noConnection), style = small, color = Palette.Danger, maxLines = 1)
                }
                "needsAttention" -> Text(
                    item.error ?: res.getString(R.string.web_requests_attention_unknown),
                    style = small,
                    color = Palette.Danger,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                "onTheWay" -> Progress(item)
                else -> Outcome(item)
            }
        }
        when (list) {
            "waiting" -> MatineeButton(
                onClick = { hub.answer(item, QueueAnswer.Add) },
                look = ButtonLook.Outline,
                height = 36.dp,
                contentPadding = PaddingValues(horizontal = 12.dp),
            ) {
                LucideIcon(Lucide.Check, null, size = 16.dp)
                Text(stringResource(R.string.web_requests_add), style = MaterialTheme.typography.labelLarge)
            }
            "needsAttention" -> RoundIconButton(
                Lucide.RotateCw,
                stringResource(R.string.web_requests_retryNamed, item.title.name),
                { hub.retry(item) },
                size = 40.dp,
                iconSize = 18.dp,
                tint = Palette.Muted,
                background = Color.Transparent,
            )
        }
    }
}

/** A row's menu: what the list allows, and its title's page. */
@Composable
private fun RowMenu(
    item: AdminRequestItem,
    list: String,
    onDismiss: () -> Unit,
    onDecline: () -> Unit,
    onGiveUp: () -> Unit,
    onReopen: (QueueAnswer) -> Unit,
) {
    val nav = LocalNavigator.current
    val hub = LocalRequests.current
    val res = LocalResources.current
    val sheet = rememberSheetState()
    val close = rememberSheetCloser(sheet, onDismiss)
    Sheet(onDismissRequest = onDismiss, state = sheet) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(vertical = 12.dp)) {
            SheetHeader(item.title.name, whereText(item, res))
            when (list) {
                "waiting" -> {
                    SheetItem(Lucide.Check, stringResource(R.string.web_requests_add)) { close { hub.answer(item, QueueAnswer.Add) } }
                    SheetItem(Lucide.X, stringResource(R.string.web_requests_decline)) { close(onDecline) }
                }
                "needsAttention" -> {
                    SheetItem(Lucide.RotateCw, stringResource(R.string.web_requests_retry)) { close { hub.retry(item) } }
                    SheetItem(Lucide.CircleSlash, stringResource(R.string.web_requests_giveUp)) { close(onGiveUp) }
                }
                "onTheWay" -> SheetItem(Lucide.CircleSlash, stringResource(R.string.web_requests_giveUp)) { close(onGiveUp) }
                else -> if (item.status == RequestStatus.DECLINED) {
                    SheetItem(Lucide.Check, stringResource(R.string.web_requests_addAfterAll)) { close { onReopen(QueueAnswer.AddAfterAll) } }
                    SheetItem(Lucide.LockOpen, stringResource(R.string.web_requests_allowAgain)) { close { onReopen(QueueAnswer.AllowAgain) } }
                }
            }
            SheetItem(Lucide.Info, stringResource(R.string.web_requests_openTitle)) { close { open(nav, item) } }
        }
    }
}

/** How far along a request on its way is. */
@Composable
private fun Progress(item: AdminRequestItem) {
    val res = LocalResources.current
    val availability = item.availability
    val progress = availability.progress
    val status = when {
        availability.state == AvailabilityState.RELEASE -> parseDay(availability.releaseDate)
            ?.let { res.getString(R.string.web_requests_progress_release, formatShortDay(it, res)) }
            ?: res.getString(R.string.web_requests_progress_notOut)
        progress != null -> listOfNotNull(
            formatPercent(progress, res),
            availability.etaSeconds?.let { res.getString(R.string.web_requests_progress_left, formatSpan(it, res)) },
        ).joinToString(" · ")
        availability.stillLooking -> res.getString(R.string.web_requests_progress_looking)
        item.fulfilmentState == FulfilmentState.QUEUED -> res.getString(R.string.web_requests_progress_queued)
        item.connection?.reportsProgress == false -> res.getString(R.string.web_requests_progress_byHand)
        else -> res.getString(R.string.web_requests_progress_sent)
    }
    if (progress != null) {
        Box(Modifier.padding(vertical = 3.dp).fillMaxWidth().height(3.dp).clip(CircleShape).background(Palette.Secondary)) {
            Box(Modifier.fillMaxWidth(progress.toFloat().coerceIn(0f, 1f)).fillMaxHeight().clip(CircleShape).background(Palette.Accent))
        }
    }
    Text(
        listOf(status, item.library.name).joinToString(" · "),
        style = MaterialTheme.typography.bodySmall,
        color = Palette.Foreground.copy(alpha = 0.85f),
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
    )
}

/** What became of a done request, with the note an admin left: arrived, declined, or given up on. */
@Composable
private fun Outcome(item: AdminRequestItem) {
    val res = LocalResources.current
    val small = MaterialTheme.typography.bodySmall
    if (item.status == RequestStatus.DECLINED) {
        val gaveUp = item.reason == DeclineReason.NOT_FOUND
        val line = listOfNotNull(
            relativeTime(item.declinedAt)?.let {
                res.getString(if (gaveUp) R.string.web_requests_done_gaveUp else R.string.web_requests_done_declined, it)
            } ?: res.getString(if (gaveUp) R.string.web_requests_done_gaveUpUndated else R.string.web_requests_done_declinedUndated),
            item.reason?.let { reasonLabel(it) },
        ).joinToString(" · ")
        Text(line, style = small, color = Palette.Foreground.copy(alpha = 0.85f), maxLines = 1, overflow = TextOverflow.Ellipsis)
        item.note?.let { Text(it, style = small, fontStyle = FontStyle.Italic, color = Palette.Muted, maxLines = 1, overflow = TextOverflow.Ellipsis) }
        return
    }
    relativeTime(item.arrivedAt)?.let {
        Text(
            listOf(res.getString(R.string.web_requests_done_arrived, it), item.library.name).joinToString(" · "),
            style = small,
            color = Palette.Foreground.copy(alpha = 0.85f),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}
