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
  // A link from before single sign-on changed issuer.
  "account.oidc.stale":
    "Linked to an earlier {provider} setup, so it can't sign you in. Link it again.",
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

  // API tokens, for services that call the API as the account.
  "account.apiTokens.title": "API tokens",
  "account.apiTokens.description":
    "A service sends one as Authorization: Bearer to call the API as you, with your role and access. Tokens don't expire. Revoke one when the service no longer needs it.",
  "account.apiTokens.empty": "No API tokens yet.",
  "account.apiTokens.loadFailed": "Couldn't load your API tokens. {reason}",
  "account.apiTokens.create": "Create token",
  "account.apiTokens.createTitle": "Create an API token",
  "account.apiTokens.createDescription":
    "Name it after the service that will use it.",
  "account.apiTokens.name": "Name",
  "account.apiTokens.namePlaceholder": "Home automation",
  "account.apiTokens.createFailed": "Couldn't create the API token",
  "account.apiTokens.secretTitle": "Copy the token for {name}",
  "account.apiTokens.secretDescription":
    "This is the only time Matinee shows it. Keep it where the service keeps secrets.",
  "account.apiTokens.secretLabel": "API token",
  "account.apiTokens.copy": "Copy",
  "account.apiTokens.copied": "Copied",
  "account.apiTokens.done": "Done",
  "account.apiTokens.neverUsed": "Never used",
  "account.apiTokens.usedNow": "Used just now",
  // {time} is relative, like "3 days ago".
  "account.apiTokens.used": "Used {time}",
  "account.apiTokens.created": "Created {date}",
  "account.apiTokens.revoke": "Revoke",
  "account.apiTokens.revokeNamed": "Revoke {name}",
  "account.apiTokens.revokeTitle": "Revoke {name}?",
  "account.apiTokens.revokeDescription":
    "The service using it stops working with Matinee until you give it a new token.",
  "account.apiTokens.revoked": "Revoked {name}",
  "account.apiTokens.revokeFailed": "Couldn't revoke the API token",

  // Devices, in lib/devices.ts. {platform} is a name like Android or iOS.
  "account.device.app": "{platform} app",
  "account.device.browser": "Browser",

  "account.cancel": "Cancel",
})
