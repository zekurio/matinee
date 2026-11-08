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

  "validation.timeZone": "Verwende eine IANA-Zeitzone wie Europe/Berlin.",

  "validation.hexColor": "Verwende #rrggbb.",
  "validation.themeVariantsUnique":
    "Die IDs der Varianten müssen eindeutig sein.",

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
} satisfies TranslationOf<typeof source>
