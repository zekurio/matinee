import type { TranslationOf } from "../../catalog"
import type source from "../en/desktop"

export default {
  "desktop.video.title": "Video",
  "desktop.hardwareDecoding": "Hardware-Decodierung",
  "desktop.audio.title": "Audio",
  "desktop.audio.device": "Ausgabegerät",
  "desktop.audio.device.auto": "Systemstandard",
  "desktop.audio.channels": "Lautsprecher",
  "desktop.audio.channels.auto": "Wie das Gerät meldet",
  "desktop.audio.channels.stereo": "Stereo",
  "desktop.audio.channels.5.1": "5.1-Surround",
  "desktop.audio.channels.7.1": "7.1-Surround",
  "desktop.audio.exclusive": "Gerät exklusiv nutzen",
  "desktop.passthrough.title": "Passthrough an einen Receiver",
  "desktop.window.title": "Fenster",
  "desktop.scale": "Oberflächengröße",
  "desktop.fullscreen": "Im Vollbild öffnen",
  "desktop.about.title": "Über",
  "desktop.about.version": "App-Version",
  "desktop.settings.failed":
    "Die Einstellungen der App konnten nicht geändert werden",

  "desktop.switchServer": "Server wechseln",
  "desktop.quit": "Beenden",

  "desktop.signedOut.title": "Abgemeldet",
  "desktop.signedOut.description": "Die App bringt dich zu ihrer Anmeldung.",
  "desktop.setup.title": "Einrichtung im Browser abschließen",
  "desktop.setup.description":
    "Dieser Server hat noch kein Konto. Öffne {url} in einem Browser, um das erste anzulegen, und melde dich dann hier an.",
  "desktop.invite.title": "Einladung im Browser öffnen",
  "desktop.invite.description":
    "Zum Anlegen eines Kontos braucht es einen Passkey, den die App nicht erstellen kann. Öffne den Einladungslink in einem Browser und melde dich dann hier an.",
  "desktop.passkeys.browser":
    "Die App kann keine Passkeys erstellen. Füge einen im Browser hinzu.",
  "desktop.oidc.browser":
    "Die App kann die Verknüpfung mit {provider} nicht abschließen. Verknüpfe es im Browser.",

  "desktop.update.title": "Desktop-App aktualisieren",
  "desktop.update.text":
    "Diese Version ist zu alt für diesen Server. Videos laufen deshalb wie im Browser, und manche spielen vielleicht nicht.",
  "desktop.update.dismiss": "Schließen",
} satisfies TranslationOf<typeof source>
