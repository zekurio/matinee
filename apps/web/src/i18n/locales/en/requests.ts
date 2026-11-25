import { defineMessages, plural } from "../../catalog"

export default defineMessages("requests", {
  // The admin's way in: the account menu entry and the dot on the avatar.
  "requests.title": "Requests",
  "requests.menu": "Requests",
  "requests.menuWaiting": plural({
    one: "Requests, {count} needs you",
    other: "Requests, {count} need you",
  }),
  // The account label with the dot on it, for screen readers.
  "requests.labelled": "{label}. Requests need you",

  // Discover's first row, which leads to the requests page: an admin's
  // latest requests in every state, or a person's own.
  "requests.recent": "Recent requests",

  // The one state each request's card shows.
  "requests.statusLabel": "Status",
  "requests.state.waiting": "Pending",
  "requests.state.needsAttention": "Failed",
  "requests.state.onTheWay": "Processing",
  // {percent} like "42%".
  "requests.state.onTheWayPercent": "Processing · {percent}",
  "requests.state.here": "Available",
  "requests.state.declined": "Declined",
  // A person's own card: taking the request back, small beside when they
  // asked.
  "requests.cancel": "Cancel",
  "requests.cancelNamed": "Cancel the request for {name}",

  // The Filter panel on /requests and My requests. The states use the
  // badges' words.
  "requests.filter.state": "State",
  "requests.filter.kind": "Type",
  // The phone drawer's button that closes it on the list.
  "requests.filter.show": "Show requests",
  "requests.filter.none": "No requests match these filters",
  "requests.filter.noneHint": "Take a filter off to see more.",

  "requests.addAll": plural({
    one: "Add {count}",
    other: "Add all {count}",
  }),

  // A row: what it is, who requested it, and where it goes.
  "requests.kind.movie": "Movie",
  "requests.kind.show": "Show",
  // How many more people requested it, beside the first one's name.
  "requests.othersCount": "+{count}",
  // The "…" menu on an admin's card: everyone who requested it, each
  // with when; where a waiting request can be added instead; the library
  // it's in; and what the connection says, {connection} like "Radarr".
  "requests.askedBy": "Requested by",
  "requests.menu.addTo": "Add to",
  "requests.menu.library": "Library",
  "requests.menu.connection": "From {connection}",
  // For an admin, the tooltip on a title's "Requested" badge. {when} is
  // relative, like "2 hours ago"; {names} a list, like "anna and ben".
  "requests.badge.requested": "{name} requested this {when}",
  "requests.badge.requestedMany": "{names} requested this",
  "requests.badge.waiting": "Someone requested this",
  // {numbers} like "1–3, 5".
  "requests.scope.seasons": plural({
    one: "Season {numbers}",
    other: "Seasons {numbers}",
  }),
  "requests.scope.specials": "Specials",
  "requests.scope.specialsAnd": "Specials and {seasons}",
  // The button that changes where a waiting request goes.
  "requests.goesTo.change": "Change where {name} goes, now {library}",
  "requests.goesTo.title": "Goes to",
  // Under the library, where the connection that fills it would be.
  "requests.noConnection": "No connection",

  // A row's actions.
  "requests.add": "Add",
  "requests.decline": "Decline",
  "requests.retry": "Retry",
  "requests.addNamed": "Add {name}",
  // On a title's page, when the request could go to more than one library.
  "requests.addTo": "Add to {library}",
  "requests.retryNamed": "Retry {name}",
  // Processing and Failed: stop waiting for a copy.
  "requests.giveUp": "Give up",
  "requests.giveUpNamed": "Give up on {name}",
  // Done, on a declined request: let anyone request it afresh, or
  // accept it as it was and send it.
  "requests.allowAgain": "Allow requests again",
  "requests.addAfterAll": "Add after all",
  "requests.addAfterAllNamed": "Add {name} after all",
  "requests.more": "More for {name}",
  "requests.openTitle": "Open title",
  // {connection} is the kind of service, like "Radarr" or "Sonarr".
  "requests.openRemote": "Open in {connection}",
  "requests.remove": "Remove request…",
  "requests.remove.title": "Remove the request for {name}?",
  // {names} is everyone who requested it, like "Anna and Ben".
  "requests.remove.description":
    "{names} won't be told and can request it again.",
  "requests.remove.descriptionNobody": "Nobody is told.",
  "requests.remove.confirm": "Remove",
  "requests.removed": "Removed the request for {name}",
  "requests.removeFailed": "Couldn't remove the request",
  "requests.retried": "Sending {name} again",
  "requests.retryFailed": "Couldn't send {name} again",

  // Declining, in a popover on the row.
  "requests.decline.title": "Decline {name}",
  // The one field: why, typed, which may be left empty.
  "requests.decline.note": "Reason",
  // {names} is who requested it, who read the reason.
  "requests.decline.noteFor": "Reason for {names}",
  "requests.decline.notePlaceholder": "Optional",
  "requests.decline.cancel": "Cancel",
  "requests.decline.submit": "Decline",

  // Giving up on an accepted request, in a popover like Decline's. The
  // reason is always "Can't find a copy". {connection} is where it was
  // sent, like "Radarr".
  "requests.giveUp.title": "Give up on {name}",
  "requests.giveUp.keeps":
    "{connection} keeps what it has. If the file turns up anyway, it arrives as usual.",
  "requests.giveUp.turnsUp":
    "If the file turns up anyway, it arrives as usual.",
  "requests.giveUp.submit": "Give up",

  // The toast after Add or Decline, which holds the call for Undo.
  "requests.toast.added": "Added {name}",
  "requests.toast.addedTo": "Added {name} to {library}",
  "requests.toast.addedMany": plural({
    one: "Added {count} title",
    other: "Added {count} titles",
  }),
  "requests.toast.declined": "Declined {name}",
  "requests.toast.undo": "Undo",
  // A person taking back their own request, from Discover.
  "requests.toast.cancelled": "Cancelled {name}",
  "requests.toast.addFailed": "Couldn't add",
  "requests.toast.declineFailed": "Couldn't decline {name}",
  "requests.toast.gaveUp": "Gave up on {name}",
  "requests.toast.giveUpFailed": "Couldn't give up on {name}",
  "requests.toast.allowedAgain": "{name} can be requested again",
  "requests.toast.allowAgainFailed": "Couldn't allow requests for {name} again",
  "requests.toast.addedAfterAll": "Added {name} after all",
  "requests.toast.addAfterAllFailed": "Couldn't add {name}",

  // On the way: how far along it is.
  "requests.progress.queued": "Not sent yet",
  "requests.progress.sent": "Sent",
  // Sent through a by-hand connection, which reports nothing: someone has
  // to put the file in the library.
  "requests.progress.byHand": "Waiting for the file",
  "requests.progress.looking": "Looking for a copy",
  "requests.progress.release": "Out {date}",
  "requests.progress.notOut": "Not out yet",
  // {time} like "3 hours".
  "requests.progress.left": "{time} left",

  // Failed.
  "requests.attention.unknown": "Failed without a reason",
  "requests.attention.failedUnknown":
    "This failed. The server log has the details.",

  // Done.
  "requests.done.arrived": "Arrived {when}",
  "requests.done.declinedUndated": "Declined",
  "requests.done.gaveUpUndated": "Given up",

  // Empty, loading, and error states.
  "requests.empty.setup.title": "Nothing fills your libraries yet",
  "requests.empty.setup.description":
    "Add a connection, then choose the libraries it fills.",
  "requests.empty.setup.action": "Set up requests",
  "requests.empty.none": "No requests yet",
  "requests.empty.noneHint":
    "When someone requests a film or show, it shows up here.",
  "requests.loadFailed": "Couldn't load requests. {error}",
  "requests.reload": "Try again",

  // The tooltip of Add all, with its key.
  "requests.keys.addAll": "Add all",
})
