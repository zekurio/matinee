import { defineMessages, plural } from "../../catalog"

export default defineMessages("stats", {
  // The statistics page and its views.
  "stats.title": "Statistics",
  "stats.view.activity": "Activity",
  "stats.view.playback": "Playback",
  "stats.view.library": "Library",
  "stats.view.leaderboard": "Leaderboard",
  "stats.showAllTime": "Show all time",

  // The range chips, and how a sentence ends for each range.
  "stats.range.label": "Period",
  "stats.range.7d": "7 days",
  "stats.range.30d": "30 days",
  "stats.range.90d": "90 days",
  "stats.range.365d": "Year",
  "stats.range.all": "All time",
  "stats.period.7d": "in the last 7 days",
  "stats.period.30d": "in the last 30 days",
  "stats.period.90d": "in the last 90 days",
  "stats.period.365d": "in the last year",
  "stats.period.all": "so far",

  // Names in lib/stats.ts.
  "stats.method.direct": "Direct play",
  "stats.method.remux": "Direct stream",
  "stats.method.transcode": "Transcode",
  "stats.quality.original": "Original",
  // A transcode preset: "1080p 10 Mbps".
  "stats.quality.preset": "{height}p {bitrate} Mbps",
  "stats.notRead": "Not read yet",
  "stats.bucket.week": "Week of {date}",

  // Headline figures and counts shared by the views.
  "stats.figure.watchTime": "Watch time",
  "stats.figure.plays": "Plays",
  "stats.figure.people": plural({ one: "Person", other: "People" }),
  "stats.figure.moviesFinished": "Movies finished",
  "stats.figure.episodesFinished": "Episodes finished",
  "stats.figure.showsWatched": "Shows watched",
  "stats.plays": plural({ one: "{count} play", other: "{count} plays" }),
  "stats.files": plural({ one: "{count} file", other: "{count} files" }),
  "stats.movies": plural({ one: "{count} movie", other: "{count} movies" }),
  "stats.shows": plural({ one: "{count} show", other: "{count} shows" }),
  "stats.episodes": plural({
    one: "{count} episode",
    other: "{count} episodes",
  }),
  "stats.days": plural({ one: "{count} day", other: "{count} days" }),

  // Stat blocks.
  "stats.private.note": "Only you",
  "stats.private.hint":
    "Only you can see this. Share it under Settings → Account.",

  // Charts: a bar or point read out, "Nov 5: 2h 10m".
  "stats.chart.point": "{date}: {value}",
  "stats.chart.title.day": "Watch time per day",
  "stats.chart.title.week": "Watch time per week",
  "stats.chart.title.month": "Watch time per month",
  "stats.chart.busiest": "Busiest · {date} · {time}",

  // The activity heatmap.
  "stats.heatmap.peak": "Most often on {weekday}s around {hour}.",
  "stats.heatmap.empty": "No watching yet.",
  "stats.heatmap.cell": "{day}, {hour}: {time}",

  // The library growth chart.
  "stats.growth.total": "In total",
  "stats.growth.label": "Files in the libraries",
  "stats.growth.nothing": "Nothing arrived",
  // What arrived: "15 movies and 31 episodes, 233 GB".
  "stats.growth.arrived": "{items}, {size}",
  // The libraries at a bucket's end: "1,204 files, 3.1 TB".
  "stats.growth.held": plural({
    one: "{count} file, {size}",
    other: "{count} files, {size}",
  }),
  "stats.growth.heldAdded": "{held} · {arrived} added",

  // The Activity and Playback views.
  "stats.server.empty": "Statistics fill in as people watch",
  "stats.server.noPlays": "No plays {period}",
  "stats.server.nothingTranscoded": "Nothing was transcoded in this period.",
  "stats.server.methods": "How it played",
  "stats.server.encoders": "Encoders",
  "stats.server.videoFrom": "Video transcoded from",
  "stats.server.audioFrom": "Audio converted from",
  "stats.server.viewers": "Viewers",
  "stats.server.clients": "Browsers and apps",

  // Watching now.
  "stats.live.title": "Watching now",
  "stats.live.streams": plural({
    one: "{count} stream",
    other: "{count} streams",
  }),
  "stats.live.empty": "Nobody's watching right now",
  "stats.live.emptyHint": "Streams show up here while someone plays something.",
  "stats.live.gone": "A file that's gone from the library",
  "stats.live.paused": "Paused",
  "stats.live.left": "{time} left",
  "stats.live.stream.video": "Video",
  "stats.live.stream.audio": "Audio",
  "stats.live.handling.direct": "Direct",
  "stats.live.handling.copy": "Copy",
  "stats.live.handling.transcode": "Transcode",
  // Read between where a stream starts and what it becomes.
  "stats.live.to": "to",
  "stats.live.toneMapped": "tone mapped by {mapper}",
  "stats.live.mono": "mono",
  "stats.live.stereo": "stereo",

  // The Library view.
  "stats.library.empty": "The libraries are empty",
  "stats.library.emptyAdmin": "Add a library to see how it grows.",
  "stats.library.emptyUser": "An admin hasn't added any videos yet.",
  "stats.library.add": "Add a library",
  "stats.library.added.7d": "Added in the last 7 days",
  "stats.library.added.30d": "Added in the last 30 days",
  "stats.library.added.90d": "Added in the last 90 days",
  "stats.library.added.365d": "Added in the last year",
  "stats.library.added.all": "Added over time",
  "stats.library.movies": "Movies",
  "stats.library.shows": "Shows",
  "stats.library.episodes": "Episodes",
  "stats.library.size": "Size",
  "stats.library.runningTime": "Running time",
  "stats.library.libraries": "Libraries",
  "stats.library.resolution": "Resolution",
  "stats.library.dynamicRange": "Dynamic range",
  "stats.library.videoCodecs": "Video codecs",
  "stats.library.audioCodecs": "Audio codecs",

  // Most watched and genres.
  "stats.watch.top": "Most watched",
  "stats.watch.genres": "Genres",

  // The leaderboard.
  "stats.leaderboard.metric.watchTime": "Watch time",
  "stats.leaderboard.metric.plays": "Plays",
  "stats.leaderboard.metric.currentStreak": "Current streak",
  "stats.leaderboard.metric.longestStreak": "Longest streak",
  "stats.leaderboard.metric.movies": "Movies finished",
  "stats.leaderboard.metric.episodes": "Episodes finished",
  // A board where nobody has a value yet.
  "stats.leaderboard.none.watchTime": "Nobody has watched anything yet.",
  "stats.leaderboard.none.plays": "Nobody has played anything yet.",
  "stats.leaderboard.none.currentStreak": "Nobody is on a streak right now.",
  "stats.leaderboard.none.longestStreak": "Nobody has a streak yet.",
  "stats.leaderboard.none.movies": "Nobody has finished a movie yet.",
  "stats.leaderboard.none.episodes": "Nobody has finished an episode yet.",
  "stats.leaderboard.join": "Share my statistics",
  "stats.leaderboard.empty": "The leaderboard fills in as people watch",
  "stats.leaderboard.emptyHint":
    "Only people who share their statistics show up.",
  "stats.leaderboard.noPlays": "Nobody played anything {period}",
  // `{share}` is a button that reads `stats.leaderboard.share`.
  "stats.leaderboard.onlyYou":
    "Only you see yourself here. {share} to take part.",
  "stats.leaderboard.share": "Share your statistics",
  "stats.leaderboard.place": "Place {rank}",
  "stats.leaderboard.you": "(you)",
})
