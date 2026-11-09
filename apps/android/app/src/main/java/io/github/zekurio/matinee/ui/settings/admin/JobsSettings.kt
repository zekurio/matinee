package io.github.zekurio.matinee.ui.settings.admin

import android.content.res.Resources
import android.text.format.DateUtils
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalResources
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.admin.JobQueue
import io.github.zekurio.matinee.api.admin.ScheduledTask
import io.github.zekurio.matinee.api.admin.jobs
import io.github.zekurio.matinee.api.admin.queueAction
import io.github.zekurio.matinee.api.admin.setConcurrency
import io.github.zekurio.matinee.api.admin.taskAction
import io.github.zekurio.matinee.ui.Load
import io.github.zekurio.matinee.ui.components.Gap
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.components.Lucide
import io.github.zekurio.matinee.ui.components.LucideIcon
import io.github.zekurio.matinee.ui.components.RoundIconButton
import io.github.zekurio.matinee.ui.components.SheetHeader
import io.github.zekurio.matinee.ui.components.SheetItem
import io.github.zekurio.matinee.ui.rememberLoader
import io.github.zekurio.matinee.ui.settings.Panel
import io.github.zekurio.matinee.ui.settings.RowDivider
import io.github.zekurio.matinee.ui.settings.Section
import io.github.zekurio.matinee.ui.settings.SettingsScaffold
import io.github.zekurio.matinee.ui.theme.Palette
import java.time.Instant
import kotlinx.coroutines.delay

/** How often the page asks again while it shows, as the web polls its panel. */
private const val POLL_MILLIS = 2_000L

/**
 * Background work, as the web's jobs panel: one list of the queues, how
 * busy each is, and the scheduled task that fills it, then the tasks that
 * fill none and do their upkeep themselves. A queue's sheet pauses it,
 * clears what waits, and sets how many jobs it runs at once; a task runs
 * now or stops from its row. The page keeps itself current while it shows.
 */
@Composable
fun JobsSettings() {
    val api = LocalApi.current
    val loader = rememberLoader("admin-jobs") { jobs() }
    val saver = rememberSaver()
    var open by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(loader) {
        while (true) {
            delay(POLL_MILLIS)
            loader.reload()
        }
    }
    SettingsScaffold(stringResource(R.string.settings_admin_jobs)) {
        loaded(loader, { stringResource(R.string.web_jobs_loadFailed, it) }) { overview ->
            item(key = "jobs") {
                val runTask = { task: ScheduledTask, action: String ->
                    saver { api.taskAction(task.id, action); loader.reload() }
                }
                Section(stringResource(R.string.web_jobs_queues)) {
                    Panel {
                        overview.queues.forEachIndexed { index, queue ->
                            if (index > 0) RowDivider()
                            val task = overview.tasks.firstOrNull { it.queue == queue.id }
                            QueueRow(queue, task, { action -> task?.let { runTask(it, action) } }) { open = queue.id }
                        }
                        overview.tasks.filter { it.queue == null }.forEach { task ->
                            RowDivider()
                            TaskRow(task) { action -> runTask(task, action) }
                        }
                    }
                }
            }
        }
    }
    val queue = (loader.state as? Load.Ready)?.value?.queues?.firstOrNull { it.id == open }
    if (queue != null) {
        QueueSheet(
            queue,
            onAction = { action -> saver { api.queueAction(queue.id, action); loader.reload() } },
            onConcurrency = { n -> saver { loader.show(api.setConcurrency(queue.id, n)) } },
        ) { open = null }
    }
}

/** A message the web has per queue or task id, else what the server sent, in English. */
private fun localized(res: Resources, packageName: String, kind: String, id: String, part: String, fallback: String): String {
    val name = "web_jobs_${kind}_${id.replace('-', '_')}_$part"
    @Suppress("DiscouragedApi")
    val resId = res.getIdentifier(name, "string", packageName)
    return if (resId != 0) res.getString(resId) else fallback
}

@Composable
private fun queueName(queue: JobQueue): String =
    localized(LocalResources.current, LocalContext.current.packageName, "queue", queue.id, "name", queue.name)

@Composable
private fun taskName(task: ScheduledTask): String =
    localized(LocalResources.current, LocalContext.current.packageName, "task", task.id, "name", task.name)

