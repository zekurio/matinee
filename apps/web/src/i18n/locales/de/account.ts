import { plural, type TranslationOf } from "../../catalog"
import type source from "../en/account"

export default {
  "account.profile.title": "Profil",
  "account.picture.changeFailed": "Dein Bild konnte nicht geändert werden",
  "account.picture.change": "Bild ändern",
  "account.picture.upload": "Bild hochladen",
  "account.picture.useProvider": "Bild von {provider} verwenden",
  "account.picture.remove": "Bild entfernen",
  "account.picture.unreadable":
    "Das Bild konnte nicht gelesen werden. Versuch es mit einer anderen Datei.",
  "account.picture.noResize": "Dein Browser kann keine Bilder skalieren.",
  "account.picture.prepareFailed": "Das Bild konnte nicht vorbereitet werden.",
  "account.displayName.label": "Anzeigename",
  "account.displayName.saveFailed":
    "Dein Name konnte nicht gespeichert werden. {reason}",

  "account.sharing.failed":
    "Es konnte nicht geändert werden, was dein Profil zeigt",
  "account.sharing.favorites": "Meine Favoriten zeigen",
  "account.sharing.stats": "Meine Statistiken zeigen",

  "account.passkeys.title": "Passkeys",
  "account.passkeys.empty": "Noch keine Passkeys.",
  "account.passkeys.unnamed": "Passkey",
  "account.passkeys.synced": "Synchronisiert",
  "account.passkeys.used": "Zuletzt verwendet {time}",
  "account.passkeys.added": "Hinzugefügt am {date}",
  "account.passkeys.remove": "Passkey entfernen",
  "account.passkeys.removeNamed": "{name} entfernen",
  "account.passkeys.removeTitle": "{name} entfernen?",
  "account.passkeys.removeTitleUnnamed": "Diesen Passkey entfernen?",
  "account.passkeys.removeDescription":
    "Du kannst dich damit nicht mehr anmelden.",
  "account.passkeys.removed": "Passkey entfernt",
  "account.passkeys.removeFailed": "Passkey konnte nicht entfernt werden",
  "account.passkeys.add": "Passkey hinzufügen",
  "account.passkeys.addTitle": "Passkey hinzufügen",
  "account.passkeys.addDescription":
    "Dein Browser fragt dich nach einer Bestätigung.",
  "account.passkeys.name": "Name (optional)",
  "account.passkeys.namePlaceholder": "Arbeitslaptop",
  "account.passkeys.waiting": "Warte auf dein Gerät …",
  "account.passkeys.addSucceeded": "Passkey hinzugefügt",
  "account.passkeys.addFailed": "Passkey konnte nicht hinzugefügt werden",

  "account.oidc.link": "{provider} verknüpfen",
  "account.oidc.linked": "Verknüpft am {date}",
  "account.oidc.stale":
    "Mit einer früheren {provider}-Einrichtung verknüpft, darüber kannst du dich nicht anmelden. Verknüpfe es neu.",
  "account.oidc.unlink": "Trennen",
  "account.oidc.unlinked": "Verknüpfung mit {provider} getrennt",
  "account.oidc.unlinkFailed":
    "Verknüpfung mit {provider} konnte nicht getrennt werden",
  "account.oidc.none": "Kein {provider}-Konto verknüpft.",

  "account.sessions.title": "Sitzungen",
  "account.sessions.signOutOthers": "Andere Sitzungen abmelden",
  "account.sessions.loadFailed":
    "Deine Sitzungen konnten nicht geladen werden. {reason}",
  "account.sessions.signedOut": "{session} abgemeldet",
  "account.sessions.signOutFailed":
    "Diese Sitzung konnte nicht abgemeldet werden",
  "account.sessions.signedOutCount": plural({
    one: "{count} Sitzung abgemeldet",
    other: "{count} Sitzungen abgemeldet",
  }),
  "account.sessions.signOutOthersFailed":
    "Die anderen Sitzungen konnten nicht abgemeldet werden",
  "account.sessions.signOutTitle": "{session} abmelden?",
  "account.sessions.signOutTitleUnnamed": "Diese Sitzung abmelden?",
  "account.sessions.signOutDescription":
    "Sie muss sich erneut anmelden, um Matinee zu nutzen.",
  "account.sessions.signOut": "Abmelden",
  "account.sessions.signOutNamed": "{session} abmelden",
  "account.sessions.signOutOthersTitle": "Alle anderen Sitzungen abmelden?",
  "account.sessions.signOutOthersDescription":
    "Alle Browser und Apps außer diesem müssen sich erneut anmelden.",
  "account.sessions.signOutOthersConfirm": "Andere abmelden",
  "account.sessions.thisDevice": "Dieses Gerät",
  "account.sessions.signedIn": "Angemeldet am {date}",
  "account.sessions.activeNow": "Jetzt aktiv",
  "account.sessions.activeLastHour": "In der letzten Stunde aktiv",
  "account.sessions.active": "Aktiv {time}",

  "account.apiTokens.title": "API-Tokens",
  "account.apiTokens.description":
    "Ein Dienst oder eine App sendet ein Token als Authorization: Bearer, um die API als du aufzurufen, im Rahmen dessen, was dein Konto darf. Tokens laufen nicht ab. Widerrufe eines, sobald es nicht mehr gebraucht wird.",
  "account.apiTokens.empty": "Noch keine API-Tokens.",
  "account.apiTokens.notAllowed": "Dein Konto darf keine API-Tokens erstellen.",
  "account.apiTokens.loadFailed":
    "Deine API-Tokens konnten nicht geladen werden. {reason}",
  "account.apiTokens.create": "Token erstellen",
  "account.apiTokens.createTitle": "API-Token erstellen",
  "account.apiTokens.createDescription":
    "Benenne es nach dem, was es nutzen wird, und gib ihm nur, was das braucht.",
  "account.apiTokens.name": "Name",
  "account.apiTokens.namePlaceholder": "Hausautomation",
  "account.apiTokens.permissions": "Was es darf",
  "account.apiTokens.allPermissions": "Alle Berechtigungen",
  "account.apiTokens.allPermissionsHint":
    "Alles, was du in Matinee tun kannst, auch dieses Konto und seine Tokens ändern.",
  "account.apiTokens.permissionCount": plural({
    one: "{count} Berechtigung",
    other: "{count} Berechtigungen",
  }),
  "account.apiTokens.editNamed": "{name} ändern",
  "account.apiTokens.editTitle": "{name} ändern",
  "account.apiTokens.editDescription":
    "Das Token behält sein Geheimnis. Änderungen gelten ab seiner nächsten Anfrage.",
  "account.apiTokens.save": "Speichern",
  "account.apiTokens.saved": "{name} gespeichert",
  "account.apiTokens.saveFailed":
    "Das API-Token konnte nicht gespeichert werden",
  "account.apiTokens.createFailed":
    "Das API-Token konnte nicht erstellt werden",
  "account.apiTokens.secretTitle": "Token für {name} kopieren",
  "account.apiTokens.secretDescription":
    "Matinee zeigt es nur dieses eine Mal. Bewahre es dort auf, wo der Dienst seine Geheimnisse ablegt.",
  "account.apiTokens.secretLabel": "API-Token",
  "account.apiTokens.copy": "Kopieren",
  "account.apiTokens.copied": "Kopiert",
  "account.apiTokens.done": "Fertig",
  "account.apiTokens.neverUsed": "Nie verwendet",
  "account.apiTokens.usedNow": "Gerade verwendet",
  "account.apiTokens.used": "Verwendet {time}",
  "account.apiTokens.created": "Erstellt am {date}",
  "account.apiTokens.revoke": "Widerrufen",
  "account.apiTokens.revokeNamed": "{name} widerrufen",
  "account.apiTokens.revokeTitle": "{name} widerrufen?",
  "account.apiTokens.revokeDescription":
    "Der Dienst, der es nutzt, funktioniert mit Matinee erst wieder, wenn du ihm ein neues Token gibst.",
  "account.apiTokens.revoked": "{name} widerrufen",
  "account.apiTokens.revokeFailed":
    "Das API-Token konnte nicht widerrufen werden",

  "account.device.app": "{platform}-App",
  "account.device.browser": "Browser",

  "account.cancel": "Abbrechen",
} satisfies TranslationOf<typeof source>
