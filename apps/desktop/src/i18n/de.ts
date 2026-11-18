import type { TranslationOf } from "./catalog"
import type en from "./en"

export default {
  "app.version": "Matinee {version}",
  "app.quit": "Beenden",
  "app.noShell.title": "Öffne das in der Matinee-App",
  "app.noShell.description":
    "Diese Seite wählt einen Server und meldet die Desktop-App an. Sie funktioniert nur in der App.",
  "app.failed.title": "Matinee konnte nicht starten",
  "app.failed.description":
    "Die App hat nicht gesagt, welchen Server sie zeigen soll. Versuch es erneut, oder beende Matinee und öffne es noch einmal.",
  "app.failed.retry": "Erneut versuchen",

  "servers.welcome.title": "Willkommen bei Matinee",
  "servers.welcome.description":
    "Gib die Adresse ein, unter der du Matinee im Browser öffnest, oder wähle einen Server in diesem Netzwerk.",
  "servers.title": "Server",
  "servers.description":
    "Wähle den Server, auf dem du schauen willst, oder füge einen hinzu.",
  "servers.saved": "Deine Server",
  "servers.signedInAs": "Angemeldet als {name}",
  "servers.inUse": "In Verwendung",
  "servers.remove": "{host} entfernen",
  "servers.removeTitle": "{host} entfernen?",
  "servers.removeBody":
    "Matinee meldet dich dort ab und entfernt den Server von diesem Computer.",
  "servers.removeConfirm": "Entfernen",
  "servers.removeFailed":
    "{host} konnte nicht entfernt werden. Versuch es erneut.",
  "servers.openFailed":
    "{host} konnte nicht geöffnet werden. Versuch es erneut.",
  "servers.add": "Server hinzufügen",
  "servers.address": "Serveradresse",
  "servers.addressPlaceholder": "watch.example.com",
  "servers.connect": "Verbinden",
  "servers.empty": "Gib die Adresse deines Matinee-Servers ein.",
  "servers.invalid":
    "Das ist keine Adresse. Versuch eine wie watch.example.com oder 192.168.1.5:8420.",
  "servers.unreachable":
    "{address} ist nicht erreichbar. Prüfe die Adresse und ob der Server läuft.",
  "servers.notMatinee": "{address} scheint kein Matinee-Server zu sein.",
  "servers.probeFailed":
    "Die Adresse konnte nicht geprüft werden. Versuch es erneut.",
  "servers.nearby": "In diesem Netzwerk",
  "servers.searching": "Suche läuft …",
  "servers.searchAgain": "Erneut suchen",
  "servers.none":
    "Kein Server gefunden. Ist dieser Computer im selben Netzwerk wie der Server?",

  "signIn.title": "Bei Matinee anmelden",
  "signIn.on": "Auf {host}",
  "signIn.browser": "Im Browser anmelden",
  "signIn.browserHint":
    "Dein Browser öffnet die Anmeldeseite des Servers. Bestätige dort, dann geht es hier weiter.",
  "signIn.code": "Mit einem Code anmelden",
  "signIn.codeHint":
    "Matinee zeigt einen Code, den du auf deinem Handy oder einem anderen angemeldeten Gerät bestätigst. Nimm das, wenn dieser Computer keine Tastatur hat.",
  "signIn.back": "Zurück",
  "signIn.cancel": "Abbrechen",
  "signIn.waiting": "Warte auf Bestätigung …",
  "signIn.browserTitle": "Weiter im Browser",
  "signIn.browserDescription":
    "Melde dich auf der Seite an, die sich in deinem Browser geöffnet hat. Dieses Fenster geht danach von selbst weiter.",
  "signIn.noBrowser":
    "Kein Browser geöffnet? Öffne diese Adresse auf diesem Computer:",
  "signIn.copy": "Kopieren",
  "signIn.copied": "Kopiert",
  "signIn.useCode": "Stattdessen mit einem Code anmelden",
  "signIn.useBrowser": "Stattdessen im Browser anmelden",
  "signIn.codeTitle": "Mit einem Code anmelden",
  "signIn.codeDescription":
    "Scanne den QR-Code mit der Kamera deines Handys oder in der Matinee-App unter Einstellungen › Konto.",
  "signIn.codeEnter": "Oder öffne {address} und gib ein",
  "signIn.codeQr": "QR-Code für den Code {code}",
  "signIn.expiresIn": "Läuft in {time} ab",
  "signIn.loadingCode": "Code wird geholt …",
  "signIn.codeExpired": "Dieser Code ist abgelaufen.",
  "signIn.codeExpiredShort": "Code abgelaufen",
  "signIn.newCode": "Neuen Code holen",
  "signIn.approved": "Angemeldet",
  "signIn.approvedDescription": "{host} wird geöffnet …",
  "signIn.expiredTitle": "Die Anmeldung ist abgelaufen",
  "signIn.expiredDescription":
    "Niemand hat sie rechtzeitig bestätigt. Fang noch einmal an.",
  "signIn.deniedTitle": "Anmeldung fehlgeschlagen",
  "signIn.deniedDescription":
    "Diese Anmeldung kam nicht von dieser App. Versuch es erneut.",
  "signIn.unreachableTitle": "{host} ist nicht erreichbar",
  "signIn.unreachableDescription":
    "Der Server antwortet nicht mehr. Prüfe, ob er läuft, und versuch es dann erneut.",
  "signIn.failedTitle": "Anmeldung fehlgeschlagen",
  "signIn.failedDescription":
    "Der Server hat die Anmeldung nicht abgeschlossen. Versuch es erneut.",
  "signIn.startFailedTitle": "Die Anmeldung konnte nicht starten",
  "signIn.startFailedDescription":
    "Prüfe, ob {host} läuft, und versuch es dann erneut.",
  "signIn.retry": "Erneut versuchen",

  "signedOut.title": "Du bist abgemeldet",
  "signedOut.description":
    "Deine Sitzung auf {host} ist beendet. Melde dich erneut an, um hier weiterzuschauen.",
  "signedOut.signIn": "Erneut anmelden",

  "unreachable.title": "Server nicht erreichbar",
  "unreachable.description":
    "{host} antwortet nicht. Prüfe, ob der Server läuft und dieser Computer online ist.",
  "unreachable.retry": "Erneut versuchen",

  "common.otherServer": "Anderen Server wählen",

  "ui.close": "Schließen",
  "ui.cancel": "Abbrechen",
  "ui.loading": "Wird geladen",
  "ui.notifications": "Benachrichtigungen",
  "ui.closeToast": "Benachrichtigung schließen",
  "ui.pickColor": "Farbe für {label} wählen",
  "ui.colorArea": "{label}: Sättigung und Helligkeit",
  "ui.colorHue": "{label}: Farbton",
  "ui.colorHex": "{label}: Hex-Wert",
  "ui.previousMonth": "Zum vorherigen Monat",
  "ui.nextMonth": "Zum nächsten Monat",
  "ui.today": "Heute, {date}",
  "ui.selected": "{date}, ausgewählt",
} satisfies TranslationOf<typeof en>
