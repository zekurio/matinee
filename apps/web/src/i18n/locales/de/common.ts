import type { TranslationOf } from "../../catalog"
import type source from "../en/common"

export default {
  "common.saveBar.unsaved": "Ungespeicherte Änderungen",
  "common.saveBar.saved": "Änderungen gespeichert",
  "common.saveBar.failed": "Änderungen konnten nicht gespeichert werden",
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
  "common.error.invalidInput":
    "Das hat nicht geklappt. Prüf, was du eingegeben hast, und versuch es erneut.",
  "common.error.pageDescription":
    "Die Seite konnte nicht angezeigt werden. Versuch es erneut oder geh zurück zur Startseite.",
  "common.error.retry": "Erneut versuchen",
  "common.notFound.title": "Seite nicht gefunden",
  "common.notFound.description":
    "Die Adresse ist vielleicht falsch geschrieben, oder die Seite wurde verschoben.",
  "common.backHome": "Zur Startseite",
} satisfies TranslationOf<typeof source>
