import { defineMessages, plural } from "../../catalog"

export default defineMessages("party", {
  // The watch party panel, from the bar.
  "party.title": "Watch party",
  "party.start": "Start a watch party",
  "party.startFailed": "Couldn't start a watch party",
  "party.inviteCopied": "Invite link copied",
  "party.inviteHint": "Anyone with an account on this server can join with it.",
  "party.inviteFailed": "Couldn't copy the link",
  "party.owner": "Owner",
  "party.nothing.owner":
    "Nothing yet. Play something and the party watches it with you.",
  "party.nothing.member": "Nothing yet. The owner picks what plays.",
  "party.restricted":
    "The party is watching something your account can't open.",
  "party.watchAlong": "Watch along",
  "party.queue": "Up next",
  "party.queue.owner": "Add movies and episodes from their ⋯ menu.",
  "party.queue.member": "Propose movies and episodes from their ⋯ menu.",
  "party.invite": "Invite people",
  "party.proposals": "Suggestions",
  "party.proposedBy": "Suggested by {name}",
  // A row's ⋯ menu.
  "party.entryActions": "More for {name}",
  "party.memberActions": "More for {name}",
  "party.playNow": "Play now",
  "party.moveUp": "Move up",
  "party.moveDown": "Move down",
  "party.remove": "Remove",
  "party.accept": "Add to queue",
  "party.dismiss": "Dismiss",
  "party.withdraw": "Take back",
  "party.makeOwner": "Make owner",
  "party.kick": "Remove from party",
  "party.rename": "Rename party",
  "party.rename.save": "Save",
  "party.leave": "Leave party",
  "party.failed": "That didn't work",

  // Naming, handing over, and removing, which are the owner's.
  "party.name": "Name",
  "party.name.optional": "Name (optional)",
  "party.name.placeholder": "Movie night",
  "party.makeOwner.title": "Hand the party to {name}?",
  "party.makeOwner.description":
    "{name} then picks what plays, sets the queue, and can remove people. You stay in the party.",
  "party.makeOwner.confirm": "Make owner",
  "party.kick.title": "Remove {name}?",
  "party.kick.description":
    "{name} leaves the party and can't join it again with the link.",
  "party.kick.confirm": "Remove",
  "party.cancel": "Cancel",

  // A file's ⋯ menu, while in a party.
  "party.menu.queue": "Add to party queue",
  "party.menu.propose": "Propose for the party",
  "party.queued": "{name} is in the party's queue",
  "party.proposed": "{name} is proposed for the party",

  // The page an invite link opens.
  "party.join.title": "Join {owner}'s watch party?",
  "party.join.titleNamed": "Join {name}?",
  "party.join.namedBy": "{owner}'s watch party. {description}",
  "party.join.people": plural({
    one: "{count} person is in it.",
    other: "{count} people are in it.",
  }),
  "party.join.over": "This watch party is over",
  "party.join.overDescription":
    "Everyone left, or the link is no longer good. Ask for a new one.",
  "party.join.description":
    "{people} You'll watch along with the people in it. Joining leaves any party you're in now.",
  "party.join.button": "Join",
  "party.join.failed": "Couldn't join",
  "party.join.home": "Back home",

  // The player, while it follows a party.
  "party.player.watching": plural({
    one: "{count} watching",
    other: "{count} watching",
  }),
  // {names} are the members whose players couldn't keep up, as a list.
  "party.player.waiting": "Waiting for {names}",
  "party.player.waitingForYou": "The party waits for you",
  "party.flash.paused": "{name} paused",
  "party.flash.played": "{name} pressed play",
  "party.flash.moved": "{name} jumped to {time}",
  "party.flash.speed": "A party plays at normal speed",
  "party.flash.waiting": "Waiting for {names} to catch up",
  "party.flash.waitingForYou": "The party waits while this loads",
  "party.flash.caughtUp": "Everyone caught up",

  // The list from the player's "watching" button: how each member's
  // player keeps up with the party.
  "party.health.title": "How everyone keeps up",
  "party.health.you": "{name} (you)",
  "party.health.checking": "Checking…",
  "party.health.inSync": "In sync",
  // {seconds} is a number like 1.5.
  "party.health.behind": "{seconds} s behind",
  "party.health.ahead": "{seconds} s ahead",
  "party.health.buffering": "Buffering",
  "party.health.paused": "Paused",
  "party.health.away": "Not in the player",
  "party.health.loaded": "{seconds} s loaded",
  // Watching from outside the server's home network.
  "party.health.remote": "Remote",
  "party.health.hint":
    "When someone's player can't keep up, the party pauses and plays on once it has caught up.",
})
