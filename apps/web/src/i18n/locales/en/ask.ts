import { defineMessages, plural } from "../../catalog"

/*
 * Requesting a title the server doesn't have: the poster's button, the
 * request dialog, its tooltip, and the toasts. "Request" for
 * everyone, whether or not someone has to approve it.
 */
export default defineMessages("ask", {
  "ask.ask": "Request",
  // Read aloud on a season's card, where "Request" alone would not say
  // which: "Request Season 3", "Request Specials".
  "ask.askNamed": "Request {name}",
  "ask.more": "Request more",
  "ask.cancel": "Cancel request",

  // The request dialog, for a show's seasons or a choice of library.
  "ask.dialog.title": "Request {name}",
  "ask.chooser.seasons": "Seasons",
  "ask.chooser.unavailable": "Not offered",
  "ask.chooser.none": "Pick a season",
  "ask.chooser.one": "Request season {number}",
  "ask.chooser.many": plural({
    one: "Request {count} season",
    other: "Request {count} seasons",
  }),
  "ask.chooser.specials": "Request the specials",

  // In the tooltip of the Request button, read aloud with it too: for
  // someone who requested or follows a declined title, the admin's
  // answer; for anyone else, why the button can't be pressed, or how few
  // requests are left. {reason} is the reason the admin picked, as
  // Requests words it.
  "ask.declined.why": "Declined: {reason}.",
  // A request the admin accepted and then gave up on.
  "ask.declined.notFound": "No copy of this could be found.",
  // The admin's note, a line of its own under the answer.
  "ask.declined.note": "“{note}”",
  // A declined title, for someone who didn't request it, and for an
  // admin, with where the decline is lifted.
  "ask.disabled.declined":
    "An admin declined this title, so it can't be requested.",
  "ask.disabled.declinedAdmin":
    "Declined. To allow requests again, find it under Done in Requests.",
  "ask.disabled.off": "Your account can't request titles.",
  "ask.disabled.noDestination": "No library here takes this.",
  "ask.limit.until": "No requests left until {date}.",
  "ask.limit.later": "No requests left for now.",
  "ask.left": plural({
    one: "{count} request left.",
    other: "{count} requests left.",
  }),
  // My requests: "Declined by Lukas: Not for this server."
  "ask.reason.alreadyHere": "Already have it.",
  "ask.reason.notForServer": "Not for this server.",
  "ask.reason.notFound": "No copy found.",
  "ask.reason.declined": "Declined.",

  // Toasts.
  "ask.toast.asked": "Requested {name}",
  "ask.toast.undo": "Undo",
  "ask.toast.failed": "Couldn't request {name}",
  "ask.toast.cancelFailed": "Couldn't cancel {name}",

  // What the viewer requested: the profile's section and its page.
  // Beside the admin's "Requests", so it says whose.
  "ask.mine.title": "My requests",
  "ask.mine.seeAll": "See all",
  "ask.mine.empty": "Nothing requested yet",
  "ask.mine.emptyHint":
    "Search for a film or show that isn't here and request it from its page.",
  "ask.mine.error": "Couldn't load your requests. {error}",
})
