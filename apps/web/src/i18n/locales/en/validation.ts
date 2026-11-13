import { defineMessages } from "../../catalog"

/*
 * The custom messages of the contract schemas in packages/contracts,
 * word for word, so `translateKnown()` finds them.
 */
export default defineMessages("validation", {
  // admin.ts: single sign-on settings.
  "validation.issuerUrl": "Enter the issuer as an http or https URL.",
  "validation.scopesOpenid": "Scopes must include openid.",

  // contract-library.ts: searching a provider for a match.
  "validation.searchQuery": "Enter a name to search for.",

  // titles.ts: uploading a title's, season's, or episode's image. The
  // empty file and image type messages are the avatar ones below.
  "validation.imageSize": "Pick an image under 25 MB.",

  // library.ts: libraries.
  "validation.metadataLanguage": "Use a language code like en or de-DE.",
  "validation.absolutePath": "Use an absolute path.",
  "validation.libraryName": "Give the library a name.",
  "validation.libraryFolders": "Add at least one folder.",
  "validation.libraryFoldersUnique": "Each folder can be added once.",

  // preferences.ts: playback languages.
  "validation.languageTag": "Use a language tag, like en or pt-BR.",

  // sessions.ts: devices and app sign-in.
  "validation.codeChallenge": "Invalid code challenge",
  "validation.codeVerifier": "Invalid code verifier",
  // {scheme} is the app's URI scheme, matinee.
  "validation.redirectUri": "Use a {scheme}: URI or a loopback http URL.",
  "validation.userCode": "Enter the 8 letters the device shows.",

  // access.ts: access groups and limits.
  "validation.bitrateLimit": "Pick a limit of at least 1 Mb/s.",
  "validation.streamLimit": "Allow at least one stream.",
  "validation.groupName": "Give the group a name.",
  "validation.max256": "Use at most 256 characters.",

  // network.ts: the network settings.
  "validation.networkRange": "Use an address or a range like 192.168.0.0/16.",

  // invites.ts: invite links.
  "validation.inviteToken": "That invite link is incomplete.",

  // stats.ts.
  "validation.timeZone": "Use an IANA time zone like Europe/Berlin.",

  // theme.ts: custom themes.
  "validation.hexColor": "Use #rrggbb.",
  "validation.themeVariantsUnique": "Variant ids must be unique.",

  // transcoding.ts: transcoding settings.
  "validation.devicePath": "Use a device under /dev, like /dev/dri/renderD128.",
  "validation.wholeNumber": "Use a whole number.",
  "validation.crfRange": "Use 0 to 51.",
  "validation.codecsUnique": "Each codec can be listed once.",

  // users.ts and sessions.ts: usernames, display and device names, avatars.
  // The server's avatar and artwork checks send the image type message too.
  "validation.usernameMin": "Use at least 2 characters.",
  "validation.usernameMax": "Use at most 32 characters.",
  "validation.usernameChars":
    "Use letters, numbers, dots, dashes, and underscores.",
  "validation.max64": "Use at most 64 characters.",
  "validation.fileEmpty": "That file is empty.",
  "validation.avatarSize": "Pick an image under 10 MB.",
  "validation.avatarType": "Pick a JPEG, PNG, or WebP image.",
})
