/*
 * The source catalog. Where the web app or the Android app says the same
 * thing, the words are theirs, so the apps read alike. {host} is a
 * server's address without its scheme, like watch.example.com.
 */
export default {
  // The corner every screen has.
  "app.version": "Matinee {version}",
  "app.quit": "Quit",
  // The page opened in a browser, or in a shell too old to talk to.
  "app.noShell.title": "Open this in the Matinee app",
  "app.noShell.description":
    "This page picks a server and signs in for the desktop app, and only works inside it.",
  "app.failed.title": "Matinee couldn't start",
  "app.failed.description":
    "The app didn't say which server to show. Try again, or quit and open Matinee again.",
  "app.failed.retry": "Try again",

  // Picking a server. The first run says welcome.
  "servers.welcome.title": "Welcome to Matinee",
  "servers.welcome.description":
    "Enter the address you open Matinee at in a browser, or pick a server on this network.",
  "servers.title": "Servers",
  "servers.description": "Pick the server to watch on, or add another.",
  "servers.saved": "Your servers",
  "servers.signedInAs": "Signed in as {name}",
  "servers.inUse": "In use",
  // The trash button's label on a saved server.
  "servers.remove": "Remove {host}",
  "servers.removeTitle": "Remove {host}?",
  "servers.removeBody":
    "Matinee signs out there and forgets the server on this computer.",
  "servers.removeConfirm": "Remove",
  "servers.removeFailed": "Couldn't remove {host}. Try again.",
  "servers.openFailed": "Couldn't open {host}. Try again.",
  "servers.add": "Add a server",
  "servers.address": "Server address",
  "servers.addressPlaceholder": "watch.example.com",
  "servers.connect": "Connect",
  "servers.empty": "Enter the address of your Matinee server.",
  "servers.invalid":
    "That isn't an address. Try one like watch.example.com or 192.168.1.5:8420.",
  // {address} is what the person typed.
  "servers.unreachable":
    "Couldn't reach {address}. Check the address, and that the server is running.",
  "servers.notMatinee": "{address} doesn't look like a Matinee server.",
  "servers.probeFailed": "Couldn't check that address. Try again.",
  "servers.nearby": "On this network",
  "servers.searching": "Searching…",
  "servers.searchAgain": "Search again",
  "servers.none":
    "No servers found. Is this computer on the same network as the server?",

  // Signing in to a server.
  "signIn.title": "Sign in to Matinee",
  "signIn.on": "On {host}",
  "signIn.browser": "Sign in with your browser",
  "signIn.browserHint":
    "Your browser opens the server's sign-in page. Approve there and Matinee carries on here.",
  "signIn.code": "Sign in with a code",
  "signIn.codeHint":
    "Matinee shows a code to approve from your phone or another device that's signed in. Use it when this computer has no keyboard.",
  "signIn.back": "Back",
  "signIn.cancel": "Cancel",
  "signIn.waiting": "Waiting for approval…",
  "signIn.browserTitle": "Continue in your browser",
  "signIn.browserDescription":
    "Sign in on the page that opened in your browser. This window moves on by itself once you're done.",
  "signIn.noBrowser": "No browser opened? Open this address on this computer:",
  "signIn.copy": "Copy",
  "signIn.copied": "Copied",
  "signIn.useCode": "Sign in with a code instead",
  "signIn.useBrowser": "Sign in with the browser instead",
  "signIn.codeTitle": "Sign in with a code",
  "signIn.codeDescription":
    "Scan the QR code with your phone's camera, or in the Matinee app under Settings › Account.",
  // Followed by the code, on a line of its own.
  "signIn.codeEnter": "Or go to {address} and enter",
  "signIn.codeQr": "QR code for the code {code}",
  // {time} is minutes and seconds, like 4:59.
  "signIn.expiresIn": "Expires in {time}",
  "signIn.loadingCode": "Getting a code…",
  "signIn.codeExpired": "That code expired.",
  "signIn.codeExpiredShort": "Code expired",
  "signIn.newCode": "Get a new code",
  "signIn.approved": "Signed in",
  "signIn.approvedDescription": "Opening {host}…",
  // How a sign-in ended without a session.
  "signIn.expiredTitle": "The sign-in expired",
  "signIn.expiredDescription":
    "Nobody approved it in time. Start again to try once more.",
  "signIn.deniedTitle": "Couldn't sign in",
  "signIn.deniedDescription":
    "That sign-in didn't come from this app. Try again.",
  "signIn.unreachableTitle": "Can't reach {host}",
  "signIn.unreachableDescription":
    "The server stopped answering. Check that it's running, then try again.",
  "signIn.failedTitle": "Couldn't sign in",
  "signIn.failedDescription":
    "The server didn't finish the sign-in. Try again.",
  "signIn.startFailedTitle": "Couldn't start signing in",
  "signIn.startFailedDescription":
    "Check that {host} is running, then try again.",
  "signIn.retry": "Try again",

  // The current server's session ended.
  "signedOut.title": "You're signed out",
  "signedOut.description":
    "Your session on {host} ended. Sign in again to keep watching here.",
  "signedOut.signIn": "Sign in again",

  // The current server didn't answer.
  "unreachable.title": "Can't reach your server",
  "unreachable.description":
    "{host} didn't answer. Check that the server is running and that this computer is online.",
  "unreachable.retry": "Try again",

  "common.otherServer": "Choose another server",

  // Text the shared components show on their own (packages/ui).
  "ui.close": "Close",
  "ui.cancel": "Cancel",
  "ui.loading": "Loading",
  "ui.notifications": "Notifications",
  "ui.closeToast": "Close notification",
  "ui.pickColor": "Pick a color for {label}",
  "ui.colorArea": "{label} saturation and brightness",
  "ui.colorHue": "{label} hue",
  "ui.colorHex": "{label} hex value",
  "ui.previousMonth": "Go to the previous month",
  "ui.nextMonth": "Go to the next month",
  "ui.today": "Today, {date}",
  "ui.selected": "{date}, selected",
} as const
