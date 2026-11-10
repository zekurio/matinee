import { defineMessages } from "../../catalog"

/*
 * Text the server sends in English, word for word, so `translateKnown()`
 * finds it: error messages, the auth error on sign-in redirects, and what
 * the jobs panel and the library dialog show. Where a placeholder
 * pattern would also match a longer text, the longer one comes first.
 */
export default defineMessages("server", {
  "server.downloads.tooManyAudioTracks":
    "A download can hold at most 16 audio tracks.",
  "server.downloads.selectedAudioUnavailable":
    "The selected audio tracks aren't available in this file.",
  "server.downloads.noDownloadVideo":
    "The server can't encode video in a codec this device plays.",
  "server.downloads.noDownloadAudio":
    "No audio conversion is available for this device.",
  // rpc/base.ts: every procedure.
  "server.rpc.signInFirst": "Sign in first.",
  "server.rpc.adminsOnly": "Only admins can do this.",
  "server.rpc.passkeysOff": "Passkeys are turned off on this server.",

  // rpc/auth.ts: setup, sign-up, sign-in, and devices.
  "server.auth.signUpClosed": "Sign-up is closed on this server.",
  "server.auth.pendingGone":
    "This sign-in expired. Continue with single sign-on again.",
  "server.auth.accountGone": "This account no longer exists.",
  "server.auth.deviceGone":
    "That code doesn't work. It may have expired, or been used already.",
  "server.auth.setupDone": "Setup is already done.",
  "server.auth.setupTokenMismatch":
    "That setup token doesn't match the one in the log.",
  "server.auth.setupTokenFirst": "Enter the setup token first.",
  "server.auth.setupWithOidc": "Sign in with {provider} to set up Matinee.",
  "server.auth.usernameTaken": "That username is taken.",
  "server.auth.signUpInvalid": "The sign-up request is invalid.",
  "server.auth.setupDoneSignIn": "Setup is already done. Sign in instead.",
  "server.auth.ssoOff": "Single sign-on is turned off.",
  "server.auth.signOutFirst": "Sign out before creating a new account.",
  "server.auth.appSignInGone":
    "This sign-in expired or was used already. Try again.",
  "server.auth.deviceCodeExpired": "This code expired. Get a new one.",

  // auth/oidc.ts and auth/oidc-accounts.ts: single sign-on, also as the
  // auth error on redirects.
  "server.oidc.noLinkedAccount":
    "No account is linked to this sign-in. Sign in with a passkey, then link it in settings.",
  // The same, while passkeys are off.
  "server.oidc.noLinkedAccountSso":
    "No account is linked to this sign-in. Ask an admin for access.",
  "server.oidc.linkedElsewhere":
    "This sign-in is already linked to another account.",
  "server.oidc.alreadyLinked":
    "Your account is already linked to another sign-in at this provider. Unlink it in settings first.",
  "server.oidc.setupFirst": "Create the admin account on the setup page first.",
  "server.oidc.setupNotAdmin":
    "Only an admin at {provider} can set up Matinee. Give your account the {claim} claim with the value admin, then sign in again.",
  "server.oidc.unreachable": "Couldn't reach the sign-in provider.",
  "server.oidc.wrongIssuer":
    "Single sign-on is set up with the wrong issuer URL. An admin needs to change it to {issuer}.",
  "server.oidc.signInToLink": "Sign in before linking an account.",
  "server.oidc.expired": "Sign-in expired. Try again.",
  "server.oidc.noIdToken": "The provider sent no ID token.",
  "server.oidc.signInAgainToLink": "Sign in again before linking an account.",
  // {reason} is the provider's own text.
  "server.oidc.refused": "The provider refused the sign-in: {reason}",
  "server.oidc.failed": "Sign-in failed. Check the server log for details.",

  // auth/passkeys.ts.
  "server.passkeys.requestExpired": "The passkey request expired. Try again.",
  "server.passkeys.checkFailed": "Passkey check failed.",
  "server.passkeys.notVerified": "The passkey could not be verified.",
  "server.passkeys.signInExpired": "The sign-in request expired. Try again.",
  "server.passkeys.unknown": "This passkey isn't registered with Matinee.",

  // auth/avatars.ts. Its wrong-type message is validation.avatarType.
  "server.avatars.unreadable": "Couldn't read that image. Try another file.",
  "server.avatars.noPicture":
    "Your provider hasn't sent a picture. Sign in with it once to fetch it.",
  "server.avatars.loadFailed":
    "Couldn't load the picture from your provider. Try again later.",
  // A failed job's label in the profile pictures queue.
  "server.avatars.uploadLabel": "an upload",

  // rpc/account.ts.
  "server.account.lastMethod":
    "Add another passkey or link an account before removing your last way to sign in.",
  "server.account.lastLink":
    "Passkeys are off, so single sign-on is your only way to sign in. Keep it linked.",
  "server.account.notFound": "Account not found.",
  "server.account.passkeyOtherAccount":
    "This passkey request belongs to another account.",
  "server.account.passkeyNotFound": "Passkey not found.",
  "server.account.noLinkedAccount": "No account is linked.",
  "server.account.currentSession": "Sign out to end the session you're using.",
  "server.account.sessionGone": "That session already ended.",

  // rpc/admin-users.ts.
  "server.adminUsers.gone": "That user no longer exists. Reload the list.",
  "server.adminUsers.lastAdmin":
    "{name} is the only admin who can sign in. Make someone who can sign in an admin first.",
  "server.adminUsers.lastAdminDemote":
    "You're the only admin who can sign in. Make someone who can sign in an admin before you step down.",
  "server.adminUsers.lastAdminDelete":
    "You're the only admin who can sign in. Make someone who can sign in an admin before you delete your account.",

  // rpc/admin-auth.ts: saving passkeys and the single sign-on settings.
  // {url} is the issuer's discovery document URL.
  "server.adminAuth.issuerRequired":
    "Enter an issuer URL to turn on single sign-on.",
  "server.adminAuth.clientIdRequired":
    "Enter a client ID to turn on single sign-on.",
  "server.adminAuth.noMethod":
    "Keep passkeys or single sign-on on. Without either, nobody can sign in.",
  "server.adminAuth.passkeysOffLink":
    "Link your account to single sign-on under Settings → Account before turning passkeys off.",
  "server.adminAuth.passkeysOffSaveFirst":
    "Save single sign-on first and link your account to it under Settings → Account. Then turn passkeys off.",
  "server.adminAuth.ssoOnlyIssuer":
    "You sign in only through single sign-on. Add a passkey before changing the issuer.",
  "server.adminAuth.ssoOnlyOff":
    "You sign in only through single sign-on. Add a passkey before turning it off.",
  "server.adminAuth.ssoOnlyIssuerPasskeysOff":
    "You sign in only through single sign-on. Turn passkeys on and add one before changing the issuer.",
  "server.adminAuth.ssoOnlyOffPasskeysOff":
    "You sign in only through single sign-on. Turn passkeys on and add one before turning it off.",
  "server.adminAuth.discoveryTimeout": "{url} didn't answer within 10 seconds.",
  "server.adminAuth.issuerMismatch":
    "The provider calls itself {issuer}. Use exactly that as the issuer URL.",
  "server.adminAuth.issuerDiffers":
    "The provider's discovery document names a different issuer. Copy it exactly, including any trailing slash.",
  "server.adminAuth.notDiscovery":
    "{url} isn't a discovery document. Check the issuer URL.",
  "server.adminAuth.discoveryFailed": "Couldn't load {url}: {reason}",

  // rpc/admin-jobs.ts and the jobs panel. {name} is a queue's name.
  "server.jobs.noQueue": "There's no such queue.",
  "server.jobs.noTask": "There's no such task.",
  "server.jobs.fixedConcurrencyOne": "{name} always runs 1 jobs at once.",
  "server.jobs.fixedConcurrency": "{name} always runs {count} jobs at once.",
  "server.jobs.maxConcurrency": "{name} runs at most {count} jobs at once.",
  // The clean-transcodes task, with the cache limits filled in.
  "server.jobs.cleanTranscodes":
    "Delete encodes nobody played for {hours} hours, then the least recently played past {size} GB.",
  // Failed jobs' labels, with an id.
  "server.jobs.libraryLabel": "library {id}",
  "server.jobs.artworkLabel": "artwork {id}",

  // rpc/libraries.ts.
  "server.libraries.notFound": "Library not found.",
  "server.libraries.unreadableFolder":
    "{path} isn't a folder the server can read.",
  "server.libraries.noProvider":
    "Pick a metadata provider for this library first.",
  "server.libraries.noStartPoint":
    "Can't find a point to start this file from.",
  "server.libraries.cantRead": "Can't read {path}.",

  // rpc/titles.ts, rpc/playback.ts, rpc/profiles.ts, and rpc/people.ts.
  "server.titles.notFound": "This title isn't in any library.",
  "server.titles.gone": "This title isn't in any library. Reload the page.",
  "server.titles.fileGone": "This file isn't in any library. Reload the page.",
  "server.playback.unplayable": "This device can't play this file.",
  "server.profiles.notFound": "Nobody on this server has that username.",
  "server.people.noCredits":
    "No movie or show in the libraries credits this person.",

  // rpc/images.ts: editing the images of a title, season, or episode.
  "server.images.needsSeason": "Give the episode's season too.",
  "server.images.noSeasons": "Only shows have seasons and episodes.",
  "server.images.wrongSlot":
    "Movies and shows take a poster, backdrop, or logo, seasons a poster, and episodes a still.",
  "server.images.gone": "That image isn't available any more. Search again.",

  // media/download-encode.ts: what a download spec asks of a file. The
  // longer "audio" text comes before the shorter one it would also match.
  "server.downloads.unreadable":
    "This file can't be read. Try again once the server has scanned it.",
  "server.downloads.notVideo": "Only videos can be downloaded this way.",
  "server.downloads.noDuration":
    "The server doesn't know how long this video is, so it can't make a download of it.",
  "server.downloads.noAudioTrack": "This file has no audio track {index}.",
  "server.downloads.audioTwice": "Pick each audio track once.",
  "server.downloads.audioNotMp4":
    "{format} audio can't go in an MP4 file as it is. Convert that track instead.",
  "server.downloads.cantEncodeAudio": "This server can't encode {codec} audio.",
  "server.downloads.cantEncodeVideo": "This server can't encode {codec}.",
  "server.downloads.burnInNeedsEncode":
    "Burning in subtitles needs the video converted.",
  "server.downloads.noPictureSubtitle":
    "This file has no picture subtitle with that id.",
  "server.downloads.videoNotMp4":
    "{codec} video can't go in an MP4 file as it is. Convert the video instead.",
  "server.downloads.encodeFailed":
    "The server can't encode this video with its transcoding settings.",

  // The metadata providers, as the library dialog lists them, and their
  // failures in rpc/titles.ts, rpc/libraries.ts, and metadata/refresh.ts.
  "server.metadata.tmdbDescription":
    "The Movie Database. Movies and shows, with episode stills and logos. Radarr uses it.",
  "server.metadata.tmdbSetup":
    "Set MATINEE_TMDB_API_KEY to an API key or read access token.",
  "server.metadata.tmdbNotSetUp":
    "TMDB isn't set up. Set MATINEE_TMDB_API_KEY to an API key or read access token.",
  "server.metadata.tmdbRejectedKey":
    "TMDB rejected the API key. Set MATINEE_TMDB_API_KEY to an API key or read access token.",
  "server.metadata.tmdbKeyMissing": "MATINEE_TMDB_API_KEY isn't set",
  "server.metadata.tvdbDescription":
    "Shows in the season order Sonarr uses, plus movies, logos, and episode images.",
  "server.metadata.tvdbSetup":
    "Set MATINEE_TVDB_API_KEY, and MATINEE_TVDB_PIN if your key needs a subscriber PIN.",
  "server.metadata.tvdbNotSetUp":
    "TheTVDB isn't set up. Set MATINEE_TVDB_API_KEY, and MATINEE_TVDB_PIN if your key needs a subscriber PIN.",
  "server.metadata.tvdbRejectedKey":
    "TheTVDB rejected the API key. Set MATINEE_TVDB_API_KEY, and MATINEE_TVDB_PIN if your key needs a subscriber PIN.",
  "server.metadata.tvdbKeyMissing": "MATINEE_TVDB_API_KEY isn't set",
  "server.metadata.rejectedKey":
    "{provider} rejected the API key. Check the server's configuration.",
  "server.metadata.noEntry": "{provider} has no entry with that id.",
  "server.metadata.noAnswer":
    "{provider} didn't answer. Try again in a minute.",
  "server.metadata.keepsFailing": "{provider} keeps failing, stopping for now.",
  "server.metadata.unreachable": "Couldn't reach {provider}",
  // metadata/http.ts, and media/artwork.ts with an image URL as {name}.
  "server.metadata.answeredFor": "{provider} answered {status} for {path}",
  "server.metadata.answered": "{name} answered {status}",

  // media/process.ts: ffmpeg and ffprobe runs in jobs. {detail} is the
  // end of what the program printed.
  "server.process.startFailed": "Couldn't start {name} ({command}): {error}",
  "server.process.timedOutDetail":
    "{name} timed out after {seconds} s: {detail}",
  "server.process.timedOut": "{name} timed out after {seconds} s",
  "server.process.exitedDetail": "{name} exited with {code}: {detail}",
  "server.process.exited": "{name} exited with {code}",

  // Job failures in media/: ffprobe.ts, blurhash.ts, trickplay.ts, artwork.ts.
  "server.media.ffprobeNotJson": "ffprobe printed something other than JSON",
  "server.media.ffprobeNoStreams": "ffprobe found no video or audio streams",
  "server.media.noPamHeader": "ffmpeg's output has no PAM header",
  "server.media.notRgba": "ffmpeg's output isn't an RGBA image",
  "server.media.noFrameSize": "ffprobe didn't read the size of {path}",
  "server.media.noFrame":
    "ffmpeg couldn't decode a single frame of the video. The file may be damaged or incomplete.",
  "server.media.tooLarge": "{url} is too large",
  "server.media.notImage": "{url} isn't a JPEG, PNG, or WebP image",

  // transcode/: the capability checks' errors when ffmpeg printed nothing.
  "server.transcoding.timedOut": "Timed out.",
  "server.transcoding.deviceClosed": "The device didn't open.",
  "server.transcoding.ffmpegDidntRun": "ffmpeg didn't run.",
  "server.transcoding.ffmpegFailed": "ffmpeg failed.",
})
