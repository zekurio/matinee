import { plural, type TranslationOf } from "../../catalog"
import type source from "../en/requests"

export default {
  "requests.title": "Anfragen",
  "requests.menu": "Anfragen",
  "requests.menuWaiting": plural({
    one: "Anfragen, {count} wartet auf dich",
    other: "Anfragen, {count} warten auf dich",
  }),
  "requests.labelled": "{label}. Anfragen warten auf dich",

  "requests.recent": "Letzte Anfragen",

  "requests.statusLabel": "Status",
  "requests.state.waiting": "Ausstehend",
  "requests.state.needsAttention": "Fehlerhaft",
  "requests.state.onTheWay": "In Bearbeitung",
  "requests.state.onTheWayPercent": "In Bearbeitung · {percent}",
  "requests.state.here": "Verfügbar",
  "requests.state.declined": "Abgelehnt",
  "requests.cancel": "Zurückziehen",
  "requests.cancelNamed": "Anfrage für {name} zurückziehen",

  "requests.filter.state": "Status",
  "requests.filter.kind": "Typ",
  "requests.filter.show": "Anfragen zeigen",
  "requests.filter.none": "Keine Anfrage passt zu diesen Filtern",
  "requests.filter.noneHint": "Nimm einen Filter heraus, um mehr zu sehen.",

  "requests.addAll": plural({
    one: "{count} hinzufügen",
    other: "Alle {count} hinzufügen",
  }),

  "requests.kind.movie": "Film",
  "requests.kind.show": "Serie",
  "requests.othersCount": "+{count}",
  "requests.askedBy": "Angefragt von",
  "requests.menu.addTo": "Hinzufügen zu",
  "requests.menu.library": "Mediathek",
  "requests.menu.connection": "Von {connection}",
  "requests.badge.requested": "{name} hat das {when} angefragt",
  "requests.badge.requestedMany": "{names} haben das angefragt",
  "requests.badge.waiting": "Jemand hat das angefragt",
  "requests.scope.seasons": plural({
    one: "Staffel {numbers}",
    other: "Staffeln {numbers}",
  }),
  "requests.scope.specials": "Specials",
  "requests.scope.specialsAnd": "Specials und {seasons}",
  "requests.goesTo.change": "Ändern, wohin {name} kommt, jetzt {library}",
  "requests.goesTo.title": "Kommt in",
  "requests.noConnection": "Keine Verbindung",

  "requests.add": "Hinzufügen",
  "requests.decline": "Ablehnen",
  "requests.retry": "Wiederholen",
  "requests.addNamed": "{name} hinzufügen",
  "requests.addTo": "Zu {library} hinzufügen",
  "requests.retryNamed": "{name} wiederholen",
  "requests.giveUp": "Aufgeben",
  "requests.giveUpNamed": "{name} aufgeben",
  "requests.allowAgain": "Anfragen wieder zulassen",
  "requests.addAfterAll": "Doch hinzufügen",
  "requests.addAfterAllNamed": "{name} doch hinzufügen",
  "requests.more": "Mehr für {name}",
  "requests.openTitle": "Titel öffnen",
  "requests.openRemote": "In {connection} öffnen",
  "requests.remove": "Anfrage entfernen…",
  "requests.remove.title": "Anfrage für {name} entfernen?",
  "requests.remove.description":
    "Ohne Nachricht an {names}. Erneut anfragen bleibt möglich.",
  "requests.remove.descriptionNobody": "Niemand wird benachrichtigt.",
  "requests.remove.confirm": "Entfernen",
  "requests.removed": "Anfrage für {name} entfernt",
  "requests.removeFailed": "Anfrage konnte nicht entfernt werden",
  "requests.retried": "{name} wird erneut gesendet",
  "requests.retryFailed": "{name} konnte nicht erneut gesendet werden",

  "requests.decline.title": "{name} ablehnen",
  "requests.decline.reason": "Grund",
  "requests.reason.alreadyHere": "Haben wir schon",
  "requests.reason.notForServer": "Nicht für diesen Server",
  "requests.reason.notFound": "Nicht auffindbar",
  "requests.decline.note": "Notiz",
  "requests.decline.noteFor": "Notiz für {names}",
  "requests.decline.notePlaceholder": "Optional",
  "requests.decline.cancel": "Abbrechen",
  "requests.decline.submit": "Ablehnen",

  "requests.giveUp.title": "{name} aufgeben",
  "requests.giveUp.keeps":
    "{connection} behält, was es hat. Taucht die Datei doch auf, kommt sie wie gewohnt an.",
  "requests.giveUp.turnsUp":
    "Taucht die Datei doch auf, kommt sie wie gewohnt an.",
  "requests.giveUp.submit": "Aufgeben",

  "requests.toast.added": "{name} hinzugefügt",
  "requests.toast.addedTo": "{name} zu {library} hinzugefügt",
  "requests.toast.addedMany": plural({
    one: "{count} Titel hinzugefügt",
    other: "{count} Titel hinzugefügt",
  }),
  "requests.toast.declined": "{name} abgelehnt",
  "requests.toast.undo": "Rückgängig",
  "requests.toast.cancelled": "{name} zurückgezogen",
  "requests.toast.addFailed": "Hinzufügen fehlgeschlagen",
  "requests.toast.declineFailed": "{name} konnte nicht abgelehnt werden",
  "requests.toast.gaveUp": "{name} aufgegeben",
  "requests.toast.giveUpFailed": "{name} konnte nicht aufgegeben werden",
  "requests.toast.allowedAgain": "{name} kann wieder angefragt werden",
  "requests.toast.allowAgainFailed":
    "Anfragen für {name} konnten nicht wieder zugelassen werden",
  "requests.toast.addedAfterAll": "{name} doch hinzugefügt",
  "requests.toast.addAfterAllFailed": "{name} konnte nicht hinzugefügt werden",

  "requests.progress.queued": "Noch nicht gesendet",
  "requests.progress.sent": "Gesendet",
  "requests.progress.byHand": "Wartet auf die Datei",
  "requests.progress.looking": "Wird gesucht",
  "requests.progress.release": "Ab {date}",
  "requests.progress.notOut": "Noch nicht erschienen",
  "requests.progress.left": "noch {time}",

  "requests.attention.unknown": "Ohne Grund fehlgeschlagen",
  "requests.attention.failedUnknown":
    "Das ist fehlgeschlagen. Details stehen im Server-Log.",

  "requests.done.arrived": "{when} angekommen",
  "requests.done.declinedUndated": "Abgelehnt",
  "requests.done.gaveUpUndated": "Aufgegeben",

  "requests.empty.setup.title": "Noch befüllt nichts deine Mediatheken",
  "requests.empty.setup.description":
    "Füge eine Verbindung hinzu und wähle die Mediatheken, die sie befüllt.",
  "requests.empty.setup.action": "Anfragen einrichten",
  "requests.empty.none": "Noch keine Anfragen",
  "requests.empty.noneHint":
    "Wenn jemand einen Film oder eine Serie anfragt, erscheint das hier.",
  "requests.loadFailed": "Anfragen konnten nicht geladen werden. {error}",
  "requests.reload": "Erneut versuchen",

  "requests.keys.addAll": "Alle hinzufügen",
} satisfies TranslationOf<typeof source>
