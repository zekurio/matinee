import type { TranslationOf } from "../../catalog"
import type source from "../en/link"

export default {
  "link.device.title": "Gerät anmelden",
  "link.device.enterCode":
    "Gib den Code ein, den dein Fernseher oder deine App anzeigt.",
  "link.device.code": "Code",
  "link.device.continue": "Weiter",
  "link.device.signedIn": "Angemeldet",
  "link.device.signedInDescription":
    "{device} ist als {name} angemeldet. Es kann ein paar Sekunden dauern, bis es das bemerkt.",
  "link.device.home": "Zu Matinee",
  "link.device.codeGone": "Dieser Code funktioniert nicht",
  "link.device.codeGoneDescription":
    "Prüfe den Code auf dem Gerät oder fang dort neu an, um einen neuen zu bekommen.",
  "link.device.lookupFailed": "Der Code konnte nicht abgefragt werden",
  "link.device.anotherCode": "Anderen Code eingeben",
  "link.device.retry": "Erneut versuchen",
  "link.device.wants": "Dieses Gerät möchte Matinee als {name} nutzen.",
  "link.device.codeShown": "Code {code}",
  "link.device.approve": "Bestätigen",
  "link.device.warning":
    "Bestätige nur Codes von einem Gerät, das vor dir steht. Wer dir einen Code schickt, kommt in dein Konto, sobald du ihn bestätigst.",

  "link.app.invalid": "Diese Anmeldung funktioniert nicht",
  "link.app.invalidDescription":
    "Die App hat eine unvollständige Anfrage gesendet. Versuch es in der App noch einmal.",
  "link.app.title": "App anmelden",
  "link.app.wants": "Diese App möchte Matinee als {name} nutzen.",
  "link.app.signIn": "Anmelden",
  "link.app.sent":
    "Zurück zur App. Du kannst diese Seite schließen, sobald sie sich öffnet.",
  "link.app.caution":
    "Fahre nur fort, wenn du gerade auf diesem Gerät mit der Anmeldung begonnen hast.",

  "link.oidc.signInTitle": "Bei Matinee anmelden",
  "link.oidc.signInDescription":
    "Dein {provider}-Benutzername passt zu einem bestehenden Konto. Melde dich bei diesem Konto an, um {provider} zu verknüpfen.",
  "link.oidc.passkey": "Mit Passkey anmelden",
  "link.oidc.notYours": "Nicht dein Konto?",
  "link.oidc.createAccount": "Neues Konto erstellen",
  "link.oidc.createFailed": "Das Konto konnte nicht erstellt werden",
  "link.oidc.takenTitle": "Dieser Benutzername ist vergeben",
  "link.oidc.takenDescription":
    "Dein {provider}-Benutzername passt zu einem Konto, das nicht mit {provider} verknüpft ist. Solange Passkeys aus sind, kann es nur verknüpfen, wer bei diesem Konto angemeldet ist. Wenn es deins ist, bitte den Admin um Hilfe.",
  "link.oidc.descriptionNamed":
    "Angemeldet als {username}. Verknüpfe das {provider}-Konto {account}, um dich nächstes Mal damit anzumelden.",
  "link.oidc.description":
    "Angemeldet als {username}. Verknüpfe dein {provider}-Konto, um dich nächstes Mal damit anzumelden.",
  "link.oidc.link": "{provider} verknüpfen",
  "link.oidc.notNow": "Nicht jetzt",
  "link.oidc.linked": "{provider} verknüpft",
  "link.oidc.linkFailed": "Das Konto konnte nicht verknüpft werden",
} satisfies TranslationOf<typeof source>
