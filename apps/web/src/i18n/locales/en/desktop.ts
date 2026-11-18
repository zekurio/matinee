import { defineMessages } from "../../catalog"

export default defineMessages("desktop", {
  // Settings → Desktop app: this computer's settings, which the app keeps.
  "desktop.video.title": "Video",
  "desktop.hardwareDecoding": "Hardware decoding",
  "desktop.audio.title": "Audio",
  "desktop.audio.device": "Output device",
  "desktop.audio.device.auto": "System default",
  "desktop.audio.channels": "Speakers",
  "desktop.audio.channels.auto": "As the device reports",
  "desktop.audio.channels.stereo": "Stereo",
  "desktop.audio.channels.5.1": "5.1 surround",
  "desktop.audio.channels.7.1": "7.1 surround",
  "desktop.audio.exclusive": "Use the device exclusively",
  // Formats sent to an AV receiver undecoded, one switch each.
  "desktop.passthrough.title": "Passthrough to a receiver",
  "desktop.window.title": "Window",
  "desktop.scale": "Interface size",
  "desktop.fullscreen": "Open in full screen",
  "desktop.about.title": "About",
  "desktop.about.version": "App version",
  "desktop.settings.failed": "Couldn't change the app's settings",

  // The account menu.
  "desktop.switchServer": "Switch server",
  "desktop.quit": "Quit",

  // Pages the app can't use, which say where to go instead.
  "desktop.signedOut.title": "Signed out",
  "desktop.signedOut.description": "The app takes you to its sign-in.",
  "desktop.setup.title": "Finish setup in a browser",
  // {url} is this server's address.
  "desktop.setup.description":
    "This server has no account yet. Open {url} in a browser to create the first one, then sign in here.",
  "desktop.invite.title": "Open the invite in a browser",
  "desktop.invite.description":
    "Creating an account takes a passkey, which the app can't make. Open the invite link in a browser, then sign in here.",
  "desktop.passkeys.browser":
    "The app can't make passkeys. Add one in a browser.",
  // {provider} is the sign-in provider's name, like Authentik.
  "desktop.oidc.browser":
    "The app can't finish linking {provider}. Link it in a browser.",

  // The banner in an app older than the server's web app.
  "desktop.update.title": "Update the desktop app",
  "desktop.update.text":
    "This version is too old for this server, so videos play as in a browser and some may not play.",
  "desktop.update.dismiss": "Dismiss",
})
