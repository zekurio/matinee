import type { TranslationOf } from "../../catalog"
import type source from "../en/common"

export default {
  "common.saveBar.unsaved": "Ungespeicherte Änderungen",
  "common.saveBar.saved": "Änderungen gespeichert",
  "common.saveBar.failed": "Speichern fehlgeschlagen.",
  "common.saveBar.reset": "Zurücksetzen",
  "common.saveBar.save": "Änderungen speichern",
  "common.saveBar.saving": "Wird gespeichert …",
  "common.saveBar.done": "Gespeichert",
  "common.saveBar.retry": "Erneut versuchen",

  "common.error.server":
    "Auf dem Server ist ein Problem aufgetreten. Sieh in seinem Log nach.",
  "common.error.passkeyClosed":
    "Die Passkey-Abfrage wurde geschlossen, bevor sie fertig war.",
  "common.error.passkeyExists":
    "Dieses Gerät hat schon einen Passkey für dein Konto.",
  "common.error.unknown": "Etwas ist schiefgelaufen.",
} satisfies TranslationOf<typeof source>
