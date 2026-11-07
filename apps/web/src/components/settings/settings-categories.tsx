import type { User } from "@matinee/contracts"
import {
  FilmIcon,
  GalleryHorizontalEndIcon,
  KeyRoundIcon,
  LibraryBigIcon,
  ListChecksIcon,
  type LucideIcon,
  PaintbrushIcon,
  PaletteIcon,
  TvMinimalPlayIcon,
  UserIcon,
  UsersIcon,
} from "lucide-react"
import { type ComponentType, useMemo } from "react"

import type { SettingsSectionId } from "@/lib/settings"

import { AccountPanel } from "./account-panel"
import { AppearancePanel } from "./appearance-panel"
import { AuthPanel } from "./auth-panel"
import { JobsPanel } from "./jobs-panel"
import { LibrariesPanel } from "./libraries-panel"
import { PlaybackPanel } from "./playback-panel"
import { ServerAppearancePanel } from "./server-appearance-panel"
import { TranscodingPanel } from "./transcoding-panel"
import { TrickplayPanel } from "./trickplay-panel"
import { UsersPanel } from "./users-panel"

export type SettingsGroup = "account" | "admin"

export interface SettingsCategory {
  id: SettingsSectionId
  group: SettingsGroup
  label: string
  /** Shown under the label on the phone menu. */
  description: string
  /** Words a search should find this section by, shown as the match hint. */
  keywords: string[]
  icon: LucideIcon
  Panel: ComponentType
}

export const SETTINGS_GROUPS: { id: SettingsGroup; label: string }[] = [
  { id: "account", label: "Settings" },
  { id: "admin", label: "Administration" },
]

const CATEGORIES: SettingsCategory[] = [
  {
    id: "account",
    group: "account",
    label: "Account",
    description: "Profile, passkeys, single sign-on, and sessions",
    keywords: [
      "Profile",
      "Display name",
      "Picture",
      "Favorites",
      "Statistics",
      "Share",
      "Privacy",
      "Passkeys",
      "Security key",
      "Sign-in methods",
      "Single sign-on",
      "Linked accounts",
      "OIDC",
      "Sessions",
      "Devices",
      "Sign out",
    ],
    icon: UserIcon,
    Panel: AccountPanel,
  },
  {
    id: "appearance",
    group: "account",
    label: "Appearance",
    description: "Color scheme and themes",
    keywords: [
      "Theme",
      "Dark mode",
      "Light mode",
      "Color scheme",
      "Colors",
      "Custom theme",
      "Import theme",
      "VS Code",
    ],
    icon: PaletteIcon,
    Panel: AppearancePanel,
  },
  {
    id: "playback",
    group: "account",
    label: "Playback",
    description: "Languages, quality, and codecs",
    keywords: [
      "Audio language",
      "Subtitles",
      "Captions",
      "Forced subtitles",
      "Language",
      "Quality",
      "Video codec",
      "Audio codec",
      "HEVC",
      "AV1",
      "Opus",
      "Passthrough",
      "Dolby",
      "Surround",
    ],
    icon: TvMinimalPlayIcon,
    Panel: PlaybackPanel,
  },
  {
    id: "libraries",
    group: "admin",
    label: "Libraries",
    description: "Folders Matinee scans for video",
    keywords: ["Add library", "Folders", "Scan now", "Media", "Remove library"],
    icon: LibraryBigIcon,
    Panel: LibrariesPanel,
  },
  {
    id: "users",
    group: "admin",
    label: "Users",
    description: "Accounts and roles",
    keywords: [
      "Admin",
      "Role",
      "Delete user",
      "Sign out everywhere",
      "Sessions",
    ],
    icon: UsersIcon,
    Panel: UsersPanel,
  },
  {
    id: "authentication",
    group: "admin",
    label: "Authentication",
    description: "Single sign-on through OpenID Connect",
    keywords: [
      "Single sign-on",
      "SSO",
      "OIDC",
      "OpenID Connect",
      "Issuer URL",
      "Client ID",
      "Client secret",
      "Redirect URI",
      "Create accounts",
      "Authelia",
      "Authentik",
      "Keycloak",
    ],
    icon: KeyRoundIcon,
    Panel: AuthPanel,
  },
  {
    id: "transcoding",
    group: "admin",
    label: "Transcoding",
    description: "FFmpeg, GPUs, and HDR tone mapping",
    keywords: [
      "FFmpeg",
      "jellyfin-ffmpeg",
      "Hardware acceleration",
      "GPU",
      "VAAPI",
      "Quick Sync",
      "QSV",
      "NVENC",
      "VideoToolbox",
      "HEVC",
      "AV1",
      "Tone mapping",
      "HDR",
      "Dolby Vision",
      "Deinterlacing",
      "Throttling",
      "CRF",
      "Preset",
    ],
    icon: FilmIcon,
    Panel: TranscodingPanel,
  },
  {
    id: "trickplay",
    group: "admin",
    label: "Trickplay",
    description: "Thumbnails on the seek bar",
    keywords: [
      "Seek bar",
      "Scrubbing",
      "Preview thumbnails",
      "Thumbnails",
      "Keyframes",
      "Interval",
    ],
    icon: GalleryHorizontalEndIcon,
    Panel: TrickplayPanel,
  },
  {
    id: "jobs",
    group: "admin",
    label: "Jobs",
    description: "Background queues and scheduled tasks",
    keywords: [
      "Queues",
      "Workers",
      "Concurrency",
      "Scheduled tasks",
      "Scan libraries",
      "Refresh metadata",
      "Media info",
      "ffprobe",
      "Thumbnails",
      "Trickplay",
      "Pause",
      "Cancel",
      "Run now",
    ],
    icon: ListChecksIcon,
    Panel: JobsPanel,
  },
  {
    id: "server-appearance",
    group: "admin",
    label: "Appearance",
    description: "Accent color for everyone",
    keywords: ["Accent color", "Brand color", "Default theme"],
    icon: PaintbrushIcon,
    Panel: ServerAppearancePanel,
  },
]

/** Sections this user can open, in nav order. */
export function useSettingsCategories(user: User): SettingsCategory[] {
  const isAdmin = user.role === "admin"
  return useMemo(
    () =>
      CATEGORIES.filter((category) => category.group !== "admin" || isAdmin),
    [isAdmin],
  )
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ")
}

/**
 * Sections matching a query, grouped as the nav groups them. A match on a
 * keyword rather than the label comes back as `hint`, so the menu can say
 * why the section is listed.
 */
export function searchSettings(categories: SettingsCategory[], query: string) {
  const needle = normalize(query)
  const matches = categories.flatMap((category) => {
    if (!needle) return [{ category, hint: null }]
    const inLabel = normalize(category.label).includes(needle)
    const inDescription = normalize(category.description).includes(needle)
    const keyword =
      category.keywords.find((word) => normalize(word).includes(needle)) ?? null
    if (!inLabel && !inDescription && !keyword) return []
    return [{ category, hint: inLabel ? null : keyword }]
  })
  return SETTINGS_GROUPS.map(({ id, label }) => ({
    id,
    label,
    items: matches.filter((match) => match.category.group === id),
  })).filter((group) => group.items.length > 0)
}
