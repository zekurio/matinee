import { defineMessages } from "../../catalog"

export default defineMessages("link", {
  // Signing in a device by its code, in routes/_authed/link.tsx and the
  // dialog under Settings → Account → Sessions.
  "link.device.title": "Sign in a device",
  "link.device.enterCode": "Enter the code your TV or app shows.",
  // The dialog in Settings, where a phone's camera is the other way in.
  "link.device.enterCodeOrScan":
    "Enter the code your TV or app shows. On a phone, you can scan its QR code with the camera instead.",
  "link.device.code": "Code",
  "link.device.continue": "Continue",
  "link.device.signedIn": "Signed in",
  // {device} is the device's name, {name} the user's.
  "link.device.signedInDescription":
    "{device} is signed in as {name}. It may take a few seconds to notice.",
  "link.device.home": "Go to Matinee",
  "link.device.done": "Done",
  "link.device.codeGone": "That code doesn't work",
  "link.device.codeGoneDescription":
    "Check the code on the device, or start again there for a new one.",
  "link.device.lookupFailed": "Couldn't look up that code",
  "link.device.anotherCode": "Enter another code",
  "link.device.retry": "Try again",
  // {name} is the user's name, in bold.
  "link.device.wants": "This device wants to use Matinee as {name}.",
  // {code} is the code, in a monospace font.
  "link.device.codeShown": "Code {code}",
  "link.device.approve": "Approve",
  "link.device.warning":
    "Only approve a code from a device in front of you. Anyone who sends you a code gets into your account when you approve it.",

  // Signing in an app through the browser, in routes/_authed/authorize.tsx.
  "link.app.invalid": "This sign-in doesn't work",
  "link.app.invalidDescription":
    "The app sent an incomplete request. Try again from the app.",
  "link.app.title": "Sign in an app",
  // {name} is the user's name, in bold.
  "link.app.wants": "This app wants to use Matinee as {name}.",
  "link.app.signIn": "Sign in",
  "link.app.sent":
    "Going back to the app. You can close this page once it opens.",
  "link.app.caution":
    "Only continue if you just started signing in on this device.",

  // Linking a single sign-on account, in oidc-link-page.tsx. {provider}
  // is the provider's name, like Authelia.
  "link.oidc.signInTitle": "Sign in to Matinee",
  "link.oidc.signInDescription":
    "Your {provider} username matches an existing account. Sign in to that account to link {provider}.",
  "link.oidc.passkey": "Sign in with a passkey",
  // Followed by the button in link.oidc.createAccount.
  "link.oidc.notYours": "Not your account?",
  "link.oidc.createAccount": "Create a new account",
  "link.oidc.createFailed": "Couldn't create the account",
  // Signed out with passkeys off, when nothing can sign in to the account.
  "link.oidc.takenTitle": "That username is taken",
  "link.oidc.takenDescription":
    "Your {provider} username matches an account that isn't linked to {provider}. With passkeys off, only someone signed in to that account can link it. If it's yours, ask the admin for help.",
  // {account} is the account's name at the provider.
  "link.oidc.descriptionNamed":
    "Signed in as {username}. Link the {provider} account {account} to sign in with it next time.",
  "link.oidc.description":
    "Signed in as {username}. Link your {provider} account to sign in with it next time.",
  "link.oidc.link": "Link {provider}",
  "link.oidc.notNow": "Not now",
  "link.oidc.linked": "Linked {provider}",
  "link.oidc.linkFailed": "Couldn't link the account",
})
