import { plural, type TranslationOf } from "../../catalog"
import type source from "../en/plugins"

export default {
  "plugins.installed": "Installiert",
  "plugins.builtin": "Eingebaut",
  "plugins.add": "Plugin hinzufügen",
  "plugins.empty.title": "Noch keine Plugins",
  "plugins.empty.description":
    "Plugins bringen weitere Metadatenquellen, Wege zur Anmeldung und Zuhörer für das, was auf dem Server passiert.",
  "plugins.loadFailed": "Die Plugins konnten nicht geladen werden. {error}",
  "plugins.retry": "Erneut versuchen",
  "plugins.unavailable": "Dieser Server kann noch keine Plugins ausführen.",
  "plugins.foldersHint": "Plugin-Ordner auf dem Server erscheinen hier.",
  "plugins.rescan": "Nach Ordnern suchen",
  "plugins.rescanned": "Nach Plugin-Ordnern gesucht",
  "plugins.rescanFailed": "Die Suche nach Plugin-Ordnern ist fehlgeschlagen",
  "plugins.row.toggle": "{name} einschalten",
  "plugins.row.update": "Update auf {version}",
  "plugins.row.unapproved": "Noch nicht freigegeben",
  "plugins.row.deliveryBlocked": "Ereignisse kommen nicht an",
  "plugins.row.deliveryFailing": plural({
    one: "{count} Ereignis scheitert wiederholt",
    other: "{count} Ereignisse scheitern wiederholt",
  }),
  "plugins.enableFailed": "{name} konnte nicht eingeschaltet werden",
  "plugins.disableFailed": "{name} konnte nicht ausgeschaltet werden",
  "plugins.version": "Version {version}",
  "plugins.by": "Von {author}",
  "plugins.homepage": "Website",

  "plugins.state.running": "Läuft",
  "plugins.state.starting": "Startet",
  "plugins.state.disabled": "Aus",
  "plugins.state.needs-approval": "Braucht Freigabe",
  "plugins.state.needs-config": "Braucht Einstellungen",
  "plugins.state.error": "Mit Fehler gestoppt",
  "plugins.state.missing": "Dateien fehlen",
  "plugins.state.incompatible": "Nicht lauffähig",

  "plugins.source.builtin": "Eingebaut",
  "plugins.source.npm": "Aus npm",
  "plugins.source.url": "Aus {host}",
  "plugins.source.directory": "Aus einem Ordner",

  "plugins.provides.metadata": "Metadaten",
  "plugins.provides.auth": "Anmeldung",
  "plugins.provides.events": "Ereignisse",

  "plugins.event.library.scanned": "Mediathek gescannt",
  "plugins.event.title.added": "Titel hinzugefügt",
  "plugins.event.title.matched": "Titel zugeordnet",
  "plugins.event.playback.started": "Wiedergabe gestartet",
  "plugins.event.playback.stopped": "Wiedergabe beendet",
  "plugins.event.playback.watched": "Als gesehen markiert",
  "plugins.event.user.created": "Konto erstellt",

  "plugins.detail.back": "Plugins",
  "plugins.actions": "Aktionen für {name}",
  "plugins.detail.from.npm": "Paket",
  "plugins.detail.from.url": "Adresse",
  "plugins.detail.from.directory": "Ordner",
  "plugins.detail.from.builtin": "Quelle",
  "plugins.detail.status": "Status",
  "plugins.detail.enabled": "Ein",
  "plugins.detail.permissions": "Was es darf",
  "plugins.detail.settings": "Einstellungen",
  "plugins.detail.signIn": "Anmeldung",
  "plugins.detail.log": "Protokoll",
  "plugins.detail.externalFolder":
    "Dieses Plugin stammt aus einem Ordner, den Matinee nur liest. Um es zu entfernen, lösche es dort und suche dann erneut nach Ordnern.",
  "plugins.restart": "Neu starten",
  "plugins.restartFailed": "{name} konnte nicht neu gestartet werden",
  "plugins.leave.title": "Ohne Speichern verlassen?",
  "plugins.leave.description":
    "Deine Änderungen an den Einstellungen von {name} sind noch nicht gespeichert.",
  "plugins.leave.stay": "Weiter bearbeiten",
  "plugins.leave.discard": "Änderungen verwerfen",

  "plugins.reason.builtin":
    "Eingebaute Plugins gehören zu Matinee und sind immer an.",
  "plugins.reason.starting": "Startet gerade.",
  "plugins.reason.disabled": "Schalte es ein, um es zu starten.",
  "plugins.reason.disabledUnapproved":
    "Gib oben frei, was es verlangt, um es einzuschalten.",
  "plugins.reason.needsApproval":
    "Es bleibt gestoppt, bis du freigibst, was es verlangt.",
  "plugins.reason.needsConfig":
    "Fülle unter Einstellungen {fields} aus, um es zu starten.",
  "plugins.reason.needsConfigAny":
    "Fülle seine Einstellungen aus, um es zu starten.",
  "plugins.reason.invalidConfig": plural({
    one: "Der gespeicherte Wert von {fields} passt nicht zu dieser Version. Wähle unter Einstellungen einen neuen, um es zu starten.",
    other:
      "Die gespeicherten Werte von {fields} passen nicht zu dieser Version. Wähle unter Einstellungen neue, um es zu starten.",
  }),
  "plugins.reason.error":
    "Es wurde gestoppt und startet nicht von selbst neu. Sieh ins Protokoll und starte es dann neu.",
  "plugins.reason.missing":
    "Sein Ordner ist nicht mehr auf dem Server. Lege ihn zurück und suche erneut nach Ordnern, oder entferne das Plugin.",
  "plugins.reason.incompatible":
    "Es wurde für eine andere Version von Matinee gebaut.",
  "plugins.reason.more": "Alles zeigen",
  "plugins.reason.less": "Weniger zeigen",

  "plugins.sleep.asleep": "Schläft",
  "plugins.sleep.awake": "Wach",
  "plugins.sleep.asleepTitle": "Läuft, schläft, bis etwas es braucht",
  "plugins.sleep.awakeTitle": "Läuft, gerade wach",
  "plugins.sleep.reason":
    "Es schläft, solange nichts es braucht, und ist in einem Moment wach, sobald etwas anfällt.",

  "plugins.events.title": "Ereignisse",
  "plugins.events.delivered": "Alle zugestellt",
  "plugins.events.delivering": plural({
    one: "Wird zugestellt, {count} wartet",
    other: "Werden zugestellt, {count} warten",
  }),
  "plugins.events.waiting": plural({
    one: "{count} wartet",
    other: "{count} warten",
  }),
  "plugins.events.whileStopped":
    "Sie warten, bis es wieder läuft, und jedes verfällt einen Tag, nachdem es passiert ist.",
  "plugins.events.blocked": "Kommen nicht an",
  "plugins.events.blockedReason":
    "Alle letzten Versuche sind gescheitert, deshalb hält Matinee das Plugin für nicht erreichbar. Es schickt jeweils ein Ereignis und wartet nach jedem Fehlschlag länger. Sobald eines ankommt, folgen die übrigen. Das Plugin meldet:",
  "plugins.events.failing": plural({
    one: "{count} Ereignis scheitert wiederholt",
    other: "{count} Ereignisse scheitern wiederholt",
  }),
  "plugins.events.failingReason": plural({
    one: "Die übrigen kommen an. Matinee versucht dieses für sich erneut, wartet nach jedem Fehlschlag länger und verwirft es einen Tag, nachdem es passiert ist. Das Plugin meldet:",
    other:
      "Die übrigen kommen an. Matinee versucht diese jeweils für sich erneut, wartet nach jedem Fehlschlag länger und verwirft jedes einen Tag, nachdem es passiert ist. Zum ältesten meldet das Plugin:",
  }),
  "plugins.events.dropAt": "Verfällt {when}",
  "plugins.events.tries": plural({
    one: "Einmal versucht",
    other: "{count}-mal versucht",
  }),
  "plugins.events.retry": "Jetzt versuchen",
  "plugins.events.retryFailed": "Erneuter Versuch fehlgeschlagen",
  "plugins.events.nextTry": "Nächster Versuch {when}",
  "plugins.events.tryingNow": "Wird gerade erneut versucht",
  "plugins.events.showLog": "Jeden Versuch im Protokoll ansehen",

  "plugins.impact.checking": "Wird geprüft, was es betrifft",
  "plugins.impact.unknown": "Es konnte nicht geprüft werden, was es betrifft.",
  "plugins.impact.lockedOut": plural({
    one: "{count} Person wird ausgesperrt",
    other: "{count} Personen werden ausgesperrt",
  }),
  "plugins.impact.others": plural({
    one: "{count} weitere Person",
    other: "{count} weitere",
  }),
  "plugins.impact.lockedOut.off":
    "{providers} ist ihr einziger Weg zur Anmeldung. Sobald es wieder an ist, können sie sich wieder anmelden.",
  "plugins.impact.lockedOut.remove":
    "{providers} ist ihr einziger Weg zur Anmeldung. Danach haben sie keinen mehr.",
  "plugins.impact.linked": plural({
    one: "{count} Konto meldet sich mit {providers} an",
    other: "{count} Konten melden sich mit {providers} an",
  }),
  "plugins.impact.linked.off": plural({
    one: "Die Verknüpfung bleibt und funktioniert wieder, sobald es an ist.",
    other:
      "Ihre Verknüpfungen bleiben und funktionieren wieder, sobald es an ist.",
  }),
  "plugins.impact.linked.remove": plural({
    one: "Die Verknüpfung wird endgültig gelöscht.",
    other: "Ihre Verknüpfungen werden endgültig gelöscht.",
  }),
  "plugins.impact.libraries": plural({
    one: "{count} Mediathek bezieht ihre Metadaten daraus",
    other: "{count} Mediatheken beziehen ihre Metadaten daraus",
  }),
  "plugins.impact.librariesMore": plural({
    one: "und {count} weitere",
    other: "und {count} weitere",
  }),
  "plugins.impact.libraries.off": plural({
    one: "Sie behält, was sie hat, und lädt nichts Neues, bis es wieder an ist.",
    other:
      "Sie behalten, was sie haben, und laden nichts Neues, bis es wieder an ist.",
  }),
  "plugins.impact.libraries.remove": plural({
    one: "Sie behält, was sie hat. Wähle unter Mediatheken eine andere Metadatenquelle für sie.",
    other:
      "Sie behalten, was sie haben. Wähle unter Mediatheken eine andere Metadatenquelle für sie.",
  }),

  "plugins.off.title": "{name} ausschalten?",
  "plugins.off.description":
    "Seine Einstellungen und Daten bleiben. Das ändert sich, bis du es wieder einschaltest.",
  "plugins.off.generic.signIns":
    "Solange es aus ist, kann sich niemand mit {providers} anmelden, und wer keinen anderen Weg hat, ist ausgesperrt.",
  "plugins.off.generic.metadata":
    "Mediatheken, die es nutzen, laden keine neuen Metadaten, solange es aus ist.",
  "plugins.off.confirm": "Ausschalten",

  "plugins.approval.title": "Wartet auf deine Freigabe",
  "plugins.approval.fresh":
    "Es läuft erst, wenn du freigibst, was es verlangt.",
  "plugins.approval.more":
    "Diese Version verlangt mehr, als du freigegeben hast. Sie bleibt gestoppt, bis du die neuen Berechtigungen freigibst.",
  "plugins.approval.changedOnDisk":
    "Seine Dateien auf dem Server haben sich seit deiner Freigabe geändert. Es verlangt nichts Neues, aber der Code, der läuft, ist ein anderer. Gib es frei, wenn du die Änderung erwartet hast.",
  "plugins.approval.approve": "Freigeben",
  "plugins.approval.approveAndEnable": "Freigeben und einschalten",
  "plugins.approval.done": "{name} freigegeben",
  "plugins.approval.failed": "{name} konnte nicht freigegeben werden",

  // A setting's name, quoted, as a permission names it.
  "plugins.quoted": "„{text}“",
  "plugins.permission.network":
    "Sich mit diesen Hosts im Internet verbinden, und mit keinen anderen",
  "plugins.permission.network-config":
    "Sich mit der Adresse verbinden, die du unter {settings} einträgst, auch in deinem eigenen Netzwerk",
  "plugins.permission.storage":
    "Eine kleine Menge eigener Daten auf diesem Server speichern",
  "plugins.permission.metadata":
    "Als {providers} Titel, Beschreibungen und Bilder liefern, für Mediatheken, die du darauf einstellst",
  "plugins.permission.auth":
    "Personen mit {providers} anmelden. Es kann sich bei jedem damit verknüpften Konto anmelden, und bei keinem anderen",
  "plugins.permission.auth-credentials":
    "Sehen, was Personen in das Anmeldeformular von {providers} eingeben, Passwörter eingeschlossen",
  "plugins.permission.events-library":
    "Sehen, wann Mediatheken gescannt und Titel hinzugefügt werden",
  "plugins.permission.events-playback": "Sehen, wer was wann abspielt",
  "plugins.permission.events-users": "Sehen, wann Konten erstellt werden",
  "plugins.sensitive.label": "Heikel.",
  "plugins.sensitive.credentials":
    "Passwörter laufen durch das Plugin. Erlaube das nur, wenn du seinem Autor vertraust.",
  "plugins.sensitive.playback":
    "Das ist der Wiedergabeverlauf aller auf diesem Server, während er entsteht.",
  "plugins.permissions.new": "Neu in dieser Version",
  "plugins.permissions.newBadge": "Neu",
  "plugins.permissions.kept": "Schon erlaubt",
  "plugins.permissions.none": "Es verlangt nichts außer zu laufen.",
  "plugins.permissions.sandbox":
    "Egal, was es verlangt: Ein Plugin läuft in einer Sandbox. Es kann weder die Datenbank lesen noch Sitzungen oder Daten anderer Plugins sehen, keine Hosts erreichen, die es nicht genannt hat, und keine Dateien auf dem Server öffnen.",

  "plugins.config.required": "(erforderlich)",
  "plugins.config.fromEnvironment": "Von der Serverumgebung gesetzt",
  "plugins.config.environmentNote":
    "Die Serverumgebung setzt diesen Wert. Ein Wert hier überschreibt ihn.",
  "plugins.config.networkNote":
    "Das Plugin darf sich mit dieser Adresse verbinden, auch in deinem eigenen Netzwerk.",
  "plugins.config.notSet": "Nicht gesetzt",
  "plugins.config.secretSaved": "Gespeichert. Tippe, um es zu ersetzen.",
  "plugins.config.secretNone": "Nicht gesetzt",
  "plugins.config.secretRemove": "{field} entfernen",
  "plugins.config.secretKeep": "Behalten",
  "plugins.config.secretRemoved": "Wird beim Speichern entfernt.",
  "plugins.config.notNumber": "Gib eine Zahl ein.",
  "plugins.config.atLeast": "Gib {min} oder mehr ein.",
  "plugins.config.atMost": "Gib {max} oder weniger ein.",
  "plugins.config.notUrl":
    "Gib eine vollständige Adresse ein, etwa https://example.com.",
  "plugins.config.checkField": "Überprüfe {field}: {issue}",
  "plugins.config.invalid":
    "Der gespeicherte Wert passt nicht zu dieser Version.",
  "plugins.config.invalidValue":
    "Der gespeicherte Wert, {value}, passt nicht zu dieser Version.",
  "plugins.config.invalidSelect": "Wähle eine der Möglichkeiten.",
  "plugins.config.invalidOther": "Gib einen neuen Wert ein.",

  "plugins.links.title": "Ändern, wo sich Leute anmelden?",
  "plugins.links.changed": plural({
    one: "Du hast {settings} geändert, und {count} Konto meldet sich mit {providers} an.",
    other:
      "Du hast {settings} geändert, und {count} Konten melden sich mit {providers} an.",
  }),
  "plugins.links.changedUnknown":
    "Du hast {settings} geändert. Es ließ sich nicht prüfen, wie viele Konten sich mit {providers} anmelden.",
  "plugins.links.why":
    "Jede Verknüpfung bindet ein Konto hier an einen Namen, den der Dienst liefert. Nach dieser Änderung kann derselbe Name für jemand anderen stehen, etwa einen gleichnamigen Benutzer auf einem anderen Server, und diese Person käme in das Konto.",
  "plugins.links.choice":
    "Behalte die Verknüpfungen, wenn es derselbe Dienst mit denselben Leuten ist, etwa eine neue Adresse für denselben Server. Sonst entferne sie, und die Leute verknüpfen {providers} in ihren Kontoeinstellungen neu.",
  "plugins.links.lockedOut":
    "{providers} ist ihr einziger Weg, sich anzumelden. Entfernst du die Verknüpfungen, haben sie keinen.",
  "plugins.links.keepAction": "Behalten",
  "plugins.links.removeAction": "Entfernen",

  "plugins.signIn.allowSignUp":
    "Neue Personen können ein Konto mit {provider} erstellen",
  "plugins.signIn.allowSignUpHint":
    "Wer hier kein Konto hat, bekommt eins, als Benutzer. Solange das aus ist, meldet {provider} nur Personen an, die es in ihren Kontoeinstellungen verknüpft haben.",
  "plugins.signIn.failed": "Die Registrierung konnte nicht geändert werden",

  "plugins.update.check": "Nach Updates suchen",
  "plugins.update.checkFailed": "Die Suche nach Updates ist fehlgeschlagen",
  "plugins.update.available": "{name} {version} ist verfügbar",
  "plugins.update.availableCount": plural({
    one: "{count} Update verfügbar",
    other: "{count} Updates verfügbar",
  }),
  "plugins.update.none": "{name} ist aktuell",
  "plugins.update.noneAll": "Alle Plugins von npm sind aktuell",
  "plugins.update.to": "Update auf {version}",
  "plugins.update.reading": "{version} wird gelesen",
  "plugins.update.readFailed":
    "Das Update für {name} konnte nicht gelesen werden",

  "plugins.remove": "Plugin entfernen",
  "plugins.remove.title": "{name} entfernen?",
  "plugins.remove.description":
    "Seine Dateien, seine Einstellungen und die Daten, die es auf diesem Server gespeichert hat, werden mit entfernt.",
  "plugins.remove.withSignIns":
    "Seine Dateien, seine Einstellungen, die Daten, die es auf diesem Server gespeichert hat, und die {providers}-Anmeldungen, die Personen verknüpft haben, werden mit entfernt.",
  "plugins.remove.metadata":
    "Mediatheken, die es nutzen, behalten ihre Metadaten.",
  "plugins.remove.confirm": "Entfernen",
  "plugins.removed": "{name} entfernt",
  "plugins.removeFailed": "{name} konnte nicht entfernt werden",

  "plugins.log.label": "Aktuelles Protokoll",
  "plugins.log.empty": "Noch nichts protokolliert.",
  "plugins.log.loadFailed":
    "Das Protokoll konnte nicht geladen werden. {error}",
  "plugins.log.level.debug": "debug",
  "plugins.log.level.info": "info",
  "plugins.log.level.warn": "warn",
  "plugins.log.level.error": "fehler",

  "plugins.add.title": "Plugin hinzufügen",
  "plugins.add.description":
    "Installiert wird erst, wenn du gesehen hast, was es verlangt.",
  "plugins.add.source": "Paket oder Adresse",
  "plugins.add.sourceHint":
    "Ein Paketname wie matinee-plugin-anilist, auf Wunsch mit @version, oder eine https-Adresse.",
  "plugins.add.badName": "Das ist kein Paketname. Prüfe ihn auf npm.",
  "plugins.add.badUrl": "Nutze eine https-Adresse zu einer .tgz-Datei.",
  "plugins.add.reading": "Wird heruntergeladen und gelesen, was es verlangt",
  "plugins.add.cancelReading": "Abbrechen",
  "plugins.add.continue": "Weiter",
  "plugins.add.browse": "Plugins auf npm",
  "plugins.add.resultsFor": "Auf npm für „{query}“",
  "plugins.add.strangers":
    "Auf npm kann jeder veröffentlichen, und das sind Pakete, die jemand für Matinee markiert hat. Der nächste Schritt zeigt, was eins verlangt.",
  "plugins.add.noResults": "Nichts auf npm passt zu „{query}“.",
  "plugins.add.noneTagged": "Auf npm ist noch kein Paket für Matinee markiert.",
  "plugins.add.searchFailed": "Die Suche auf npm ist fehlgeschlagen. {error}",
  "plugins.add.installed": "Installiert",

  "plugins.consent.installTitle": "{name} installieren?",
  "plugins.consent.updateTitle": "{name} auf {version} aktualisieren?",
  "plugins.consent.versionChange": "Version {from} auf {to}",
  "plugins.consent.asks": "Was es tun möchte",
  "plugins.consent.asksMore": "Diese Version verlangt mehr",
  "plugins.consent.asksNothingNew": "Diese Version verlangt nichts Neues",
  "plugins.consent.enableHint":
    "Bleibt es aus, wird es installiert, läuft aber erst, wenn du es einschaltest.",
  "plugins.consent.back": "Zurück",
  "plugins.consent.cancel": "Abbrechen",
  "plugins.consent.installOff": "Installieren, aus lassen",
  "plugins.consent.installOn": "Installieren und einschalten",
  "plugins.consent.update": "Auf {version} aktualisieren",
  "plugins.consent.installed": "{name} installiert",
  "plugins.consent.updated": "{name} auf {version} aktualisiert",
  "plugins.consent.installFailed": "{name} konnte nicht installiert werden",
  "plugins.consent.updateFailed": "{name} konnte nicht aktualisiert werden",
  "plugins.consent.close": "Schließen",
} satisfies TranslationOf<typeof source>
