import { defineMessages, plural } from "../../catalog"

export default defineMessages("requests", {
  // The admin's way in: the account menu entry and the dot on the avatar.
  "requests.title": "Requests",
  "requests.menu": "Requests",
  "requests.menuWaiting": plural({
    one: "Requests, {count} needs you",
    other: "Requests, {count} need you",
  }),
  "requests.dot": "Requests need you",

  // The queue at /requests. The lists, as a row of chips with their counts.
  "requests.lists": "Lists",
  "requests.list.waiting": "Waiting",
  "requests.list.needsAttention": "Needs attention",
  "requests.list.onTheWay": "On the way",
  "requests.list.done": "Done",
  "requests.addAll": plural({
    one: "Add {count}",
    other: "Add all {count}",
  }),

  // A row: what it is, who requested it, and where it goes.
  "requests.kind.movie": "Movie",
  "requests.kind.show": "Show",
  // How many more people requested it, beside the first one's name.
  "requests.othersCount": "+{count}",
  // {names} is a list, like "Ben and Cara".
  "requests.alsoRequested": "also {names}",
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
  // New seasons as they air, after the ones requested.
  "requests.scope.andFuture": "{seasons} + new",
  "requests.scope.futureOnly": "New seasons",
  "requests.goesTo.label": "Goes to",
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
  // On the way and Needs attention: stop waiting for a copy.
  "requests.giveUp": "Give up",
  "requests.giveUpNamed": "Give up on {name}",
  // Done, on a declined request: let anyone request it afresh, or
  // accept it as it was and send it.
  "requests.allowAgain": "Allow requests again",
  "requests.allowAgainNamed": "Allow requests for {name} again",
  "requests.addAfterAll": "Add after all",
  "requests.addAfterAllNamed": "Add {name} after all",
  "requests.more": "More for {name}",
  "requests.openTitle": "Open title",
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
  "requests.decline.reason": "Reason",
  "requests.reason.alreadyHere": "Already have it",
  "requests.reason.notForServer": "Not for this server",
  "requests.reason.notFound": "Can't find a copy",
  "requests.decline.note": "Note",
  // {names} is who requested it, who read the note with the reason.
  "requests.decline.noteFor": "Note for {names}",
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
  "requests.progress.label": "Progress for {name}",

  // Needs attention.
  "requests.attention.unknown": "Failed without a reason",

  // Done.
  "requests.done.arrived": "Arrived {when}",
  "requests.done.declined": "Declined {when}",
  "requests.done.declinedUndated": "Declined",
  "requests.done.gaveUp": "Given up {when}",
  "requests.done.gaveUpUndated": "Given up",

  // Empty, loading, and error states.
  "requests.empty.setup.title": "Nothing fills your libraries yet",
  "requests.empty.setup.description":
    "Add a connection, then choose the libraries it fills.",
  "requests.empty.setup.action": "Set up requests",
  "requests.empty.waiting": "Nothing is waiting",
  "requests.empty.needsAttention": "Nothing needs attention",
  "requests.empty.onTheWay": "Nothing is on the way",
  "requests.empty.done": "Nothing done yet",
  "requests.loadFailed": "Couldn't load requests. {error}",
  "requests.reload": "Try again",

  // The tooltip of Add all, with its key.
  "requests.keys.addAll": "Add all",
})
