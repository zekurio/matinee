import { plural, type TranslationOf } from "../../catalog"
import type source from "../en/account"

export default {
  "account.profile.title": "Profil",
  "account.profile.description":
    "Alle auf diesem Server sehen deinen Namen und dein Bild. Wähle aus, was dein {profile} sonst noch zeigt.",
  "account.profile.link": "Profil",
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
  "account.sharing.stats.description":
    "Wiedergabezeit, meistgesehene Titel und zuletzt Gesehenes.",

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
  "account.oidc.unlink": "Trennen",
  "account.oidc.unlinked": "Verknüpfung mit {provider} getrennt",
  "account.oidc.unlinkFailed":
    "Verknüpfung mit {provider} konnte nicht getrennt werden",
  "account.oidc.none": "Kein {provider}-Konto verknüpft.",

  "account.sessions.title": "Sitzungen",
  "account.sessions.description":
    "Browser und Apps, die bei deinem Konto angemeldet sind.",
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

  "account.device.app": "{platform}-App",
  "account.device.browser": "Browser",

  "account.cancel": "Abbrechen",
} satisfies TranslationOf<typeof source>
