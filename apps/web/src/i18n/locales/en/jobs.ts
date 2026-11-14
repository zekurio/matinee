import { defineMessages, plural } from "../../catalog"

export default defineMessages("jobs", {
  // The jobs panel under Settings → Jobs.
  "jobs.queues": "Background work",
  "jobs.loadFailed": "Couldn't load the jobs. {error}",
  "jobs.retry": "Try again",

  // The labels over a row's facts.
  "jobs.fact.status": "Status",
  "jobs.fact.lastRun": "Last run",
  "jobs.fact.currentRun": "Current run",
  "jobs.fact.nextRun": "Next run",

  // Queues, by their id. The server sends the same words in English.
  "jobs.queue.library-scan.name": "Library scans",
  "jobs.queue.library-scan.description":
    "Walk library folders for new, changed, and removed files.",
  "jobs.queue.media-probe.name": "Media info",
  "jobs.queue.media-probe.description":
    "Read the streams of new and changed files with ffprobe.",
  "jobs.queue.metadata.name": "Metadata",
  "jobs.queue.metadata.description":
    "Fetch details, artwork, and episodes from metadata providers.",
  "jobs.queue.thumbnails.name": "Thumbnails",
  "jobs.queue.thumbnails.description":
    "Take a frame from videos that have no artwork.",
  "jobs.queue.subtitle-prepare.name": "Prepare subtitles",
  "jobs.queue.subtitle-prepare.description":
    "Cache indexed text subtitles without reading video streams.",
  "jobs.queue.subtitle-prepare.note":
    "Files whose indexed text subtitles are prepared at once.",
  "jobs.task.prepare-subtitles.name": "Prepare subtitles",
  "jobs.task.prepare-subtitles.description":
    "Cache indexed text subtitles and delete outputs of removed or changed files. Picture subtitles stay on demand.",
  "jobs.queue.trickplay.name": "Trickplay images",
  "jobs.queue.trickplay.description":
    "Make the thumbnails the seek bar shows while scrubbing.",
  "jobs.queue.artwork.name": "Artwork",
  "jobs.queue.artwork.description":
    "Download images from the metadata provider, scale them, and read their blurred placeholders.",
  "jobs.queue.subtitle-fonts.name": "Subtitle fonts",
  "jobs.queue.subtitle-fonts.description":
    "Extract font attachments for styled subtitles.",
  "jobs.queue.subtitles.name": "Subtitles",
  "jobs.queue.subtitles.description":
    "Convert subtitles to WebVTT, and copy PGS subtitles out of videos.",
  "jobs.queue.plugin-events.name": "Plugin events",
  "jobs.queue.plugin-events.description":
    "Deliver recorded server events to plugins, retrying failed handlers.",
  "jobs.task.deliver-plugin-events.name": "Deliver plugin events",
  "jobs.task.deliver-plugin-events.description":
    "Retry waiting plugin events and give up on expired or excess events.",
  "jobs.queue.avatars.name": "Profile pictures",
  "jobs.queue.avatars.description":
    "Crop and scale uploads and the pictures sign-in providers send.",
  "jobs.queue.downloads.name": "Download encodes",
  "jobs.queue.downloads.description":
    "Encode the video of downloads in another size or codec, while the app or browser fetches them.",
  "jobs.queue.downloads.note":
    "Downloads encoded at once. Each one uses an encoder as a stream would; raise it if the server keeps up.",
  "jobs.queue.download-copies.name": "Download copies",
  "jobs.queue.download-copies.description":
    "Put together downloads that keep their video as it is, while the app or browser fetches them.",

  // A queue's row, joined with " · ".
  "jobs.queue.running": "{active} of {concurrency} running",
  "jobs.queue.waiting": plural({
    one: "{count} waiting",
    other: "{count} waiting",
  }),
  "jobs.queue.idle": "Idle",
  "jobs.queue.done": plural({ one: "{count} done", other: "{count} done" }),
  "jobs.queue.failed": plural({
    one: "{count} failed",
    other: "{count} failed",
  }),
  "jobs.queue.paused": "Paused",
  "jobs.queue.actions": "{queue} actions",
  "jobs.queue.details": "Details",
  "jobs.queue.pause": "Pause",
  "jobs.queue.resume": "Resume",
  "jobs.queue.clear": "Clear waiting jobs",
  "jobs.queue.pauseFailed": "Couldn't pause {queue}",
  "jobs.queue.resumeFailed": "Couldn't resume {queue}",
  "jobs.queue.clearFailed": "Couldn't clear {queue}",

  // Scheduled tasks, by their id. The server sends the same words in
  // English; it fills in the cache limits of clean-transcodes itself.
  "jobs.task.scan-libraries.name": "Scan libraries",
  "jobs.task.scan-libraries.description":
    "Look for new, changed, and removed files in every library, for changes the folder watcher can't see, like a network share written by another host.",
  "jobs.task.refresh-metadata.name": "Refresh metadata",
  "jobs.task.refresh-metadata.description":
    "Fetch metadata for titles without a match and for ones that went stale, for new episodes and artwork.",
  "jobs.task.probe-media.name": "Read media info",
  "jobs.task.probe-media.description":
    "Run ffprobe on files that weren't read yet. Scans queue their new files on their own.",
  "jobs.task.prefetch-artwork.name": "Fetch artwork",
  "jobs.task.prefetch-artwork.description":
    "Download images the server has no blurred placeholder for yet, posters and backdrops first. Metadata fetches queue their images on their own; this catches up after a restart or a failed download.",
  "jobs.task.make-trickplay.name": "Make trickplay images",
  "jobs.task.make-trickplay.description":
    "Make the seek bar's thumbnails for videos without them, or whose file or settings changed, newest first. Scans queue their new files on their own. Also deletes the images of files that are gone.",
  "jobs.task.clean-transcodes.name": "Clean up encodes",
  "jobs.task.clean-sessions.name": "Delete expired sessions",
  "jobs.task.clean-sessions.description":
    "Remove sign-ins that expired from the database.",

  "jobs.task.sync-oidc-accounts.name": "Sync provider accounts",
  "jobs.task.sync-oidc-accounts.description":
    "Refresh roles, pictures, and access from the sign-in provider for accounts with a refresh token.",

  // A task's row.
  "jobs.task.neverRan": "Hasn't run yet",
  "jobs.task.took": "Took {took}",
  "jobs.task.cancelledAfter": "Cancelled after {took}",
  "jobs.task.failed": "Failed",
  "jobs.task.failedWith": "Failed: {error}",
  "jobs.task.running": "Running…",
  "jobs.task.started": "Started {when}",
  "jobs.task.percent": "{percent}%",
  "jobs.task.progress": "{task} progress",
  "jobs.task.run": "Run now",
  "jobs.task.cancel": "Cancel",
  "jobs.task.startFailed": "Couldn't start {task}",
  "jobs.task.cancelFailed": "Couldn't cancel {task}",

  // When a task runs, in a sentence.
  "jobs.schedule.manual": "Runs when you start it",
  "jobs.schedule.atStartup": "Runs at startup",
  "jobs.schedule.afterStartup": "Runs {delay} after startup",
  "jobs.schedule.daily": "Every day",
  "jobs.schedule.daily.atStartup": "Every day and at startup",
  "jobs.schedule.daily.afterStartup": "Every day and {delay} after startup",
  "jobs.schedule.hourly": "Every hour",
  "jobs.schedule.hourly.atStartup": "Every hour and at startup",
  "jobs.schedule.hourly.afterStartup": "Every hour and {delay} after startup",
  "jobs.schedule.every": "Every {interval}",
  "jobs.schedule.every.atStartup": "Every {interval} and at startup",
  "jobs.schedule.every.afterStartup":
    "Every {interval}, first {delay} after startup",
  "jobs.schedule.notScheduled": "Not scheduled",
  "jobs.schedule.afterThisRun": "After this run",

  // How many jobs each queue runs at once.
  "jobs.concurrency": "Concurrency",
  "jobs.concurrency.limits": "Default {default}, max {max}.",
  "jobs.concurrency.decrease": "Decrease {queue}",
  "jobs.concurrency.increase": "Increase {queue}",
  "jobs.concurrency.atOnce": plural({
    one: "{count} job at once",
    other: "{count} jobs at once",
  }),

  // A queue's details dialog.
  "jobs.details.running": "Running",
  "jobs.details.nothingRunning": "Nothing is running.",
  "jobs.details.pausedNothingRunning": "Paused. Nothing is running.",
  "jobs.details.runningFor": "For {span}",
  "jobs.details.failures": "Recent failures",
  "jobs.details.noFailures": "None since the server started.",
  "jobs.details.kept": "The last five since the server started.",
  "jobs.details.retryOnRestart":
    "The last five since the server started. Each is tried again after the server restarts.",
  "jobs.details.retryAfter":
    "The last five since the server started. Each is tried again after {span}.",
})