/** "3 of 4 running · 12 waiting", "Paused", or "Idle", with failures. */
@Composable
private fun queueStatus(queue: JobQueue): String {
    val parts = buildList {
        when {
            queue.paused -> add(stringResource(R.string.web_jobs_queue_paused))
            queue.active > 0 -> add(stringResource(R.string.web_jobs_queue_running, queue.active.toString(), queue.concurrency.toString()))
            queue.waiting == 0 -> add(stringResource(R.string.web_jobs_queue_idle))
        }
        if (queue.waiting > 0) add(pluralStringResource(R.plurals.web_jobs_queue_waiting, queue.waiting, queue.waiting))
        if (queue.failed > 0) add(pluralStringResource(R.plurals.web_jobs_queue_failed, queue.failed, queue.failed))
    }
    return parts.joinToString(" · ")
}

/** A queue, how busy it is, and the task that fills it, with its run button; the row opens the queue's sheet. */
@Composable
private fun QueueRow(queue: JobQueue, task: ScheduledTask?, onTask: (String) -> Unit, onClick: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().clickable(onClickLabel = stringResource(R.string.web_jobs_queue_details), onClick = onClick)
            .padding(start = 16.dp, end = 12.dp, top = 12.dp, bottom = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(queueName(queue), style = MaterialTheme.typography.bodyLarge)
            Text(
                queueStatus(queue),
                style = MaterialTheme.typography.bodySmall,
                color = if (queue.failed > 0) Palette.Danger else Palette.Muted,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (task != null) TaskStatus(task)
        }
        if (task != null) {
            Gap(4.dp)
            TaskButton(task, onTask)
        }
        LucideIcon(Lucide.ChevronRight, null, size = 16.dp, tint = Palette.Muted)
    }
}

/** "45 s", "12 min", "3 h 20 min", for how long something took. */
private fun duration(seconds: Long): String = when {
    seconds < 60 -> "$seconds s"
    seconds < 3600 -> "${seconds / 60} min"
    else -> "${seconds / 3600} h ${(seconds % 3600) / 60} min"
}

private fun millis(at: String): Long? = runCatching { Instant.parse(at).toEpochMilli() }.getOrNull()

/**
 * "5 minutes ago", "in 2 hours", in the device's language, lowercase, as it
 * stands inside a sentence: Android starts German ones with a capital.
 */
private fun relative(at: String): String =
    millis(at)?.let {
        DateUtils.getRelativeTimeSpanString(it, System.currentTimeMillis(), DateUtils.MINUTE_IN_MILLIS).toString()
            .replaceFirstChar { char -> char.lowercaseChar() }
    } ?: at

/** The task's last run and its schedule, or how far it is now. */
@Composable
private fun taskStatus(task: ScheduledTask): String {
    if (task.startedAt != null) {
        val progress = task.progress
        return if (progress != null) stringResource(R.string.web_jobs_task_runningPercent, (progress * 100).toInt().toString())
        else stringResource(R.string.web_jobs_task_running)
    }
    val last = task.lastRun?.let { run ->
        val took = duration(((millis(run.endedAt) ?: 0) - (millis(run.startedAt) ?: 0)) / 1000)
        when (run.result) {
            "completed" -> stringResource(R.string.web_jobs_task_completed, relative(run.endedAt), took)
            "cancelled" -> stringResource(R.string.web_jobs_task_cancelled, relative(run.endedAt), took)
            else -> run.error?.let { stringResource(R.string.web_jobs_task_failedWith, relative(run.endedAt), it) }
                ?: stringResource(R.string.web_jobs_task_failed, relative(run.endedAt))
        }
    } ?: stringResource(R.string.web_jobs_task_neverRan)
    val interval = task.intervalSeconds
    val schedule = when {
        interval == null -> stringResource(R.string.web_jobs_schedule_manual)
        interval == 86_400.0 -> stringResource(R.string.web_jobs_schedule_daily)
        interval == 3_600.0 -> stringResource(R.string.web_jobs_schedule_hourly)
        else -> stringResource(R.string.web_jobs_schedule_every, duration(interval.toLong()))
    }
    val next = task.nextRunAt?.let { stringResource(R.string.web_jobs_schedule_next, schedule, relative(it)) } ?: schedule
    return "$last\n$next"
}

/** A task's last run, or how far it is now, and its schedule, under the row's other lines. */
@Composable
private fun TaskStatus(task: ScheduledTask) {
    val failed = task.lastRun?.result == "failed" && task.startedAt == null
    Text(taskStatus(task), style = MaterialTheme.typography.bodySmall, color = if (failed) Palette.Danger else Palette.Muted)
}

