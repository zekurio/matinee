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
  "auth.signIn.newHere": "Neu auf diesem Server?",
  "auth.signIn.createAccount": "Konto mit Passkey erstellen",
  "auth.setup.title": "Matinee einrichten",
  "auth.setup.createAdmin": "Erstelle das Admin-Konto.",
  "auth.setup.enterToken":
    "Gib den Einrichtungstoken ein, um diesen Server zu übernehmen.",
  "auth.setup.token": "Einrichtungstoken",
  "auth.setup.tokenHint": "Der Server schreibt ihn beim Start in sein Log.",
  "auth.setup.continue": "Weiter",
  "auth.setup.adminPasskey": "Admin mit Passkey erstellen",
  "auth.setup.or": "oder",
  "auth.setup.adminOidc": "Admin mit {provider} erstellen",
} satisfies TranslationOf<typeof source>
