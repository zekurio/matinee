import { plural, type TranslationOf } from "../../catalog"
import type source from "../en/access"

export default {
  "access.everyone": "Alle",
  "access.libraries": "Mediatheken",
  "access.libraries.all": "Alle Mediatheken",
  "access.libraries.picked": "Ausgewählte Mediatheken",
  "access.libraries.none": "Keine Mediatheken",
  "access.libraries.count": plural({
    one: "{count} Mediathek",
    other: "{count} Mediatheken",
  }),
  "access.libraries.allHint": "Auch Mediatheken, die später dazukommen.",
  "access.libraries.noneOnServer": "Es gibt noch keine Mediatheken.",
  "access.bitrate": "Bitratenlimit",
  "access.bitrate.none": "Kein Bitratenlimit",
  "access.bitrate.upTo": "Bis {rate}",
  "access.bitrate.hint":
    "Eine Datei über dem Limit wird als Transkodierung darunter gestreamt. Downloads sind nicht begrenzt.",
  "access.transcode": "Videokodierung",
  "access.transcode.on": "Kodiert Video",
  "access.transcode.off": "Keine Videokodierung",
  "access.transcode.hint":
    "Der Server darf Video kodieren, damit es ins Limit oder zu einem Gerät passt. Aus spielt eine Datei so, wie sie ist, oder mit kopiertem Video, und eine, die kodiert werden müsste, spielt nicht.",
  "access.downloads": "Downloads",
  "access.downloads.on": "Darf herunterladen",
  "access.downloads.off": "Keine Downloads",
  "access.downloads.hint":
    "Dateien, wie sie sind, und Versionen für ein Gerät.",
  "access.streams": "Gleichzeitige Streams",
  "access.streams.none": "Beliebig viele Geräte",
  "access.streams.count": plural({
    one: "{count} Gerät gleichzeitig",
    other: "{count} Geräte gleichzeitig",
  }),
  "access.streams.hint": "Wie viele Geräte gleichzeitig abspielen dürfen.",
  "access.cancel": "Abbrechen",
  "access.done": "Fertig",
  "access.retry": "Erneut versuchen",

  "access.groups.title": "Zugriffsgruppen",
  "access.groups.create": "Neue Gruppe",
  "access.groups.intro":
    "Ein Konto bekommt das Großzügigste, was seine Gruppen erlauben. Was unter Benutzer für ein Konto eingestellt ist, gilt vor seinen Gruppen. Admins haben keine Grenzen.",
  "access.groups.loadFailed":
    "Die Gruppen konnten nicht geladen werden. {error}",
  "access.groups.onlyEveryone":
    "Jedes Konto ist in der Gruppe Alle. Leg eine Gruppe an, um manchen Konten mehr zu geben als anderen.",
  "access.group.everyAccount": "Jedes Konto",
  "access.group.members": plural({
    one: "{count} Mitglied",
    other: "{count} Mitglieder",
  }),
  "access.group.follows": "Folgt {group} beim Anbieter",
  "access.group.actions": "Aktionen für {name}",
  "access.group.edit": "Bearbeiten",
  "access.group.delete": "Gruppe löschen",
  "access.group.deleted": "{name} gelöscht",
  "access.group.deleteTitle": "{name} löschen?",
  "access.group.deleteDescription": plural({
    one: "Ihr {count} Mitglied verliert, was nur diese Gruppe erlaubt hat. Das Konto bleibt.",
    other:
      "Ihre {count} Mitglieder verlieren, was nur diese Gruppe erlaubt hat. Die Konten bleiben.",
  }),
  "access.group.deleteDescriptionEmpty": "Niemand ist darin.",

  "access.group.newTitle": "Neue Gruppe",
  "access.group.editTitle": "{name} bearbeiten",
  "access.group.description":
    "Mitglieder bekommen das Großzügigste, was ihre Gruppen erlauben.",
  "access.group.everyoneDescription":
    "Jedes Konto ist in dieser Gruppe. Nimm ihr die Mediatheken weg, damit Zugriff nur noch über andere Gruppen geht.",
  "access.group.name": "Name",
  "access.group.namePlaceholder": "Familie",
  "access.group.providerGroup": "Anbietergruppe",
  "access.group.providerGroupPlaceholder": "Keine",
  "access.group.providerGroupHint":
    "Konten, die der Anbieter in dieser Gruppe führt, kommen bei jeder Anmeldung hinzu und gehen, sobald er sie dort nicht mehr führt. Leer lassen für eine Gruppe, die nur Admins und Einladungen füllen.",
  "access.group.providerGroupHintNoClaim":
    "Konten, die der Anbieter in dieser Gruppe führt, kommen bei jeder Anmeldung hinzu. Vom Anbieter sind noch keine Gruppen gekommen. Dafür braucht es den Gruppen-Claim unter Einstellungen → Authentifizierung.",
  "access.group.providerAccounts": plural({
    one: "{count} Konto",
    other: "{count} Konten",
  }),
  "access.group.allows": "Mitglieder bekommen",
  "access.group.checkFields": "Prüfe die Felder.",
  "access.group.save": "Speichern",
  "access.group.create": "Gruppe anlegen",

  "access.user.title": "Zugriff für {name}",
  "access.user.description":
    "Gruppen geben das Großzügigste, was sie erlauben. Was hier eingestellt ist, gilt vor den Gruppen.",
  "access.user.gets": "Was {name} bekommt",
  "access.user.getsAfterSave":
    "Speichere, um zu sehen, was deine Änderungen ergeben.",
  "access.user.theProvider": "Single Sign-on",
  "access.user.claimsSynced":
    "Gruppen und Claims zuletzt {when} von {provider} gelesen.",
  "access.user.claimsNever":
    "Noch keine Claims von {provider} gelesen. Das passiert bei der nächsten Anmeldung.",
  "access.user.groups": "Gruppen",
  "access.user.everyoneHint": "Jedes Konto ist darin.",
  "access.user.groupFromProvider":
    "Der Gruppen-Claim von {provider} hat dieses Konto hierher gebracht. Nur {provider} kann es bei der nächsten Anmeldung herausnehmen.",
  "access.user.groupFollows":
    "Enthält auch die Konten, die {provider} in {group} führt.",
  "access.user.noGroups":
    "Es gibt noch keine anderen Gruppen. Leg eine unter Einstellungen → Zugriff an.",
  "access.user.override": "Für dieses Konto eingestellt",
  "access.user.overrideHint":
    "Aus Gruppen überlässt eine Einstellung den Gruppen. Alles andere gilt vor ihnen.",
  "access.user.overrideFromProvider":
    "Der Richtlinien-Claim von {provider} setzt diese Werte bei jeder Anmeldung. Eine Änderung hier hält nur, bis {name} sich wieder anmeldet.",
  "access.user.fromGroups": "Aus Gruppen",
  "access.user.allowed": "Erlaubt",
  "access.user.notAllowed": "Nicht erlaubt",
  "access.user.checkFields": "Prüfe die Felder.",
  "access.user.save": "Speichern",
  "access.user.saving": "Wird gespeichert…",
  "access.user.saved": "Gespeichert",
  "access.user.retry": "Erneut versuchen",
  "access.user.goneTitle": "Benutzer nicht gefunden",
  "access.user.gone": "Diesen Benutzer gibt es nicht mehr.",
} satisfies TranslationOf<typeof source>
