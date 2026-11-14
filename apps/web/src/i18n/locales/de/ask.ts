import { plural, type TranslationOf } from "../../catalog"
import type source from "../en/ask"

export default {
  "ask.ask": "Anfragen",
  "ask.more": "Mehr anfragen",
  "ask.notify": "Mich benachrichtigen",
  "ask.stopNotifying": "Nicht mehr benachrichtigen",
  "ask.cancel": "Anfrage zurückziehen",

  "ask.dialog.title": "{name} anfragen",
  "ask.dialog.goesTo": "Kommt in",
  "ask.chooser.seasons": "Staffeln",
  "ask.chooser.future": "Neue Staffeln, sobald sie laufen",
  "ask.chooser.unavailable": "Nicht im Angebot",
  "ask.chooser.none": "Wähle eine Staffel",
  "ask.chooser.one": "Staffel {number} anfragen",
  "ask.chooser.many": plural({
    one: "{count} Staffel anfragen",
    other: "{count} Staffeln anfragen",
  }),
  "ask.chooser.specials": "Specials anfragen",
  "ask.chooser.newOnly": "Neue Staffeln anfragen",

  "ask.declined.why": "Abgelehnt: {reason}.",
  "ask.declined.notFound": "Der Titel ließ sich nicht finden.",
  "ask.declined.note": "„{note}“",
  "ask.disabled.declined":
    "Ein Admin hat diesen Titel abgelehnt, deshalb kann man ihn nicht anfragen.",
  "ask.disabled.declinedAdmin":
    "Abgelehnt. Um Anfragen wieder zuzulassen, such ihn unter Erledigt in Anfragen.",
  "ask.disabled.off": "Dein Konto kann keine Titel anfragen.",
  "ask.disabled.noDestination": "Keine Mediathek hier nimmt das auf.",
  "ask.limit.until": "Bis zum {date} keine Anfragen mehr.",
  "ask.limit.later": "Gerade keine Anfragen mehr.",
  "ask.left": plural({
    one: "Noch {count} Anfrage.",
    other: "Noch {count} Anfragen.",
  }),
  "ask.reason.alreadyHere": "Haben wir schon.",
  "ask.reason.notForServer": "Passt nicht auf diesen Server.",
  "ask.reason.notFound": "Nicht auffindbar.",
  "ask.reason.declined": "Abgelehnt.",

  "ask.toast.asked": "{name} angefragt",
  "ask.toast.undo": "Rückgängig",
  "ask.toast.failed": "{name} konnte nicht angefragt werden",
  "ask.toast.cancelFailed": "{name} konnte nicht zurückgezogen werden",
  "ask.toast.followFailed": "Benachrichtigungen konnten nicht geändert werden",

  "ask.mine.title": "Meine Anfragen",
  "ask.mine.seeAll": "Alle ansehen",
  "ask.mine.inProgress": "Aktuell",
  "ask.mine.all": "Alle",
  "ask.mine.filter": "Zeigen",
  "ask.mine.empty": "Noch nichts angefragt",
  "ask.mine.emptyHint":
    "Such nach einem Film oder einer Serie, die es hier nicht gibt, und frag sie auf ihrer Seite an.",
  "ask.mine.emptyInProgress": "Nichts unterwegs",
  "ask.mine.error": "Deine Anfragen konnten nicht geladen werden. {error}",
} satisfies TranslationOf<typeof source>
