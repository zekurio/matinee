import { defineMessages, plural } from "../../catalog"

export default defineMessages("users", {
  // The users panel under Settings → Users.
  "users.title": "Users",
  "users.loadFailed": "Couldn't load users. {error}",
  "users.retry": "Try again",
  "users.madeAdmin": "{name} is now an admin",
  "users.steppedDown": "You're no longer an admin",
  "users.removedAdmin": "{name} is no longer an admin",
  "users.deleted": "Deleted {name}",
  "users.endedOwnSessions": plural({
    one: "Ended {count} session on other devices",
    other: "Ended {count} sessions on other devices",
  }),
  "users.endedSessions": plural({
    one: "Signed {name} out of {count} session",
    other: "Signed {name} out of {count} sessions",
  }),

  // Confirming a sign-out or a deletion.
  "users.signOut.ownTitle": "Sign out your other sessions?",
  "users.signOut.title": "Sign {name} out everywhere?",
  "users.signOut.ownDescription": "Every other device has to sign in again.",
  "users.signOut.description": "Every device has to sign in again.",
  "users.signOut.ownConfirm": "Sign out others",
  "users.signOut.confirm": "Sign out everywhere",
  "users.delete.ownTitle": "Delete your account?",
  "users.delete.title": "Delete {name}?",
  "users.delete.ownDescription":
    "Your passkeys and watch progress go with it. This can't be undone.",
  "users.delete.description":
    "Their passkeys and watch progress go with it. This can't be undone.",
  "users.delete.ownConfirm": "Delete my account",
  "users.delete.confirm": "Delete user",

  // A user's row and its menu.
  "users.admin": "Admin",
  "users.you": "(you)",
  "users.actions": "Actions for {name}",
  "users.menu.stepDown": "Step down as admin",
  "users.menu.removeAdmin": "Remove admin role",
  "users.menu.makeAdmin": "Make admin",
  "users.menu.signOutOthers": "Sign out other sessions",
  "users.menu.signOut": "Sign out everywhere",
  "users.menu.deleteOwn": "Delete my account",
  "users.menu.delete": "Delete user",
  "users.lastAdmin": "Make someone else an admin first.",
  "users.passkeys": plural({
    one: "{count} passkey",
    other: "{count} passkeys",
  }),
  "users.oidcOff": "Single sign-on (off)",
  "users.noSignIn": "No way to sign in",
  "users.joined": "Joined {date}",
  "users.activeNow": "Active now",
  "users.signedOut": "Signed out",
  "users.activeRecently": "Active recently",
  "users.lastSeen": "Last seen {when}",

  // The confirm dialog, and a role change's words.
  "users.dialog.cancel": "Cancel",
  "users.role.makeTitle": "Make {name} an admin?",
  "users.role.makeDescription":
    "Admins manage libraries, settings, and every account.",
  "users.role.makeConfirm": "Make admin",
  "users.role.stepDownTitle": "Step down as admin?",
  "users.role.stepDownDescription": "Only another admin can give it back.",
  "users.role.stepDownConfirm": "Step down",
  "users.role.removeTitle": "Remove {name}'s admin role?",
  "users.role.removeDescription": "They keep their account and watch progress.",
  "users.role.removeConfirm": "Remove admin role",
})
