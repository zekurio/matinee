import type { TranslationOf } from "../../catalog"
import type source from "../en/validation"

export default {
  "validation.issuerUrl": "Gib den Issuer als http- oder https-URL ein.",
  "validation.scopesOpenid": "Die Scopes müssen openid enthalten.",

  "validation.searchQuery": "Gib einen Namen für die Suche ein.",

  "validation.imageSize": "Wähle ein Bild unter 25 MB.",

  "validation.metadataLanguage": "Verwende einen Sprachcode wie en oder de-DE.",
  "validation.absolutePath": "Verwende einen absoluten Pfad.",
  "validation.libraryName": "Gib der Mediathek einen Namen.",
  "validation.libraryFolders": "Füge mindestens einen Ordner hinzu.",
  "validation.libraryFoldersUnique":
    "Jeder Ordner kann nur einmal hinzugefügt werden.",

  "validation.languageTag": "Verwende ein Sprach-Tag wie en oder pt-BR.",

  "validation.codeChallenge": "Ungültige Code-Challenge",
  "validation.codeVerifier": "Ungültiger Code-Verifier",
  "validation.redirectUri":
    "Verwende eine {scheme}:-URI oder eine Loopback-URL mit http.",
  "validation.userCode": "Gib die 8 Buchstaben ein, die das Gerät anzeigt.",
  "validation.signInLink":
    "Dieser Anmeldelink ist fehlerhaft. Starte die Anmeldung in der App neu.",

  "validation.connectionName": "Gib der Verbindung einen Namen.",
  "validation.connectionSlug":
    "Verwende Großbuchstaben, Ziffern und Unterstriche, beginnend mit einem Buchstaben.",
  "validation.setupToken":
    "Gib den Einrichtungstoken ein, um diesen Server zu übernehmen.",

  "validation.bitrateLimit": "Wähle ein Limit von mindestens 1 Mbit/s.",
  "validation.networkRange":
    "Nutze eine Adresse oder einen Bereich wie 192.168.0.0/16.",
  "validation.streamLimit": "Erlaube mindestens einen Stream.",
  "validation.groupName": "Gib der Gruppe einen Namen.",
  "validation.max256": "Verwende höchstens 256 Zeichen.",
  "validation.inviteToken": "Dieser Einladungslink ist unvollständig.",

  "validation.timeZone": "Verwende eine IANA-Zeitzone wie Europe/Berlin.",
  "validation.profileName": "Gib einen Benutzernamen ein.",

  "validation.hexColor": "Verwende #rrggbb.",

  "validation.devicePath":
    "Verwende ein Gerät unter /dev, etwa /dev/dri/renderD128.",
  "validation.wholeNumber": "Verwende eine ganze Zahl.",
  "validation.crfRange": "Verwende einen Wert von 0 bis 51.",
  "validation.codecsUnique": "Jeder Codec kann nur einmal aufgeführt werden.",

  "validation.usernameMin": "Verwende mindestens 2 Zeichen.",
  "validation.usernameMax": "Verwende höchstens 32 Zeichen.",
  "validation.usernameChars":
    "Verwende Buchstaben, Ziffern, Punkte, Bindestriche und Unterstriche.",
  "validation.max64": "Verwende höchstens 64 Zeichen.",
  "validation.fileEmpty": "Diese Datei ist leer.",
  "validation.avatarSize": "Wähle ein Bild unter 10 MB.",
  "validation.avatarType": "Wähle ein JPEG-, PNG- oder WebP-Bild.",

  "validation.ageLimitCountry":
    "Verwende einen zweibuchstabigen Ländercode wie DE.",
  "validation.browseLanguage":
    "Verwende einen zweibuchstabigen Sprachcode wie de.",
  "validation.browseYears":
    "Das erste Jahr darf nicht nach dem letzten liegen.",
  "validation.browseScores":
    "Die niedrigste Bewertung darf nicht über der höchsten liegen.",
  "validation.browseRuntime":
    "Die kürzeste Laufzeit darf nicht länger als die längste sein.",

  "validation.browseSortForYou":
    "Sortiere nur unter deinen Empfehlungen nach bester Übereinstimmung.",

  "validation.invalidValue": "Ungültiger Wert",
  "validation.invalidInput": "Ungültige Eingabe",
  "validation.invalidUrl": "Ungültige URL",
  "validation.invalidUuid": "Ungültige UUID",
  "validation.date": "Wähle ein Datum.",
  "validation.file": "Wähle eine Datei.",
  "validation.fileType": "Wähle eine Datei eines anderen Typs.",
  "validation.pattern":
    "Verwende einen Wert in dem Format, das dieses Feld erwartet.",
  "validation.required": "Fülle dieses Feld aus.",
  "validation.minLength": "Verwende mindestens {limit} Zeichen.",
  "validation.maxLength": "Verwende höchstens {limit} Zeichen.",
  "validation.minValue": "Verwende {limit} oder mehr.",
  "validation.maxValue": "Verwende {limit} oder weniger.",
  "validation.staleRequest": "Lade die Seite neu und versuche es erneut.",
} satisfies TranslationOf<typeof source>
