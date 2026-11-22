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
  "access.transcode.on": "Mit Videokodierung",
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
  "access.requests": "Anfragen",
  "access.requests.off": "Aus",
  "access.requests.ask": "Freigabe nötig",
  "access.requests.add": "Sofort hinzufügen",
  "access.requests.factOff": "Keine Anfragen",
  "access.requests.factAsk": "Anfragen brauchen Freigabe",
  "access.requests.factAdd": "Anfragen sofort hinzugefügt",
  "access.requests.factLimited": "{requests}, {limit}",
  "access.requestLimit": "Limit",
  "access.requestLimit.none": "Kein Limit",
  "access.requestLimit.some": "Begrenzt",
  "access.requestLimit.titles": plural({
    one: "{count} Titel",
    other: "{count} Titel",
  }),
  "access.requestLimit.period": plural({
    one: "pro Tag",
    other: "alle {count} Tage",
  }),
  "access.requestLimit.rate": "{titles} {period}",
  "access.requestLimit.titlesField": "Titel",
  "access.requestLimit.daysField": "Tage",
  "access.requestLimit.titlesEvery": "Titel alle",
  "access.requestLimit.days": "Tage",
  "access.permissions.search": "Berechtigungen durchsuchen",
  "access.permissions.noMatch": "Keine Berechtigung passt.",
  "access.permissions.all": "Jede Berechtigung",
  "access.permissions.allHint": "Admins dürfen alles.",
  "access.permissions.ownOnly":
    "Du kannst nur Berechtigungen vergeben oder entziehen, die du selbst hast.",
  "access.permission.account": "Profil, Bild und Einstellungen des Kontos.",
  "access.permission.adminApiToken": "API-Tokens anderer Konten widerrufen.",
  "access.permission.adminRequest":
    "Die Anfragen aller: die Warteschlange, Freigeben, Ablehnen und erneut Versuchen.",
  "access.permission.adminSession": "Andere Konten abmelden.",
  "access.permission.adminUser":
    "Andere Konten: die Liste, ihre Gruppen und ihr Zugriff, und sie löschen.",
  "access.permission.apiToken": "Die API-Tokens des Kontos.",
  "access.permission.authSettings":
    "Einstellungen für Passkeys und Single Sign-on.",
  "access.permission.branding": "Name und Anmeldeseite des Servers.",
  "access.permission.catalog":
    "Entdecken und der Katalog der Titel, die man anfragen kann.",
  "access.permission.favorite": "Favoriten.",
  "access.permission.folder":
    "Die Ordner des Servers durchsuchen, wie beim Anlegen einer Mediathek.",
  "access.permission.fulfilment":
    "Verbindungen, die angefragte Titel holen, und ihre Regeln.",
  "access.permission.group": "Zugriffsgruppen.",
  "access.permission.invite": "Einladungslinks.",
  "access.permission.job": "Warteschlangen und geplante Aufgaben.",
  "access.permission.library":
    "Mediatheken und ihre Ordner. Ein Scan aktualisiert auch die Metadaten.",
  "access.permission.media":
    "Dateien: ihre Details, sie abspielen und herunterladen.",
  "access.permission.networkSettings": "Netzwerkeinstellungen.",
  "access.permission.oidcAccount": "Die Single-Sign-on-Verknüpfung des Kontos.",
  "access.permission.party": "Watch-Partys.",
  "access.permission.passkey": "Die Passkeys des Kontos.",
  "access.permission.profile": "Die Profile anderer.",
  "access.permission.recommendation": "Empfehlungen.",
  "access.permission.request":
    "Die eigenen Anfragen des Kontos. Mit autoApprove werden sie ohne Freigabe hinzugefügt.",
  "access.permission.serverSetup": "Die Einrichtung des Servers abschließen.",
  "access.permission.serverStats":
    "Die Wiedergabezeit aller, und wer gerade schaut.",
  "access.permission.session":
    "Die Sitzungen des Kontos, und die Anmeldung eines Geräts bestätigen.",
  "access.permission.stats":
    "Die eigenen Statistiken des Kontos und die Bestenliste.",
  "access.permission.title":
    "Titel, Personen, Suche und Bilder. Ändern korrigiert Zuordnungen und Bilder.",
  "access.permission.transcodingSettings": "Einstellungen der Transkodierung.",
  "access.permission.trickplaySettings": "Trickplay-Einstellungen.",
  "access.permission.watchState":
    "Fortschritt, Gesehen-Markierungen, Weiterschauen und Als Nächstes.",
  "access.section.watching": "Schauen",
  "access.section.requests": "Anfragen",
  "access.section.api": "API",
  "access.section.server": "Server verwalten",
  "access.section.serverHint":
    "Teile der Serververwaltung, die Mitglieder übernehmen. Ansehen lässt sie hineinschauen, Verwalten auch ändern.",
  "access.apiTokens": "API-Tokens",
  "access.apiTokens.on": "Darf API-Tokens erstellen",
  "access.apiTokens.hint":
    "Tokens für Skripte und Dienste, die die API als das Konto nutzen.",
  "access.area.requests": "Anfragenliste",
  "access.area.requests.hint":
    "Die Anfragen aller: freigeben, ablehnen, erneut versuchen.",
  "access.area.connections": "Verbindungen",
  "access.area.connections.hint":
    "Radarr, Sonarr und die Regeln, die Anfragen an sie schicken.",
  "access.area.libraries": "Mediatheken",
  "access.area.libraries.hint":
    "Mediatheken hinzufügen, ändern, scannen und löschen.",
  "access.area.metadata": "Metadaten",
  "access.area.metadata.hint":
    "Zuordnungen korrigieren, Metadaten aktualisieren, Bilder setzen.",
  "access.area.users": "Benutzer und Gruppen",
  "access.area.users.hint":
    "Konten, Zugriffsgruppen, Einladungen und wer gerade schaut.",
  "access.area.server": "Servereinstellungen",
  "access.area.server.hint":
    "Transkodierung, Trickplay, Netzwerk, Branding und die Jobs.",
  "access.level.none": "Kein Zugriff",
  "access.level.view": "Ansehen",
  "access.level.manage": "Verwalten",
  "access.level.on": "An",
  "access.level.off": "Aus",
  "access.manages.count": plural({
    one: "Verwaltet {count} Teil des Servers",
    other: "Verwaltet {count} Teile des Servers",
  }),
  "access.manages.area": "{area}: {level}",
  "access.done": "Fertig",
  "access.retry": "Erneut versuchen",

  "access.groups.title": "Zugriffsgruppen",
  "access.groups.create": "Neue Gruppe",
  "access.groups.intro":
    "Für ein Konto gilt jeweils das Großzügigste, was eine seiner Gruppen erlaubt. Einstellungen unter Benutzer gehen vor. Admins haben keine Grenzen und dürfen alles.",
  "access.groups.loadFailed":
    "Die Gruppen konnten nicht geladen werden. {error}",
  "access.groups.onlyEveryone":
    "Jedes Konto ist in Alle. Weitere Gruppen geben einzelnen Konten mehr.",
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
    one: "{count} Mitglied verliert, was nur diese Gruppe erlaubt. Das Konto bleibt.",
    other:
      "{count} Mitglieder verlieren, was nur diese Gruppe erlaubt. Die Konten bleiben.",
  }),
  "access.group.deleteDescriptionEmpty": "Niemand ist darin.",

  "access.group.newTitle": "Neue Gruppe",
  "access.group.editTitle": "{name} bearbeiten",
  "access.group.description":
    "Für Mitglieder gilt jeweils das Großzügigste, was eine ihrer Gruppen erlaubt.",
  "access.group.everyoneDescription":
    "Jedes Konto ist in dieser Gruppe. Nimm ihr die Mediatheken weg, damit Zugriff nur noch über andere Gruppen geht. Ihre Grenzen gelten dann nur für Konten, denen keine Gruppe etwas öffnet.",
  "access.group.name": "Name",
  "access.group.namePlaceholder": "Familie",
  "access.group.providerGroup": "Anbietergruppe",
  "access.group.providerGroupPlaceholder": "Keine",
  "access.group.providerGroupHint":
    "Konten aus dieser Anbietergruppe kommen bei der Anmeldung hinzu und gehen, wenn sie dort entfernt werden.",
  "access.group.providerGroupHintNoClaim":
    "Noch keine Anbietergruppen. Setze den Gruppen-Claim unter Einstellungen → Authentifizierung.",
  "access.group.providerAccounts": plural({
    one: "{count} Konto",
    other: "{count} Konten",
  }),
  "access.group.checkFields": "Prüfe die Felder.",
  "access.group.save": "Speichern",
  "access.group.create": "Gruppe anlegen",

  "access.user.title": "Zugriff für {name}",
  "access.user.description":
    "Ein Konto bekommt das Meiste, was seine Gruppen erlauben. Einstellungen hier gehen vor.",
  "access.user.gets": "Was {name} bekommt",
  "access.user.getsAfterSave":
    "Speichere, um zu sehen, was deine Änderungen ergeben.",
  "access.user.theProvider": "dem Anmeldeanbieter",
  "access.user.claimsSynced":
    "Gruppen und Claims zuletzt {when} von {provider} gelesen.",
  "access.user.claimsNever":
    "Noch keine Claims von {provider} gelesen. Das passiert bei der nächsten Anmeldung.",
  "access.user.groups": "Gruppen",
  "access.user.everyoneHint": "Jedes Konto ist darin.",
  "access.user.groupFromProvider":
    "Der Gruppen-Claim von {provider} hat dieses Konto hierher gebracht. Nur bei {provider} wird es bei der nächsten Anmeldung wieder herausgenommen.",
  "access.user.groupFollows":
    "Enthält auch die Konten, die bei {provider} in {group} geführt werden.",
  "access.user.noGroups":
    "Es gibt noch keine anderen Gruppen. Leg eine unter Einstellungen → Zugriff an.",
  "access.user.override": "Für dieses Konto eingestellt",
  "access.user.overrideHint":
    "Aus Gruppen überlässt eine Einstellung den Gruppen. Alles andere gilt vor ihnen.",
  "access.user.overrideFromProvider":
    "Der Richtlinien-Claim von {provider} setzt diese Werte bei jeder Anmeldung. Eine Änderung hier hält nur, bis {name} sich wieder anmeldet.",
  "access.user.fromGroups": "Aus Gruppen",
  "access.user.fromGroupsValue": "Aus Gruppen ({value})",
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
