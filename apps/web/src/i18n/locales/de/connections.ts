import { plural, type TranslationOf } from "../../catalog"
import type source from "../en/connections"

export default {
  "connections.title": "Verbindungen",
  "connections.add": "Verbindung hinzufügen",
  "connections.loadFailed":
    "Die Verbindungen konnten nicht geladen werden. {error}",
  "connections.retry": "Erneut versuchen",
  "connections.empty.title": "Noch keine Verbindungen",
  "connections.empty.description":
    "Füge eine hinzu und wähle dann die Mediatheken, die sie befüllt.",
  "connections.testing": "Wird getestet…",
  "connections.connected": "Verbunden",
  "connections.testFailed": "Test fehlgeschlagen",
  "connections.slug": "Kürzel",
  "connections.key.saved":
    "Schlüssel in Matinee gespeichert, gilt statt {variable}",
  "connections.key.environment": "Schlüssel aus {variable}",
  "connections.key.none":
    "Noch kein Schlüssel. Speichere einen oder setze {variable}.",
  "connections.actions": "Aktionen für {name}",
  "connections.test": "Erneut testen",
  "connections.edit": "Bearbeiten",
  "connections.delete": "Verbindung löschen",
  "connections.delete.title": "{name} löschen?",
  "connections.delete.description": plural({
    one: "{count} Mediathek nimmt keine Anfragen mehr an, bis eine andere Verbindung sie befüllt.",
    other:
      "{count} Mediatheken nehmen keine Anfragen mehr an, bis eine andere Verbindung sie befüllt.",
  }),
  "connections.delete.descriptionUnused": "Sie befüllt keine Mediathek.",
  "connections.delete.confirm": "Löschen",
  "connections.deleted": "{name} gelöscht",

  "connections.dialog.addTitle": "Verbindung hinzufügen",
  "connections.dialog.editTitle": "{name} bearbeiten",
  "connections.dialog.source": "Art",
  "connections.dialog.name": "Name",
  "connections.dialog.namePlaceholder": "Filme",
  "connections.dialog.slug": "Kürzel",
  "connections.dialog.slugHint":
    "Benennt die Umgebungsvariable, aus der der Schlüssel kommen kann: {variable}",
  "connections.dialog.slugHintNoKey": "Großbuchstaben, etwa FILME.",
  "connections.dialog.slugInvalid":
    "Verwende Großbuchstaben, Ziffern und Unterstriche, beginnend mit einem Buchstaben.",
  "connections.dialog.key": "API-Schlüssel",
  "connections.dialog.keySaved": "Gespeichert. Tippe, um ihn zu ersetzen.",
  "connections.dialog.keyFromEnvironment": "Gesetzt durch {variable}",
  "connections.dialog.keyNone": "Keiner",
  "connections.dialog.keyUseEnvironment":
    "Den Schlüssel aus der Umgebung verwenden",
  "connections.dialog.keyRemove": "Gespeicherten Schlüssel entfernen",
  "connections.dialog.keyKeep": "Gespeicherten Schlüssel behalten",
  "connections.dialog.keyEnvironmentApplies":
    "Nach dem Speichern gilt der Schlüssel aus {variable}.",
  "connections.dialog.keyRemoved":
    "Der Schlüssel wird beim Speichern entfernt.",
  "connections.dialog.required": "Fülle {field} aus.",
  "connections.dialog.checkFields": "Prüfe die Felder.",
  "connections.dialog.save": "Speichern",
  "connections.dialog.create": "Verbindung hinzufügen",

  "connections.libraries.title": "Was jede Mediathek befüllt",
  "connections.libraries.loadFailed":
    "Die Mediatheken konnten nicht geladen werden. {error}",
  "connections.libraries.none": "Es gibt noch keine Mediatheken.",
  "connections.fillFrom": "Befüllen über",
  "connections.fillFrom.nothing": "Nichts",
  "connections.libraries.noProvider":
    "Kein Metadatenanbieter, also können keine Anfragen hierher. Wähle einen unter Mediatheken.",
  "connections.libraries.noConnection":
    "Füge zuerst oben eine Verbindung hinzu.",
  "connections.libraries.nothingFits": "Keine Verbindung nimmt {kind}.",
  "connections.libraries.kind.movies": "Filme",
  "connections.libraries.kind.shows": "Serien",
  "connections.libraries.elsewhere":
    "{folder} ist kein Ordner von {library}. Passt, wenn {connection} ihn unter einem anderen Pfad sieht.",
  "connections.anime": "Anime",
  "connections.anime.off": "Wie alles andere",
  "connections.anime.lands": "Landet in {library}",
  "connections.anime.choose": "Wähle, wo Anime landet",
  "connections.anime.lost":
    "Unklar, wo {folder} liegt. Wähle, wo Anime landet.",
  "connections.anime.lostNoFolder": "Wähle, wo Anime landet.",
  "connections.anime.landsIn": "Landet in",
  "connections.anime.clear": "Anime wie alles andere schicken",
  "connections.anime.from": "Anime aus {libraries} landet hier.",
  "connections.libraries.loadingChoices": "Auswahl wird von {name} geladen…",
  "connections.libraries.choicesFailed":
    "Die Auswahl von {name} konnte nicht geladen werden. {error}",
  "connections.libraries.noChoices": "{name} bietet hierfür keine Auswahl.",
  "connections.libraries.pick": "Auswählen",
  "connections.libraries.saveFailed":
    "{library} konnte nicht gespeichert werden. {error}",
} satisfies TranslationOf<typeof source>
