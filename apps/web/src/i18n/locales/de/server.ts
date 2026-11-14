import type { TranslationOf } from "../../catalog"
import type source from "../en/server"

export default {
  "server.catalog.titleNotFound": "Matinee findet diesen Titel nicht.",
  "server.catalog.lookupDown":
    "Matinee kann gerade keine Titel nachschlagen. Versuch es in einer Minute noch einmal.",
  "server.catalog.filterGone":
    "Einen dieser Filter gibt es nicht mehr. Nimm ihn heraus und versuch es noch einmal.",
  "server.catalog.filtersRefused":
    "Der Katalog nimmt diese Filter nicht an. Ändere sie und versuch es noch einmal.",
  "server.fulfilment.slugConflict":
    "Eine Verbindung verwendet diesen Slug bereits. Wähle einen anderen Slug.",
  "server.fulfilment.optionsMissing": "Wähle jede Option der Verbindung.",
  "server.fulfilment.settingsInvalid":
    "Prüfe die Einstellungen der Verbindung.",
  "server.fulfilment.folderLost":
    "{folder} liegt in keiner Mediathek, die Matinee für diese Art Titel durchsucht. Wähle die Mediathek, in der es landet, oder speichere in einen anderen Ordner.",
  "server.fulfilment.filmFolder": "Wähle den Ordner, in dem Filme landen.",
  "server.fulfilment.showFolder": "Wähle den Ordner, in dem Serien landen.",
  "server.fulfilment.noRules":
    "Diese Verbindung nimmt keine Überschreibungsregeln.",
  "server.fulfilment.ruleCondition": "Gib der Regel mindestens eine Bedingung.",
  "server.fulfilment.ruleSettings":
    "Wähle jede Einstellung der Regel aus den Angeboten der Verbindung.",
  "server.fulfilment.ruleSetting":
    "Wähle mindestens eine Einstellung, die die Regel ändert.",
  "server.fulfilment.ruleUsers": "Wähle Konten, die es gibt.",
  "server.fulfilment.ruleMissing": "Regel nicht gefunden.",
  "server.fulfilment.rulesChanged":
    "Die Regeln haben sich geändert. Lade sie neu und versuch es noch einmal.",
  "server.fulfilment.keywordsNeedTmdb":
    "Schlagwörter kommen von TMDB. Setze zuerst MATINEE_TMDB_API_KEY.",
  "server.fulfilment.ruleLanguage": "Wähle eine Sprache aus der Liste.",
  "server.catalog.matchFailed":
    "Dieser Titel konnte beim Metadatenanbieter der Zielmediathek nicht zugeordnet werden.",
  "server.requests.missing": "Diese Anfrage ist nicht verfügbar.",
  "server.requests.seasons": "Wähle Staffeln aus der Liste dieser Serie.",
  "server.requests.notNow": "Du kannst diesen Titel gerade nicht anfragen.",
  "server.requests.declined":
    "Dieser Titel wurde abgelehnt. Anfragen gehen erst wieder, wenn ein Admin sie zulässt.",
  "server.requests.declineWaiting":
    "Nur eine wartende Anfrage lässt sich ablehnen. Gib eine angenommene stattdessen auf.",
  "server.requests.giveUpAccepted":
    "Nur eine angenommene Anfrage, die noch nicht angekommen ist, lässt sich aufgeben.",
  "server.requests.notDeclined":
    "Diese Anfrage ist nicht mehr abgelehnt. Lade die Liste neu.",
  "server.requests.cancel":
    "Ziehe deine Anfrage zurück, um diesem Titel nicht mehr zu folgen.",
  "server.requests.cursor": "Lade diese Liste neu und versuche es erneut.",
  "server.requests.noConnection":
    "Wähle eine nutzbare Beschaffungsverbindung für diese Mediathek.",
  "server.requests.unresolvedTitle":
    "Die Titelidentität konnte nicht ermittelt werden. Prüfe die Metadatenzuordnung und versuche es erneut.",
  "server.requests.deliveryFailed":
    "Die Anfrage konnte nicht gesendet werden. Prüfe die Verbindung und versuche es erneut.",
  "server.requests.moveTarget":
    "Wähle eine Mediathek, in die dieser Titel kommen kann.",
  "server.requests.moveWaiting":
    "Nur eine wartende Anfrage kann in eine andere Mediathek wechseln.",
  "server.requests.moveChanged":
    "Diese Anfrage hat sich geändert. Lade die Liste neu und versuche es erneut.",
  "server.requests.moveHeld":
    "{library} hat diese Serie schon, also kommen ihre neuen Staffeln auch dorthin.",
  "server.requests.moveTaken":
    "In {library} gibt es schon eine Anfrage für diesen Titel. Lass diese hier, wo sie ist, oder lehne sie ab.",
  "server.notifications.endpoint":
    "Verwende einen unterstützten Push-Dienst deines Browsers.",
  "server.fulfilment.keyFile":
    "Die Schlüsseldatei der Verbindung kann nicht gelesen werden. Prüfe Pfad und Berechtigungen.",
  "server.fulfilment.source.manual": "Von Hand",
  "server.fulfilment.field.baseUrl": "Basis-URL",
  "server.fulfilment.field.qualityProfile": "Qualitätsprofil",
  "server.fulfilment.field.rootFolder": "Stammordner",
  "server.fulfilment.field.tags": "Tags",
  "server.fulfilment.field.minimumAvailability": "Mindestverfügbarkeit",
  "server.fulfilment.field.seasonFolders": "Staffelordner",
  "server.fulfilment.field.monitorNewSeasons": "Neue Staffeln überwachen",
  "server.fulfilment.field.animeSeriesType": "Serientyp für Anime",
  "server.fulfilment.field.animeQualityProfile": "Qualitätsprofil für Anime",
  "server.fulfilment.field.animeRootFolder": "Stammordner für Anime",
  "server.fulfilment.field.animeTags": "Tags für Anime",
  "server.fulfilment.field.externalUrl": "Externe URL",
  "server.fulfilment.field.search": "Automatisch suchen",
  "server.fulfilment.field.tagRequests": "Anfragen taggen",
  "server.fulfilment.field.filmsFolder": "Ordner für Filme",
  "server.fulfilment.field.showsFolder": "Ordner für Serien",
  "server.fulfilment.availability.announced": "Angekündigt",
  "server.fulfilment.availability.inCinemas": "Im Kino",
  "server.fulfilment.availability.released": "Veröffentlicht",
  "server.fulfilment.field.seriesType": "Serientyp",
  "server.fulfilment.httpUrl": "Verwende eine HTTP- oder HTTPS-URL.",
  "server.fulfilment.unknownSource": "Wähle eine verfügbare Bezugsquelle.",
  "server.fulfilment.keyTwice":
    "Setze den Verbindungsschlüssel oder seine Datei, nicht beides.",
  "server.fulfilment.connectionMissing": "Verbindung nicht gefunden.",
  "server.fulfilment.unreachable":
    "Die Verbindung ist nicht erreichbar. Prüfe URL und Netzwerkzugriff.",
  "server.fulfilment.keyRejected":
    "Die Verbindung hat den API-Schlüssel abgelehnt. Prüfe den gespeicherten Schlüssel oder die Umgebungsvariable.",
  "server.fulfilment.operationRejected":
    "Die Verbindung hat den Vorgang abgelehnt. Prüfe Konfiguration und Protokolle.",
  "server.fulfilment.notRadarr":
    "Diese URL gehört nicht zu einem Radarr-Server.",
  "server.fulfilment.notSonarr":
    "Diese URL gehört nicht zu einem Sonarr-Server.",
  "server.fulfilment.titleNotFound":
    "Die Verbindung konnte diesen Titel nicht finden. Prüfe seine externe Kennung.",
  "server.fulfilment.titleRemoved":
    "Der Titel wurde aus der Verbindung entfernt. Versuche die Anfrage erneut.",
  "server.fulfilment.transferFailed":
    "Eine Übertragung ist fehlgeschlagen. Prüfe die Warteschlange der Verbindung.",
  "server.fulfilment.seriesType.standard": "Standard",
  "server.fulfilment.seriesType.daily": "Täglich",
  "server.fulfilment.seriesType.anime": "Anime",
  "server.downloads.tooManyAudioTracks":
    "Ein Download kann höchstens 16 Audiospuren enthalten.",
  "server.downloads.selectedAudioUnavailable":
    "Die ausgewählten Audiospuren sind in dieser Datei nicht verfügbar.",
  "server.downloads.noDownloadVideo":
    "Der Server kann das Video in keinem Codec kodieren, den dieses Gerät abspielt.",
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
  "server.auth.inviteGone":
    "Dieser Einladungslink funktioniert nicht. Vielleicht ist er abgelaufen oder wurde schon benutzt.",

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
  "server.adminInvites.gone":
    "Diese Einladung gibt es nicht mehr. Lade die Liste neu.",
  // access/media.ts and rpc/playback-start.ts: an account's limits.
  "server.access.downloadsOff": "Downloads sind für dein Konto ausgeschaltet.",
  "server.access.downloadVideoOff":
    "Der Server darf für dein Konto kein Video umwandeln. Lade die Datei unverändert herunter oder behalte ihr Video bei.",
  "server.access.overLimitSeek":
    "Diese Datei liegt über der Bitrate, die dein Konto streamen darf. Wähle eine niedrigere Qualität, um sie anzusehen.",
  "server.access.overLimitNoEncoding":
    "Diese Datei liegt über der Bitrate, die dein Konto streamen darf, und der Server darf für dein Konto kein Video umwandeln. Frag die Person, die den Server betreibt.",
  "server.access.overLimitEncodeFailed":
    "Diese Datei liegt über der Bitrate, die dein Konto streamen darf, und das Umwandeln des Videos ist fehlgeschlagen. Versuch es noch einmal oder frag die Person, die den Server betreibt.",
  "server.access.overLimitNoVersion":
    "Diese Datei liegt über der Bitrate, die dein Konto streamen darf, und der Server kann unter diesem Limit keine Version erstellen, die dieses Gerät abspielt. Versuch ein anderes Gerät oder frag die Person, die den Server betreibt.",
  "server.access.needsEncoding":
    "Dieses Gerät braucht das Video umgewandelt, aber der Server darf für dein Konto kein Video umwandeln. Versuch ein anderes Gerät oder frag die Person, die den Server betreibt.",
  "server.access.tooManyStreamsOne":
    "Dein Konto spielt auf 1 Gerät ab, mehr sind nicht erlaubt. Beende die Wiedergabe dort, um hier zu schauen.",
  "server.access.tooManyStreams":
    "Dein Konto spielt auf {count} Geräten ab, mehr sind nicht erlaubt. Beende die Wiedergabe auf einem, um hier zu schauen.",
  "server.adminGroups.gone":
    "Diese Gruppe gibt es nicht mehr. Lade die Liste neu.",
  "server.adminGroups.nameTaken": "Eine andere Gruppe hat diesen Namen.",
  "server.adminGroups.everyone":
    "Jedes Konto ist in dieser Gruppe, deshalb kann sie nicht gelöscht werden. Nimm ihr stattdessen die Mediatheken weg.",
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

  "server.network.invalidRange":
    "{entry} ist keine Adresse und kein Bereich wie 192.168.0.0/16.",

  "server.party.over": "Diese Watch-Party ist vorbei.",
  "server.party.ownerOnly": "Das kann nur der Host der Party.",
  "server.party.full": "Diese Watch-Party ist voll.",
  "server.party.queueFull": "Die Warteschlange der Party ist voll.",
  "server.party.ownerSkips":
    "Nur der Host der Party kann zum Nächsten springen.",
  "server.party.entryGone":
    "Das ist nicht mehr in der Warteschlange der Party.",
  "server.party.removed": "Du wurdest aus dieser Watch-Party entfernt.",
  "server.party.notMember": "Diese Person ist nicht mehr in der Party.",
  "server.party.self": "Wähle jemand anderen als dich selbst.",
  "server.party.notIn": "Du bist in keiner Watch-Party.",

  "server.titles.notFound": "Dieser Titel ist in keiner Mediathek.",
  "server.titles.gone":
    "Dieser Titel ist in keiner Mediathek. Lade die Seite neu.",
  "server.titles.fileGone":
    "Diese Datei ist in keiner Mediathek. Lade die Seite neu.",
  "server.favorites.notShow": "Nur Serien haben Staffeln.",
  "server.favorites.seasonGone":
    "Diese Staffel hat keine Dateien mehr. Lade die Seite neu.",
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

  "server.media.subtitlePrepareFailed":
    "Untertitel für {path} konnten nicht vorbereitet werden",
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
