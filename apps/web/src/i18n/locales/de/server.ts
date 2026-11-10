import type { TranslationOf } from "../../catalog"
import type source from "../en/server"

export default {
  "server.downloads.tooManyAudioTracks":
    "Ein Download kann höchstens 16 Audiospuren enthalten.",
  "server.downloads.selectedAudioUnavailable":
    "Die ausgewählten Audiospuren sind in dieser Datei nicht verfügbar.",
  "server.downloads.noDownloadVideo":
    "Für dieses Gerät und diese Einstellungen ist keine Videokonvertierung verfügbar.",
  "server.downloads.noDownloadAudio":
    "Für dieses Gerät ist keine Audiokonvertierung verfügbar.",
  "server.rpc.signInFirst": "Melde dich zuerst an.",
  "server.rpc.adminsOnly": "Das können nur Admins.",
  "server.rpc.passkeysOff": "Passkeys sind auf diesem Server ausgeschaltet.",

  "server.auth.signUpClosed":
    "Auf diesem Server ist die Registrierung geschlossen.",
  "server.auth.pendingGone":
    "Diese Anmeldung ist abgelaufen. Fahre noch einmal mit Single Sign-on fort.",
  "server.auth.accountGone": "Dieses Konto gibt es nicht mehr.",
  "server.auth.deviceGone":
    "Dieser Code funktioniert nicht. Vielleicht ist er abgelaufen oder wurde schon benutzt.",
  "server.auth.setupDone": "Die Einrichtung ist bereits abgeschlossen.",
  "server.auth.setupTokenMismatch":
    "Dieser Einrichtungstoken stimmt nicht mit dem im Log überein.",
  "server.auth.setupTokenFirst": "Gib zuerst den Einrichtungstoken ein.",
  "server.auth.setupWithOidc":
    "Melde dich mit {provider} an, um Matinee einzurichten.",
  "server.auth.usernameTaken": "Dieser Benutzername ist schon vergeben.",
  "server.auth.signUpInvalid": "Die Registrierungsanfrage ist ungültig.",
  "server.auth.setupDoneSignIn":
    "Die Einrichtung ist bereits abgeschlossen. Melde dich stattdessen an.",
  "server.auth.ssoOff": "Single Sign-on ist ausgeschaltet.",
  "server.auth.signOutFirst":
    "Melde dich ab, bevor du ein neues Konto erstellst.",
  "server.auth.appSignInGone":
    "Diese Anmeldung ist abgelaufen oder wurde schon benutzt. Versuch es noch einmal.",
  "server.auth.deviceCodeExpired":
    "Dieser Code ist abgelaufen. Hol dir einen neuen.",

  "server.oidc.noLinkedAccount":
    "Mit dieser Anmeldung ist kein Konto verknüpft. Melde dich mit einem Passkey an und verknüpfe sie dann in den Einstellungen.",
  "server.oidc.noLinkedAccountSso":
    "Mit dieser Anmeldung ist kein Konto verknüpft. Bitte einen Admin um Zugang.",
  "server.oidc.linkedElsewhere":
    "Diese Anmeldung ist bereits mit einem anderen Konto verknüpft.",
  "server.oidc.alreadyLinked":
    "Dein Konto ist bereits mit einer anderen Anmeldung bei diesem Anbieter verknüpft. Trenne sie zuerst in den Einstellungen.",
  "server.oidc.setupFirst":
    "Erstelle zuerst das Admin-Konto auf der Einrichtungsseite.",
  "server.oidc.setupNotAdmin":
    "Nur wer bei {provider} Admin ist, kann Matinee einrichten. Gib deinem Konto dort den Claim {claim} mit dem Wert admin und melde dich noch einmal an.",
  "server.oidc.unreachable": "Der Anmeldeanbieter war nicht erreichbar.",
  "server.oidc.wrongIssuer":
    "Single Sign-on ist mit der falschen Issuer-URL eingerichtet. Ein Admin muss sie auf {issuer} ändern.",
  "server.oidc.signInToLink": "Melde dich an, bevor du ein Konto verknüpfst.",
  "server.oidc.expired":
    "Die Anmeldung ist abgelaufen. Versuch es noch einmal.",
  "server.oidc.noIdToken": "Der Anbieter hat kein ID-Token geschickt.",
  "server.oidc.signInAgainToLink":
    "Melde dich noch einmal an, bevor du ein Konto verknüpfst.",
  "server.oidc.refused": "Der Anbieter hat die Anmeldung abgelehnt: {reason}",
  "server.oidc.failed":
    "Die Anmeldung ist fehlgeschlagen. Details stehen im Server-Log.",

  "server.passkeys.requestExpired":
    "Die Passkey-Anfrage ist abgelaufen. Versuch es noch einmal.",
  "server.passkeys.checkFailed": "Die Passkey-Prüfung ist fehlgeschlagen.",
  "server.passkeys.notVerified": "Der Passkey konnte nicht bestätigt werden.",
  "server.passkeys.signInExpired":
    "Die Anmeldeanfrage ist abgelaufen. Versuch es noch einmal.",
  "server.passkeys.unknown":
    "Dieser Passkey ist bei Matinee nicht registriert.",

  "server.avatars.unreadable":
    "Dieses Bild konnte nicht gelesen werden. Versuch es mit einer anderen Datei.",
  "server.avatars.noPicture":
    "Dein Anbieter hat noch kein Bild geschickt. Melde dich einmal darüber an, um es abzurufen.",
  "server.avatars.loadFailed":
    "Das Bild deines Anbieters konnte nicht geladen werden. Versuch es später noch einmal.",
  "server.avatars.uploadLabel": "ein Upload",

  "server.account.lastMethod":
    "Füge einen weiteren Passkey hinzu oder verknüpfe ein Konto, bevor du deine letzte Anmeldemöglichkeit entfernst.",
  "server.account.lastLink":
    "Passkeys sind aus, also kannst du dich nur über Single Sign-on anmelden. Lass es verknüpft.",
  "server.account.notFound": "Konto nicht gefunden.",
  "server.account.passkeyOtherAccount":
    "Diese Passkey-Anfrage gehört zu einem anderen Konto.",
  "server.account.passkeyNotFound": "Passkey nicht gefunden.",
  "server.account.noLinkedAccount": "Es ist kein Konto verknüpft.",
  "server.account.currentSession":
    "Melde dich ab, um die Sitzung zu beenden, die du gerade nutzt.",
  "server.account.sessionGone": "Diese Sitzung ist bereits beendet.",

  "server.adminUsers.gone":
    "Diesen Benutzer gibt es nicht mehr. Lade die Liste neu.",
  "server.adminUsers.lastAdmin":
    "{name} ist der einzige Admin, der sich anmelden kann. Mach zuerst jemanden zum Admin, der sich anmelden kann.",
  "server.adminUsers.lastAdminDemote":
    "Du bist der einzige Admin, der sich anmelden kann. Mach jemanden zum Admin, der sich anmelden kann, bevor du deine Admin-Rechte abgibst.",
  "server.adminUsers.lastAdminDelete":
    "Du bist der einzige Admin, der sich anmelden kann. Mach jemanden zum Admin, der sich anmelden kann, bevor du dein Konto löschst.",

  "server.adminAuth.issuerRequired":
    "Gib eine Issuer-URL ein, um Single Sign-on einzuschalten.",
  "server.adminAuth.clientIdRequired":
    "Gib eine Client-ID ein, um Single Sign-on einzuschalten.",
  "server.adminAuth.noMethod":
    "Lass Passkeys oder Single Sign-on an. Ohne beides kann sich niemand anmelden.",
  "server.adminAuth.passkeysOffLink":
    "Verknüpfe dein Konto unter Einstellungen → Konto mit Single Sign-on, bevor du Passkeys ausschaltest.",
  "server.adminAuth.passkeysOffSaveFirst":
    "Speichere zuerst Single Sign-on und verknüpfe dein Konto unter Einstellungen → Konto damit. Schalte dann Passkeys aus.",
  "server.adminAuth.ssoOnlyIssuer":
    "Du meldest dich nur über Single Sign-on an. Füge einen Passkey hinzu, bevor du den Issuer änderst.",
  "server.adminAuth.ssoOnlyOff":
    "Du meldest dich nur über Single Sign-on an. Füge einen Passkey hinzu, bevor du es ausschaltest.",
  "server.adminAuth.ssoOnlyIssuerPasskeysOff":
    "Du meldest dich nur über Single Sign-on an. Schalte Passkeys ein und füge einen hinzu, bevor du den Issuer änderst.",
  "server.adminAuth.ssoOnlyOffPasskeysOff":
    "Du meldest dich nur über Single Sign-on an. Schalte Passkeys ein und füge einen hinzu, bevor du es ausschaltest.",
  "server.adminAuth.discoveryTimeout":
    "{url} hat nicht innerhalb von 10 Sekunden geantwortet.",
  "server.adminAuth.issuerMismatch":
    "Der Anbieter nennt sich {issuer}. Verwende genau das als Issuer-URL.",
  "server.adminAuth.issuerDiffers":
    "Das Discovery-Dokument des Anbieters nennt einen anderen Issuer. Übernimm ihn genau, samt einem Schrägstrich am Ende.",
  "server.adminAuth.notDiscovery":
    "{url} ist kein Discovery-Dokument. Überprüfe die Issuer-URL.",
  "server.adminAuth.discoveryFailed":
    "{url} konnte nicht geladen werden: {reason}",

  "server.jobs.noQueue": "Diese Warteschlange gibt es nicht.",
  "server.jobs.noTask": "Diese Aufgabe gibt es nicht.",
  "server.jobs.fixedConcurrencyOne":
    "{name} führt immer nur einen Auftrag gleichzeitig aus.",
  "server.jobs.fixedConcurrency":
    "{name} führt immer {count} Aufträge gleichzeitig aus.",
  "server.jobs.maxConcurrency":
    "{name} führt höchstens {count} Aufträge gleichzeitig aus.",
  "server.jobs.cleanTranscodes":
    "Löscht Encodes, die {hours} Stunden lang niemand abgespielt hat, und danach die am längsten nicht abgespielten über {size} GB.",
  "server.jobs.libraryLabel": "Mediathek {id}",
  "server.jobs.artworkLabel": "Artwork {id}",

  "server.libraries.notFound": "Mediathek nicht gefunden.",
  "server.libraries.unreadableFolder":
    "{path} ist kein Ordner, den der Server lesen kann.",
  "server.libraries.noProvider":
    "Wähle zuerst einen Metadatenanbieter für diese Mediathek.",
  "server.libraries.noStartPoint":
    "Es wurde keine Stelle gefunden, an der diese Datei starten kann.",
  "server.libraries.cantRead": "{path} kann nicht gelesen werden.",

  "server.titles.notFound": "Dieser Titel ist in keiner Mediathek.",
  "server.titles.gone":
    "Dieser Titel ist in keiner Mediathek. Lade die Seite neu.",
  "server.titles.fileGone":
    "Diese Datei ist in keiner Mediathek. Lade die Seite neu.",
  "server.playback.unplayable":
    "Dieses Gerät kann diese Datei nicht abspielen.",
  "server.downloads.unreadable":
    "Diese Datei lässt sich nicht lesen. Versuche es erneut, sobald der Server sie gescannt hat.",
  "server.downloads.notVideo": "Nur Videos lassen sich so herunterladen.",
  "server.downloads.noDuration":
    "Der Server kennt die Länge dieses Videos nicht und kann deshalb keinen Download davon erstellen.",
  "server.downloads.noAudioTrack": "Diese Datei hat keine Tonspur {index}.",
  "server.downloads.audioTwice": "Wähle jede Tonspur nur einmal.",
  "server.downloads.audioNotMp4":
    "{format}-Ton passt nicht unverändert in eine MP4-Datei. Wandle diese Spur stattdessen um.",
  "server.downloads.cantEncodeAudio":
    "Dieser Server kann keinen {codec}-Ton kodieren.",
  "server.downloads.cantEncodeVideo":
    "Dieser Server kann nicht in {codec} kodieren.",
  "server.downloads.burnInNeedsEncode":
    "Zum Einbrennen von Untertiteln muss das Video umgewandelt werden.",
  "server.downloads.noPictureSubtitle":
    "Diese Datei hat keine Bilduntertitel mit dieser ID.",
  "server.downloads.videoNotMp4":
    "{codec}-Video passt nicht unverändert in eine MP4-Datei. Wandle stattdessen das Video um.",
  "server.downloads.encodeFailed":
    "Der Server kann dieses Video mit seinen Transkodierungseinstellungen nicht kodieren.",
  "server.profiles.notFound":
    "Niemand auf diesem Server hat diesen Benutzernamen.",
  "server.people.noCredits":
    "Kein Film und keine Serie in den Mediatheken führt diese Person auf.",

  "server.images.needsSeason": "Gib auch die Staffel der Folge an.",
  "server.images.noSeasons": "Nur Serien haben Staffeln und Folgen.",
  "server.images.wrongSlot":
    "Filme und Serien haben ein Poster, einen Hintergrund oder ein Logo, Staffeln ein Poster und Folgen ein Standbild.",
  "server.images.gone": "Dieses Bild ist nicht mehr verfügbar. Suche erneut.",

  "server.metadata.tmdbDescription":
    "The Movie Database. Filme und Serien, mit Standbildern von Folgen und Logos. Radarr nutzt sie.",
  "server.metadata.tmdbSetup":
    "Setze MATINEE_TMDB_API_KEY auf einen API-Schlüssel oder ein Lesezugriffstoken.",
  "server.metadata.tmdbNotSetUp":
    "TMDB ist nicht eingerichtet. Setze MATINEE_TMDB_API_KEY auf einen API-Schlüssel oder ein Lesezugriffstoken.",
  "server.metadata.tmdbRejectedKey":
    "TMDB hat den API-Schlüssel abgelehnt. Setze MATINEE_TMDB_API_KEY auf einen API-Schlüssel oder ein Lesezugriffstoken.",
  "server.metadata.tmdbKeyMissing": "MATINEE_TMDB_API_KEY ist nicht gesetzt",
  "server.metadata.tvdbDescription":
    "Serien in der Staffelreihenfolge, die Sonarr nutzt, dazu Filme, Logos und Bilder zu Folgen.",
  "server.metadata.tvdbSetup":
    "Setze MATINEE_TVDB_API_KEY und MATINEE_TVDB_PIN, falls dein Schlüssel eine Abonnenten-PIN braucht.",
  "server.metadata.tvdbNotSetUp":
    "TheTVDB ist nicht eingerichtet. Setze MATINEE_TVDB_API_KEY und MATINEE_TVDB_PIN, falls dein Schlüssel eine Abonnenten-PIN braucht.",
  "server.metadata.tvdbRejectedKey":
    "TheTVDB hat den API-Schlüssel abgelehnt. Setze MATINEE_TVDB_API_KEY und MATINEE_TVDB_PIN, falls dein Schlüssel eine Abonnenten-PIN braucht.",
  "server.metadata.tvdbKeyMissing": "MATINEE_TVDB_API_KEY ist nicht gesetzt",
  "server.metadata.rejectedKey":
    "{provider} hat den API-Schlüssel abgelehnt. Überprüfe die Konfiguration des Servers.",
  "server.metadata.noEntry": "{provider} hat keinen Eintrag mit dieser ID.",
  "server.metadata.noAnswer":
    "{provider} hat nicht geantwortet. Versuch es in einer Minute noch einmal.",
  "server.metadata.keepsFailing":
    "{provider} schlägt immer wieder fehl, die Abrufe pausieren vorerst.",
  "server.metadata.unreachable": "{provider} war nicht erreichbar",
  "server.metadata.answeredFor":
    "{provider} hat mit {status} für {path} geantwortet",
  "server.metadata.answered": "{name} hat mit {status} geantwortet",

  "server.process.startFailed":
    "{name} ({command}) konnte nicht gestartet werden: {error}",
  "server.process.timedOutDetail":
    "{name} hat nach {seconds} s das Zeitlimit überschritten: {detail}",
  "server.process.timedOut":
    "{name} hat nach {seconds} s das Zeitlimit überschritten",
  "server.process.exitedDetail": "{name} wurde mit {code} beendet: {detail}",
  "server.process.exited": "{name} wurde mit {code} beendet",

  "server.media.ffprobeNotJson":
    "ffprobe hat etwas anderes als JSON ausgegeben",
  "server.media.ffprobeNoStreams":
    "ffprobe hat keine Video- oder Audiostreams gefunden",
  "server.media.noPamHeader": "Die Ausgabe von ffmpeg hat keinen PAM-Header",
  "server.media.notRgba": "Die Ausgabe von ffmpeg ist kein RGBA-Bild",
  "server.media.noFrameSize": "ffprobe hat die Größe von {path} nicht gelesen",
  "server.media.noFrame":
    "ffmpeg konnte kein einziges Bild des Videos decodieren. Die Datei ist vielleicht beschädigt oder unvollständig.",
  "server.media.tooLarge": "{url} ist zu groß",
  "server.media.notImage": "{url} ist kein JPEG-, PNG- oder WebP-Bild",

  "server.transcoding.timedOut": "Zeitlimit überschritten.",
  "server.transcoding.deviceClosed": "Das Gerät ließ sich nicht öffnen.",
  "server.transcoding.ffmpegDidntRun": "ffmpeg ließ sich nicht ausführen.",
  "server.transcoding.ffmpegFailed": "ffmpeg ist fehlgeschlagen.",
} satisfies TranslationOf<typeof source>
