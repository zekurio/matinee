import type { TranslationOf } from "../../catalog"
import type source from "../en/auth"

export default {
  "auth.username": "Benutzername",
  "auth.usernameHint":
    "Dein Browser oder Passwortmanager speichert den Passkey.",
  "auth.signIn.title": "Bei Matinee anmelden",
  "auth.signIn.passkey": "Mit Passkey anmelden",
  "auth.signIn.oidc": "Weiter mit {provider}",
  "auth.signIn.errorHint":
    "Nutze einen Passkey dieses Servers oder bitte den Admin um Zugang.",
  "auth.signIn.errorHintSso": "Bitte den Admin um Zugang.",
  "auth.signIn.noMethod":
    "Bei diesem Server kann man sich gerade nicht anmelden. Frag den Admin.",
  "auth.signIn.newHere": "Neu auf diesem Server?",
  "auth.signIn.createAccount": "Konto mit Passkey erstellen",
  "auth.signIn.withProvider": "Mit {provider} anmelden",
  "auth.signIn.otherWays": "Andere Wege zur Anmeldung",
  "auth.invite.title": "Du bist zu Matinee eingeladen",
  "auth.invite.description":
    "Wähle einen Benutzernamen und erstelle dann einen Passkey, mit dem du dich anmeldest. Dieser Link funktioniert bis {date}.",
  "auth.invite.checking": "Einladungslink wird geprüft",
  "auth.invite.checkFailed": "Der Einladungslink konnte nicht geprüft werden",
  "auth.invite.retry": "Erneut versuchen",
  "auth.invite.brokenTitle": "Dieser Einladungslink funktioniert nicht",
  "auth.invite.brokenDescription":
    "Vielleicht ist er abgelaufen, wurde schon benutzt oder widerrufen, oder ein Teil fehlt. Bitte die Person, die ihn geschickt hat, um einen neuen.",
  "auth.invite.unusableTitle":
    "Dieser Einladungslink kann nicht benutzt werden",
  "auth.invite.passkeysOff":
    "Einladungslinks erstellen ein Konto mit Passkey, und Passkeys sind auf diesem Server ausgeschaltet. Bitte die Person, die ihn geschickt hat, um einen anderen Weg.",
  "auth.invite.toSignIn": "Zur Anmeldung",
  "auth.invite.signedInTitle": "Du hast hier schon ein Konto",
  "auth.invite.signedInDescription":
    "Du bist als {username} angemeldet, deshalb bleibt die Einladung unbenutzt. Lass sie für die Person, für die sie gedacht ist.",
  "auth.invite.continue": "Weiter zu Matinee",
  "auth.setup.title": "Matinee einrichten",
  "auth.setup.createAdmin": "Erstelle das Admin-Konto.",
  "auth.setup.oidc":
    "Melde dich mit {provider} an, um das Admin-Konto zu erstellen. Das kann nur, wer dort Admin ist.",
  "auth.setup.enterToken":
    "Gib den Einrichtungstoken ein, um diesen Server zu übernehmen.",
  "auth.setup.token": "Einrichtungstoken",
  "auth.setup.tokenHint": "Der Server schreibt ihn beim Start in sein Log.",
  "auth.setup.continue": "Weiter",
  "auth.setup.adminPasskey": "Admin mit Passkey erstellen",
  "auth.setup.adminOidc": "Admin mit {provider} erstellen",
  "auth.setup.noMethod":
    "Passkeys sind aus und Single Sign-on ist nicht eingerichtet, also lässt sich das Admin-Konto nicht erstellen.",
  "auth.setup.noMethodHint":
    "Setze MATINEE_PASSKEYS_ENABLED=true oder die MATINEE_OIDC_*-Variablen und starte den Server neu.",
  "auth.setup.step": "Schritt {current} von {total}",
  "auth.setup.back": "Zurück",
  "auth.setup.skip": "Überspringen",
  "auth.setup.transcoding.title": "Transkodierung",
  "auth.setup.transcoding.description":
    "Kann ein Browser eine Datei nicht so abspielen, wie sie ist, wandelt Matinee sie beim Abspielen um. Eine GPU macht das schneller und lässt die CPU frei. Der Rest steht unter Einstellungen → Transkodierung.",
  "auth.setup.libraries.title": "Mediatheken",
  "auth.setup.libraries.description":
    "Füge die Ordner mit deinen Filmen und Serien hinzu. Matinee durchsucht sie und lädt Poster und Details. Weitere kannst du unter Einstellungen → Mediatheken hinzufügen.",
  "auth.setup.done.title": "Matinee ist bereit",
  "auth.setup.done.description":
    "Scans und Metadaten laufen im Hintergrund weiter. Alles hier Eingerichtete lässt sich später unter Einstellungen ändern.",
  "auth.setup.finish": "Zur Startseite",
} satisfies TranslationOf<typeof source>
