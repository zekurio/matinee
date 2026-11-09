import { defineMessages, plural } from "../../catalog"

export default defineMessages("account", {
  // The profile: picture, display name, and what it shares.
  "account.profile.title": "Profile",
  // The link text in account.profile.description.
  "account.picture.changeFailed": "Couldn't change your picture",
  "account.picture.change": "Change picture",
  "account.picture.upload": "Upload picture",
  "account.picture.useProvider": "Use {provider} picture",
  "account.picture.remove": "Remove picture",
  // Errors preparing a picture for upload, in lib/avatar.ts.
  "account.picture.unreadable": "Couldn't read that image. Try another file.",
  "account.picture.noResize": "Your browser can't resize images.",
  "account.picture.prepareFailed": "Couldn't prepare that image.",
  "account.displayName.label": "Display name",
  "account.displayName.saveFailed": "Couldn't save your name. {reason}",

  // What the profile shows to others, in profile-sharing.tsx.
  "account.sharing.failed": "Couldn't change what your profile shows",
  "account.sharing.favorites": "Show my favorites",
  "account.sharing.stats": "Show my statistics",

  // Passkeys.
  "account.passkeys.title": "Passkeys",
  "account.passkeys.empty": "No passkeys yet.",
  // A passkey without a name.
  "account.passkeys.unnamed": "Passkey",
  "account.passkeys.synced": "Synced",
  // {time} is relative, like "3 days ago".
  "account.passkeys.used": "Used {time}",
  "account.passkeys.added": "Added {date}",
  "account.passkeys.remove": "Remove passkey",
  "account.passkeys.removeNamed": "Remove {name}",
  "account.passkeys.removeTitle": "Remove {name}?",
  "account.passkeys.removeTitleUnnamed": "Remove this passkey?",
  "account.passkeys.removeDescription":
    "You won't be able to sign in with it again.",
  "account.passkeys.removed": "Removed passkey",
  "account.passkeys.removeFailed": "Couldn't remove passkey",
  "account.passkeys.add": "Add passkey",
  "account.passkeys.addTitle": "Add a passkey",
  "account.passkeys.addDescription": "Your browser will ask you to confirm.",
  "account.passkeys.name": "Name (optional)",
  "account.passkeys.namePlaceholder": "Work laptop",
  "account.passkeys.waiting": "Waiting for your device…",
  "account.passkeys.addSucceeded": "Added passkey",
  "account.passkeys.addFailed": "Couldn't add passkey",

  // The single sign-on account linked to this one.
  "account.oidc.link": "Link {provider}",
  "account.oidc.linked": "Linked {date}",
  "account.oidc.unlink": "Unlink",
  "account.oidc.unlinked": "Unlinked {provider}",
  "account.oidc.unlinkFailed": "Couldn't unlink {provider}",
  "account.oidc.none": "No {provider} account linked.",

  // Sessions.
  "account.sessions.title": "Sessions",
  "account.sessions.signOutOthers": "Sign out other sessions",
  "account.sessions.loadFailed": "Couldn't load your sessions. {reason}",
  "account.sessions.signedOut": "Signed out {session}",
  "account.sessions.signOutFailed": "Couldn't sign out that session",
  "account.sessions.signedOutCount": plural({
    one: "Signed out {count} session",
    other: "Signed out {count} sessions",
  }),
  "account.sessions.signOutOthersFailed":
    "Couldn't sign out the other sessions",
  "account.sessions.signOutTitle": "Sign out {session}?",
  "account.sessions.signOutTitleUnnamed": "Sign out this session?",
  "account.sessions.signOutDescription":
    "It has to sign in again to use Matinee.",
  "account.sessions.signOut": "Sign out",
  "account.sessions.signOutNamed": "Sign out {session}",
  "account.sessions.signOutOthersTitle": "Sign out every other session?",
  "account.sessions.signOutOthersDescription":
    "Every browser and app but this one has to sign in again.",
  "account.sessions.signOutOthersConfirm": "Sign out others",
  "account.sessions.thisDevice": "This device",
  "account.sessions.signedIn": "Signed in {date}",
  "account.sessions.activeNow": "Active now",
  "account.sessions.activeLastHour": "Active in the last hour",
  // {time} is relative, like "3 days ago".
  "account.sessions.active": "Active {time}",

  // Devices, in lib/devices.ts. {platform} is a name like Android or iOS.
  "account.device.app": "{platform} app",
  "account.device.browser": "Browser",

  "account.cancel": "Cancel",
})
