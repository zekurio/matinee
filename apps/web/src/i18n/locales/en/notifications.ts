export default {
  "notifications.requests": "Requests",
  "notifications.ready": "{name} is ready",
  "notifications.unavailable": "{name}: Not available",
  // The push worker reads this catalog as plain strings, so a count has
  // two messages here instead of a plural: one request, and any other number.
  "notifications.waitingOne": "1 request waiting",
  "notifications.waiting": "{count} requests waiting",
  "notifications.attentionOne": "1 request needs attention",
  "notifications.attention": "{count} requests need attention",
  // A season, from the push worker, which has only the number.
  "notifications.readySeasonNumber": "{name}: Season {number} is ready",
  // The Android app's notifications, which word the season themselves:
  // "Firefly: Season 2 is ready", and a decline without a reason.
  "notifications.readySeason": "{name}: {season} is ready",
  "notifications.unavailableHint": "It won't come to this server.",
} as const
