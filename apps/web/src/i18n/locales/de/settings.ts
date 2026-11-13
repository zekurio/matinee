import type { TranslationOf } from "../../catalog"
import type source from "../en/settings"

export default {
  "settings.title": "Einstellungen",
  "settings.close": "Einstellungen schließen",
  "settings.back": "Zurück zu den Einstellungen",
  "settings.search": "Einstellungen durchsuchen",
  "settings.noMatch": "Keine Einstellung passt zu „{query}“.",
  "settings.group.account": "Einstellungen",
  "settings.group.admin": "Verwaltung",
  "settings.section.account.label": "Konto",
  "settings.section.account.description":
    "Profil, Passkeys, Single Sign-on und Sitzungen",
  "settings.section.account.keywords":
    "Profil, Anzeigename, Bild, Favoriten, Statistiken, Teilen, Privatsphäre, Passkeys, Sicherheitsschlüssel, Anmeldemethoden, Single Sign-on, Verknüpfte Konten, OIDC, Sitzungen, Geräte, Abmelden",
  "settings.section.appearance.label": "Darstellung",
  "settings.section.appearance.description": "Sprache, Farbschema und Designs",
  "settings.section.appearance.keywords":
    "Sprache, Übersetzung, Design, Theme, Dunkler Modus, Heller Modus, Farbschema, Farben, Eigenes Design, Design importieren, VS Code",
  "settings.section.playback.label": "Wiedergabe",
  "settings.section.playback.description": "Sprachen, Qualität und Codecs",
  "settings.section.playback.keywords":
    "Audiosprache, Untertitel, Erzwungene Untertitel, Sprache, Qualität, Videocodec, Audiocodec, HEVC, AV1, Opus, Passthrough, Dolby, Surround",
  "settings.section.libraries.label": "Mediatheken",
  "settings.section.libraries.description":
    "Ordner, die Matinee nach Videos durchsucht",
  "settings.section.libraries.keywords":
    "Mediathek hinzufügen, Ordner, Jetzt scannen, Medien, Mediathek entfernen",
  "settings.section.users.label": "Benutzer",
  "settings.section.users.description": "Konten und Rollen",
  "settings.section.users.keywords":
    "Admin, Rolle, Benutzer löschen, Überall abmelden, Sitzungen, Einladen, Einladungslink",
  "settings.section.access.label": "Zugriff",
  "settings.section.access.description": "Gruppen, Mediatheken und Grenzen",
  "settings.section.access.keywords":
    "Zugriffsgruppen, Gruppen, Berechtigungen, Mediatheken, Bitrate, Limit, Bandbreite, Kodierung, Transkodierung, Downloads, Streams, Geräte, Anbietergruppen, Kinder",
  "settings.section.authentication.label": "Authentifizierung",
  "settings.section.authentication.description": "Passkeys und Single Sign-on",
  "settings.section.authentication.keywords":
    "Passkeys, Anmeldemethoden, Single Sign-on, SSO, OIDC, OpenID Connect, Issuer-URL, Client-ID, Client-Secret, Weiterleitungs-URI, Konten erstellen, Registrierung, Authelia, Authentik, Keycloak",
  "settings.section.transcoding.label": "Transkodierung",
  "settings.section.transcoding.description":
    "FFmpeg, GPUs und HDR-Tone-Mapping",
  "settings.section.transcoding.keywords":
    "FFmpeg, jellyfin-ffmpeg, Hardwarebeschleunigung, GPU, VAAPI, Quick Sync, QSV, NVENC, VideoToolbox, HEVC, AV1, Tone-Mapping, HDR, Dolby Vision, Deinterlacing, Drosselung, CRF, Preset",
  "settings.section.trickplay.label": "Trickplay",
  "settings.section.trickplay.description": "Vorschaubilder auf der Zeitleiste",
  "settings.section.trickplay.keywords":
    "Zeitleiste, Spulen, Vorschaubilder, Thumbnails, Keyframes, Intervall",
  "settings.section.network.label": "Netzwerk",
  "settings.section.network.description":
    "Lokale Netzwerke, Proxys und Upload-Geschwindigkeit",
  "settings.section.network.keywords":
    "Lokales Netzwerk, LAN, Entfernt, Reverse-Proxy, Vertrauenswürdige Proxys, X-Forwarded-For, CIDR, IP-Adresse, Upload, Bandbreite, Bitrate, Watch-Party",
  "settings.section.jobs.label": "Aufgaben",
  "settings.section.jobs.description":
    "Hintergrund-Warteschlangen und geplante Aufgaben",
  "settings.section.jobs.keywords":
    "Warteschlangen, Worker, Parallelität, Geplante Aufgaben, Mediatheken scannen, Metadaten aktualisieren, Medieninfo, ffprobe, Vorschaubilder, Trickplay, Pausieren, Abbrechen, Jetzt ausführen",
  "settings.section.branding.label": "Branding",
  "settings.section.branding.description": "Akzentfarbe und Anmeldeseite",
  "settings.section.branding.keywords":
    "Akzentfarbe, Markenfarbe, Standarddesign, Darstellung, Anmeldeseite, Anmeldung, Hintergrund, Poster, Szenenbilder, Artwork",
} satisfies TranslationOf<typeof source>