/** Runs the task now, or stops the run going on. */
@Composable
private fun TaskButton(task: ScheduledTask, onAction: (String) -> Unit) {
    val running = task.startedAt != null
    RoundIconButton(
        if (running) Lucide.X else Lucide.PlayOutline,
        stringResource(if (running) R.string.web_jobs_task_cancel else R.string.web_jobs_task_run),
        { onAction(if (running) "cancel" else "run") },
        background = Color.Transparent,
    )
}

/** A task that fills no queue: its name, its runs, and its button. */
@Composable
private fun TaskRow(task: ScheduledTask, onAction: (String) -> Unit) {
    Row(Modifier.fillMaxWidth().padding(start = 16.dp, end = 8.dp, top = 12.dp, bottom = 12.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(taskName(task), style = MaterialTheme.typography.bodyLarge)
            TaskStatus(task)
        }
        Gap(8.dp)
        TaskButton(task, onAction)
    }
}

/** A queue's details and what can be done to it. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun QueueSheet(queue: JobQueue, onAction: (String) -> Unit, onConcurrency: (Int) -> Unit, onDismiss: () -> Unit) {
    val name = queueName(queue)
    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = Palette.Raised, dragHandle = null) {
        Column(Modifier.fillMaxWidth().navigationBarsPadding().padding(vertical = 12.dp)) {
            SheetHeader(name, queueStatus(queue))
            // How many at once, where the queue lets that change.
            if (queue.concurrencyNote != null) {
                Row(Modifier.fillMaxWidth().padding(horizontal = 20.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(stringResource(R.string.web_jobs_concurrency), style = MaterialTheme.typography.bodyLarge)
                        Text(
                            stringResource(R.string.web_jobs_concurrency_limits, queue.defaultConcurrency.toString(), queue.maxConcurrency.toString()),
                            style = MaterialTheme.typography.bodySmall,
                            color = Palette.Muted,
                        )
                    }
                    RoundIconButton(Lucide.ChevronLeft, stringResource(R.string.web_jobs_concurrency_decrease, name), { onConcurrency(queue.concurrency - 1) }, enabled = queue.concurrency > 1)
                    Text(queue.concurrency.toString(), style = MaterialTheme.typography.titleMedium, textAlign = TextAlign.Center, modifier = Modifier.width(36.dp))
                    RoundIconButton(Lucide.ChevronRight, stringResource(R.string.web_jobs_concurrency_increase, name), { onConcurrency(queue.concurrency + 1) }, enabled = queue.concurrency < queue.maxConcurrency)
                }
                HorizontalDivider(Modifier.padding(vertical = 6.dp), color = Palette.Border)
            }
            SheetItem(if (queue.paused) Lucide.Play else Lucide.Pause, stringResource(if (queue.paused) R.string.web_jobs_queue_resume else R.string.web_jobs_queue_pause)) {
                onAction(if (queue.paused) "resume" else "pause")
            }
            if (queue.waiting > 0) {
                SheetItem(Lucide.Trash, stringResource(R.string.web_jobs_queue_clear), destructive = true) { onAction("clear") }
            }
            HorizontalDivider(Modifier.padding(vertical = 6.dp), color = Palette.Border)
            Column(Modifier.padding(horizontal = 20.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(stringResource(R.string.web_jobs_details_running), style = MaterialTheme.typography.titleSmall)
                if (queue.running.isEmpty()) {
                    Text(
                        stringResource(if (queue.paused) R.string.web_jobs_details_pausedNothingRunning else R.string.web_jobs_details_nothingRunning),
                        style = MaterialTheme.typography.bodySmall,
                        color = Palette.Muted,
                    )
                }
                queue.running.forEach { job ->
                    Text(job.label, style = MaterialTheme.typography.bodySmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
                }
                Gap(8.dp)
                Text(stringResource(R.string.web_jobs_details_failures), style = MaterialTheme.typography.titleSmall)
                if (queue.failures.isEmpty()) {
                    Text(stringResource(R.string.web_jobs_details_noFailures), style = MaterialTheme.typography.bodySmall, color = Palette.Muted)
                }
                queue.failures.forEach { failure ->
                    Column {
                        Text(failure.label, style = MaterialTheme.typography.bodySmall, maxLines = 2, overflow = TextOverflow.Ellipsis)
                        Text("${relative(failure.at)} · ${failure.message}", style = MaterialTheme.typography.bodySmall, color = Palette.Danger, maxLines = 3, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
        }
    }
}
