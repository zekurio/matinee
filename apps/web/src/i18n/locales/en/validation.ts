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

  // sessions.ts: the name a client gives itself.
  "validation.clientName": "Enter a name.",

  // api-tokens.ts: a token needs at least one permission.
  "validation.apiTokenPermissions": "Choose what the token may do.",

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
  "validation.signInLink":
    "This sign-in link is broken. Start again in the app.",

  // fulfilment.ts: download connections.
  "validation.connectionName": "Give the connection a name.",
  "validation.connectionSlug":
    "Use capital letters, digits and underscores, starting with a letter.",

  // contract-auth.ts: the setup token that claims a new server.
  "validation.setupToken": "Enter the setup token to claim this server.",

  // access.ts: access groups and limits.
  "validation.bitrateLimit": "Pick a limit of at least 1 Mbps.",
  "validation.streamLimit": "Allow at least one stream.",
  "validation.groupName": "Give the group a name.",
  "validation.max256": "Use at most 256 characters.",

  // network.ts: the network settings.
  "validation.networkRange": "Use an address or a range like 192.168.0.0/16.",

  // invites.ts: invite links.
  "validation.inviteToken": "That invite link is incomplete.",

  // stats.ts.
  "validation.timeZone": "Use an IANA time zone like Europe/Berlin.",
  "validation.profileName": "Enter a username.",

  // theme.ts: custom themes.
  "validation.hexColor": "Use #rrggbb.",

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

  // titles.ts: filtering a library's titles.
  "validation.ageLimitCountry": "Use a two-letter country code like US.",

  // discover.ts: browsing the catalog with filters.
  "validation.browseLanguage": "Use a two-letter language code like en.",
  "validation.browseYears": "The first year can't be after the last.",
  "validation.browseScores": "The lowest score can't be above the highest.",
  "validation.browseRuntime":
    "The shortest runtime can't be longer than the longest.",

  "validation.browseSortForYou":
    "Sort by best match only among your recommendations.",

  // schema.ts: the messages the schema builder writes for a schema that
  // gives none of its own.
  "validation.invalidValue": "Invalid value",
  "validation.invalidInput": "Invalid input",
  "validation.invalidUrl": "Invalid URL",
  "validation.invalidUuid": "Invalid UUID",
  "validation.date": "Pick a date.",
  "validation.file": "Choose a file.",
  "validation.fileType": "Pick a file of another type.",
  "validation.pattern": "Use a value in the format this field expects.",
  "validation.required": "Fill in this field.",
  "validation.minLength": "Use at least {limit} characters.",
  "validation.maxLength": "Use at most {limit} characters.",
  // schema.ts: a number's bounds, and a client that's out of date.
  "validation.minValue": "Use {limit} or more.",
  "validation.maxValue": "Use {limit} or less.",
  "validation.staleRequest": "Reload the page and try again.",
})
