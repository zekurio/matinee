import { plural, type TranslationOf } from "../../catalog"
import type source from "../en/oidc"

export default {
  "oidc.loadFailed":
    "Die Anmeldeeinstellungen konnten nicht geladen werden. {error}",
  "oidc.checkField": "Überprüfe {field}.",
  "oidc.checkFields": "Überprüfe die Felder.",
  "oidc.checkFieldIssue": "{check} {issue}",
  "oidc.field.displayName": "Anzeigename",
  "oidc.field.issuerUrl": "Issuer-URL",
  "oidc.field.clientId": "Client-ID",
  "oidc.field.scopes": "Scopes",
  "oidc.field.usernameClaim": "Benutzername-Claim",
  "oidc.field.roleClaim": "Rollen-Claim",
  "oidc.field.clientSecret": "Client-Secret",

  "oidc.passkeys.title": "Passkeys",
  "oidc.passkeys.description":
    "Anmelden per Fingerabdruck, Gesicht oder Sicherheitsschlüssel. Wenn aus, melden sich alle über Single Sign-on an.",
  "oidc.passkeys.unlinked": plural({
    one: "{count} Konto ist nicht mit {provider} verknüpft und kann sich nicht anmelden, solange Passkeys aus sind. Solange es noch angemeldet ist, kann es {provider} unter Einstellungen → Konto verknüpfen.",
    other:
      "{count} Konten sind nicht mit {provider} verknüpft und können sich nicht anmelden, solange Passkeys aus sind. Solange sie noch angemeldet sind, können sie {provider} unter Einstellungen → Konto verknüpfen.",
  }),

  "oidc.title": "Single Sign-on",
  "oidc.description": "OpenID Connect, etwa Authelia, Authentik oder Keycloak.",
  "oidc.enabled": "Aktiviert",
  "oidc.ssoOnly": plural({
    one: "{count} Konto meldet sich nur über {provider} an. Es kann sich erst wieder anmelden, wenn das wieder an ist.",
    other:
      "{count} Konten melden sich nur über {provider} an. Sie können sich erst wieder anmelden, wenn das wieder an ist.",
  }),
  "oidc.allowSignUp": "Konten erstellen",
  "oidc.allowSignUp.description":
    "Bei ersten Anmeldungen, die zu keinem Konto passen.",
  "oidc.displayName.description": "Steht auf dem Anmeldeknopf.",
  "oidc.issuerUrl.override":
    "Überschreibt MATINEE_OIDC_ISSUER_URL. Eine Änderung trennt alle verknüpften Konten.",
  "oidc.issuerUrl.description":
    "Eine spätere Änderung trennt alle verknüpften Konten.",
  "oidc.clientId.override": "Überschreibt MATINEE_OIDC_CLIENT_ID.",

  "oidc.clientSecret.saved": "Gespeichert. Tippe, um es zu ersetzen.",
  "oidc.clientSecret.fromEnvironment":
    "Gesetzt durch MATINEE_OIDC_CLIENT_SECRET",
  "oidc.clientSecret.none": "Keins",
  "oidc.clientSecret.description": "Leer lassen für einen öffentlichen Client.",
  "oidc.clientSecret.useEnvironment": "Das Secret aus der Umgebung verwenden",
  "oidc.clientSecret.remove": "Das gespeicherte Secret entfernen",
  "oidc.clientSecret.environmentApplies":
    "Nach dem Speichern gilt das Secret aus der Umgebung.",
  "oidc.clientSecret.removed": "Das Secret wird beim Speichern entfernt.",

  "oidc.redirectUri": "Weiterleitungs-URI",
  "oidc.redirectUri.description":
    "Trage sie bei den erlaubten Weiterleitungen des Anbieters ein.",
  "oidc.copy": "Kopieren",
  "oidc.copied": "Kopiert",

  "oidc.advanced": "Erweitert",
  "oidc.advanced.show": "Anzeigen",
  "oidc.advanced.hide": "Ausblenden",
  "oidc.scopes.description":
    "Durch Leerzeichen getrennt. Muss openid enthalten.",
  "oidc.usernameClaim.description": "Sonst gilt preferred_username.",
  "oidc.roleClaim.description":
    "Setzt die Rolle bei jeder Anmeldung: admin oder user, oder eine Liste davon. Ohne den Claim bleibt die Rolle, wie sie ist.",
} satisfies TranslationOf<typeof source>
