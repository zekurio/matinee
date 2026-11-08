import type { TranslationOf } from "../../catalog"
import type source from "../en/player"

export default {
  "player.unsupported": "Dieser Browser kann die Datei nicht abspielen",
  "player.unsupportedDetail":
    "Dieser Browser unterstützt {container}-Dateien oder ihre Codecs nicht, und der Server konnte sie nicht transkodieren. Sieh im Serverprotokoll nach.",
  "player.unsupportedDetailUnknown":
    "Dieser Browser unterstützt die Datei oder ihre Codecs nicht, und der Server konnte sie nicht transkodieren. Sieh im Serverprotokoll nach.",
  "player.loadFailed": "Der Titel konnte nicht geladen werden",
  "player.backHome": "Zurück zur Startseite",

  "player.back": "Zurück",
  "player.skipBack": "{seconds} Sekunden zurück (j)",
  "player.skipForward": "{seconds} Sekunden vor (l)",
  "player.play": "Abspielen",
  "player.pause": "Pausieren",
  "player.playKey": "Abspielen (k)",
  "player.pauseKey": "Pausieren (k)",
  "player.muteKey": "Stummschalten (m)",
  "player.unmuteKey": "Ton einschalten (m)",
  "player.volume": "Lautstärke",
  "player.fullscreenKey": "Vollbild (f)",
  "player.exitFullscreenKey": "Vollbild beenden (f)",
  "player.seek": "Springen",
  "player.seekValue": "{time} von {duration}",
  "player.showLength": "Gesamtlänge anzeigen",
  "player.showTimeLeft": "Restzeit anzeigen",
  "player.endsAt": "Endet um {time}",

  "player.flash.muted": "Stumm",
  "player.flash.skip": "{seconds} s",

  "player.menu.audio": "Audio",
  "player.menu.subtitles": "Untertitel",
  "player.menu.settings": "Einstellungen",
  "player.menu.withKey": "{label} ({key})",
  "player.menu.none": "Keine",
  "player.track.unnamed": "Spur {number}",
  "player.track.unknownLanguage": "Unbekannte Sprache",
  "player.track.withTitle": "{language} ({title})",
  "player.audio.noTracks": "Diese Datei hat keine Tonspuren",
  "player.audio.loading": "Spuren werden geladen …",
  "player.subtitles.off": "Aus",
  "player.subtitles.noTracks": "Diese Datei hat keine Untertitel",
  "player.subtitles.loading": "Untertitel werden geladen …",
  "player.subtitles.forced": "Erzwungen",
  "player.subtitles.burnedIn": "Eingebrannt",
  "player.subtitles.delay": "Versatz",
  "player.subtitles.delayValue": "{seconds} s",
  "player.subtitles.earlier": "Untertitel früher zeigen",
  "player.subtitles.later": "Untertitel später zeigen",
  "player.subtitles.delayReset": "Zurücksetzen",
  "player.subtitles.delayResetDetail": "Zurück zum Timing der Datei",
  "player.quality": "Qualität",
  "player.quality.original": "Original",
  "player.speed": "Geschwindigkeit",
  "player.speed.normal": "Normal",
  "player.speed.rate": "{rate}×",
  "player.bitrate.mbps": "{value} MBit/s",
  "player.bitrate.kbps": "{value} kBit/s",
  "player.via.directPlay": "Direkte Wiedergabe",
  "player.via.directStream": "Direktes Streaming",
  "player.via.directStreamBurnIn": "Direktes Streaming, Untertitel eingebrannt",
  "player.via.transcode": "Transkodierung zu {resolution}, {bitrate}",
  "player.via.transcodeBurnIn":
    "Transkodierung zu {resolution}, {bitrate}, Untertitel eingebrannt",

  "player.notice.standIn": "Zu {format}-Audio gewechselt",
  "player.notice.standInDetail":
    "Dieser Browser kann die {format}-Spur nicht abspielen. Wähle sie im Audiomenü, um sie zu transkodieren.",
  "player.notice.video": "Transkodierung von {from} zu {to} {quality}",
  "player.notice.videoTo": "Transkodierung zu {to} {quality}",
  "player.notice.audio": "{from}-Audio zu {to}",
  "player.notice.audioTitle": "Transkodierung von {from}-Audio zu {to}",
  "player.notice.stereo": "{codec} Stereo",
  "player.notice.burnIn": "Untertitel werden eingebrannt",
  "player.notice.burnInVideo":
    "Das Video wird von {from} zu {to} {quality} transkodiert.",
  "player.notice.burnInVideoTo":
    "Das Video wird zu {to} {quality} transkodiert.",
  "player.notice.burnInVideoAudio":
    "Das Video wird von {from} zu {to} {quality} transkodiert, das Audio von {audioFrom} zu {audioTo}.",
  "player.notice.burnInVideoToAudio":
    "Das Video wird zu {to} {quality} transkodiert, das Audio von {audioFrom} zu {audioTo}.",

  "player.error.burnIn": "Die Untertitel konnten nicht eingebrannt werden",
  "player.error.burnInDetail":
    "Die Untertitel sind aus. Wähle eine andere Spur oder versuch es noch einmal.",
  "player.error.lost": "Das Video ist abgebrochen",
  "player.error.lostDetail": "Der Server sendet es nicht mehr.",
  "player.error.retry": "Erneut versuchen",
  "player.error.revert": "Das ließ sich nicht abspielen",
  "player.error.revertToFile":
    "Zurück zur Originaldatei und zur ursprünglichen Tonspur.",
  "player.error.revertToQuality":
    "Zurück zur Originalqualität und zur ursprünglichen Tonspur.",
  "player.error.subtitles": "Die Untertitel konnten nicht geladen werden",
  "player.error.subtitlesDetail":
    "Wähle eine andere Spur oder schalte sie aus.",
  "player.error.savePreferences":
    "Deine Wiedergabeeinstellungen konnten nicht gespeichert werden",
} satisfies TranslationOf<typeof source>
