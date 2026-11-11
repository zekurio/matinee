import { defineMessages } from "../../catalog"

export default defineMessages("settings", {
  // The settings dialog and its navigation.
  "settings.title": "Settings",
  "settings.close": "Close settings",
  "settings.back": "Back to settings",
  "settings.search": "Search settings",
  "settings.noMatch": "No settings match “{query}”.",
  "settings.group.account": "Settings",
  "settings.group.admin": "Administration",
  // Keywords are what a search finds a section by, separated by commas.
  "settings.section.account.label": "Account",
  "settings.section.account.description":
    "Profile, passkeys, single sign-on, and sessions",
  "settings.section.account.keywords":
    "Profile, Display name, Picture, Favorites, Statistics, Share, Privacy, Passkeys, Security key, Sign-in methods, Single sign-on, Linked accounts, OIDC, Sessions, Devices, Sign out",
  "settings.section.appearance.label": "Appearance",
  "settings.section.appearance.description":
    "Language, color scheme, and themes",
  "settings.section.appearance.keywords":
    "Language, Translation, Theme, Dark mode, Light mode, Color scheme, Colors, Custom theme, Import theme, VS Code",
  "settings.section.playback.label": "Playback",
  "settings.section.playback.description": "Languages, quality, and codecs",
  "settings.section.playback.keywords":
    "Audio language, Subtitles, Captions, Forced subtitles, Language, Quality, Video codec, Audio codec, HEVC, AV1, Opus, Passthrough, Dolby, Surround",
  "settings.section.libraries.label": "Libraries",
  "settings.section.libraries.description": "Folders Matinee scans for video",
  "settings.section.libraries.keywords":
    "Add library, Folders, Scan now, Media, Remove library",
  "settings.section.users.label": "Users",
  "settings.section.users.description": "Accounts and roles",
  "settings.section.users.keywords":
    "Admin, Role, Delete user, Sign out everywhere, Sessions, Invite, Invite link",
  "settings.section.access.label": "Access",
  "settings.section.access.description": "Groups, libraries, and limits",
  "settings.section.access.keywords":
    "Access groups, Groups, Permissions, Libraries, Bit rate, Limit, Bandwidth, Encoding, Transcoding, Downloads, Streams, Devices, Provider groups, Kids",
  "settings.section.authentication.label": "Authentication",
  "settings.section.authentication.description": "Passkeys and single sign-on",
  "settings.section.authentication.keywords":
    "Passkeys, Sign-in methods, Single sign-on, SSO, OIDC, OpenID Connect, Issuer URL, Client ID, Client secret, Redirect URI, Create accounts, Sign-up, Registration, Authelia, Authentik, Keycloak",
  "settings.section.transcoding.label": "Transcoding",
  "settings.section.transcoding.description":
    "FFmpeg, GPUs, and HDR tone mapping",
  "settings.section.transcoding.keywords":
    "FFmpeg, jellyfin-ffmpeg, Hardware acceleration, GPU, VAAPI, Quick Sync, QSV, NVENC, VideoToolbox, HEVC, AV1, Tone mapping, HDR, Dolby Vision, Deinterlacing, Throttling, CRF, Preset",
  "settings.section.trickplay.label": "Trickplay",
  "settings.section.trickplay.description": "Thumbnails on the seek bar",
  "settings.section.trickplay.keywords":
    "Seek bar, Scrubbing, Preview thumbnails, Thumbnails, Keyframes, Interval",
  "settings.section.jobs.label": "Jobs",
  "settings.section.jobs.description": "Background queues and scheduled tasks",
  "settings.section.jobs.keywords":
    "Queues, Workers, Concurrency, Scheduled tasks, Scan libraries, Refresh metadata, Media info, ffprobe, Thumbnails, Trickplay, Pause, Cancel, Run now",
  "settings.section.server-appearance.label": "Appearance",
  "settings.section.server-appearance.description": "Accent color for everyone",
  "settings.section.server-appearance.keywords":
    "Accent color, Brand color, Default theme",
})
