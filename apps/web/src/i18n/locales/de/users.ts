import { plural, type TranslationOf } from "../../catalog"
import type source from "../en/users"

export default {
  "users.title": "Benutzer",
  "users.loadFailed": "Die Benutzer konnten nicht geladen werden. {error}",
  "users.retry": "Erneut versuchen",
  "users.madeAdmin": "{name} ist jetzt Admin",
  "users.steppedDown": "Du bist kein Admin mehr",
  "users.removedAdmin": "{name} ist kein Admin mehr",
  "users.deleted": "{name} gelöscht",
  "users.endedOwnSessions": plural({
    one: "{count} Sitzung auf anderen Geräten beendet",
    other: "{count} Sitzungen auf anderen Geräten beendet",
  }),
  "users.endedSessions": plural({
    one: "{name} wurde aus {count} Sitzung abgemeldet",
    other: "{name} wurde aus {count} Sitzungen abgemeldet",
  }),

  "users.signOut.ownTitle": "Deine anderen Sitzungen abmelden?",
  "users.signOut.title": "{name} überall abmelden?",
  "users.signOut.ownDescription":
    "Alle anderen Geräte müssen sich neu anmelden.",
  "users.signOut.description": "Alle Geräte müssen sich neu anmelden.",
  "users.signOut.ownConfirm": "Andere abmelden",
  "users.signOut.confirm": "Überall abmelden",
  "users.delete.ownTitle": "Dein Konto löschen?",
  "users.delete.title": "{name} löschen?",
  "users.delete.ownDescription":
    "Deine Passkeys und dein Wiedergabefortschritt werden mitgelöscht. Das lässt sich nicht rückgängig machen.",
  "users.delete.description":
    "Die Passkeys und der Wiedergabefortschritt des Kontos werden mitgelöscht. Das lässt sich nicht rückgängig machen.",
  "users.delete.ownConfirm": "Mein Konto löschen",
  "users.delete.confirm": "Benutzer löschen",

  "users.admin": "Admin",
  "users.you": "(du)",
  "users.actions": "Aktionen für {name}",
  "users.menu.stepDown": "Als Admin zurücktreten",
  "users.menu.removeAdmin": "Admin-Rolle entziehen",
  "users.menu.makeAdmin": "Zum Admin machen",
  "users.menu.signOutOthers": "Andere Sitzungen abmelden",
  "users.menu.signOut": "Überall abmelden",
  "users.menu.deleteOwn": "Mein Konto löschen",
  "users.menu.delete": "Benutzer löschen",
  "users.lastAdmin": "Mach zuerst jemand anderen zum Admin.",
  "users.menu.access": "Zugriff bearbeiten",
  "users.adminAccess": "Admins öffnen jede Mediathek und haben keine Grenzen.",
  "users.groupFromProvider": "Bei der Anmeldung von {provider} gesetzt",
  "users.groupFromProviderShort": "(von {provider})",
  "users.ownAccess": "Eigene Grenzen",
  "users.ownAccessHint": "Hat eigene Einstellungen über seinen Gruppen",
  "users.ownAccessFromProvider":
    "Bei der Anmeldung vom Richtlinien-Claim von {provider} gesetzt",
  "users.passkeys": plural({
    one: "{count} Passkey",
    other: "{count} Passkeys",
  }),
  "users.passkeysOff": plural({
    one: "{count} Passkey (aus)",
    other: "{count} Passkeys (aus)",
  }),
  "users.oidcOff": "Single Sign-on (aus)",
  "users.noSignIn": "Keine Möglichkeit zur Anmeldung",
  "users.joined": "Dabei seit {date}",
  "users.activeNow": "Gerade aktiv",
  "users.signedOut": "Abgemeldet",
  "users.activeRecently": "Kürzlich aktiv",
  "users.lastSeen": "Zuletzt gesehen {when}",

  "users.dialog.cancel": "Abbrechen",
  "users.role.makeTitle": "{name} zum Admin machen?",
  "users.role.makeDescription":
    "Admins verwalten Mediatheken, Einstellungen und alle Konten.",
  "users.role.makeConfirm": "Zum Admin machen",
  "users.role.stepDownTitle": "Als Admin zurücktreten?",
  "users.role.stepDownDescription":
    "Nur ein anderer Admin kann dir die Rolle zurückgeben.",
  "users.role.stepDownConfirm": "Zurücktreten",
  "users.role.removeTitle": "{name} die Admin-Rolle entziehen?",
  "users.role.removeDescription":
    "Das Konto und sein Wiedergabefortschritt bleiben erhalten.",
  "users.role.removeConfirm": "Admin-Rolle entziehen",

  "users.invites.title": "Einladungslinks",
  "users.invites.create": "Jemanden einladen",
  "users.invites.passkeysOff":
    "Ein Einladungslink erstellt ein Konto mit Passkey. Schalte Passkeys unter Einstellungen → Authentifizierung ein, um einen zu erstellen.",
  "users.invites.loadFailed":
    "Die Einladungslinks konnten nicht geladen werden. {error}",
  "users.invites.empty":
    "Kein Einladungslink wartet darauf, benutzt zu werden.",
  "users.invites.noNote": "Keine Notiz",
  "users.invites.made": "Erstellt am {date}",
  "users.invites.expires": "Läuft {when} ab",
  "users.invites.expiresAt": "Läuft am {date} ab",
  "users.invites.joins": "Kommt in {groups}",
  "users.invites.revoke": "Einladungslink widerrufen",
  "users.invites.revokeNamed": "Einladungslink für {note} widerrufen",
  "users.invites.revoked": "Einladungslink widerrufen",
  "users.invites.revokeFailed":
    "Der Einladungslink konnte nicht widerrufen werden",

  "users.invites.dialog.description":
    "Die Person öffnet den Link, wählt einen Benutzernamen und erstellt einen Passkey.",
  "users.invites.dialog.note": "Notiz",
  "users.invites.dialog.noteHint": "Für wen er ist. Nur Admins sehen sie.",
  "users.invites.dialog.expiry": "Gültig für",
  "users.invites.dialog.groups": "Gruppen",
  "users.invites.dialog.groupsHint":
    "Das neue Konto startet in diesen Gruppen und in der Gruppe Alle.",
  "users.invites.dialog.submit": "Link erstellen",
  "users.invites.link.title": "Schick diesen Link",
  "users.invites.link.description":
    "Er funktioniert einmal, bis {date}. Kopiere ihn jetzt, denn er kann nicht noch einmal angezeigt werden.",
  "users.invites.link.label": "Einladungslink",
  "users.invites.link.copy": "Kopieren",
  "users.invites.link.copied": "Kopiert",
  "users.invites.link.done": "Fertig",
} satisfies TranslationOf<typeof source>
