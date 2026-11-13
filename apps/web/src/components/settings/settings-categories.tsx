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
  ShieldCheckIcon,
  TvMinimalPlayIcon,
  UserIcon,
  UsersIcon,
} from "lucide-react"
import { type ComponentType, useMemo } from "react"

import { tr } from "@/i18n"
import type { SettingsSectionId } from "@/lib/settings"

import { AccessPanel } from "./access-panel"
import { AccountPanel } from "./account-panel"
import { AppearancePanel } from "./appearance-panel"
import { AuthPanel } from "./auth-panel"
import { BrandingPanel } from "./branding-panel"
import { JobsPanel } from "./jobs-panel"
import { LibrariesPanel } from "./libraries-panel"
import { PlaybackPanel } from "./playback-panel"
import { TranscodingPanel } from "./transcoding-panel"
import { TrickplayPanel } from "./trickplay-panel"
import { UsersPanel } from "./users-panel"

type SettingsGroup = "account" | "admin"

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

const SETTINGS_GROUPS: readonly SettingsGroup[] = ["account", "admin"]

/** A section's place in the nav; its text comes from the catalog. */
type SectionEntry = Pick<SettingsCategory, "id" | "group" | "icon" | "Panel">

const SECTIONS: SectionEntry[] = [
  { id: "account", group: "account", icon: UserIcon, Panel: AccountPanel },
  {
    id: "appearance",
    group: "account",
    icon: PaletteIcon,
    Panel: AppearancePanel,
  },
  {
    id: "playback",
    group: "account",
    icon: TvMinimalPlayIcon,
    Panel: PlaybackPanel,
  },
  {
    id: "libraries",
    group: "admin",
    icon: LibraryBigIcon,
    Panel: LibrariesPanel,
  },
  { id: "users", group: "admin", icon: UsersIcon, Panel: UsersPanel },
  { id: "access", group: "admin", icon: ShieldCheckIcon, Panel: AccessPanel },
  {
    id: "authentication",
    group: "admin",
    icon: KeyRoundIcon,
    Panel: AuthPanel,
  },
  {
    id: "transcoding",
    group: "admin",
    icon: FilmIcon,
    Panel: TranscodingPanel,
  },
  {
    id: "trickplay",
    group: "admin",
    icon: GalleryHorizontalEndIcon,
    Panel: TrickplayPanel,
  },
  { id: "jobs", group: "admin", icon: ListChecksIcon, Panel: JobsPanel },
  {
    id: "branding",
    group: "admin",
    icon: PaintbrushIcon,
    Panel: BrandingPanel,
  },
]

/** A section in the interface's language. */
function describe(section: SectionEntry): SettingsCategory {
  const keywords = tr(`settings.section.${section.id}.keywords`)
  return {
    ...section,
    label: tr(`settings.section.${section.id}.label`),
    description: tr(`settings.section.${section.id}.description`),
    keywords: keywords.split(",").map((word) => word.trim()),
  }
}

/** Sections this user can open, in nav order. */
export function useSettingsCategories(user: User): SettingsCategory[] {
  const isAdmin = user.role === "admin"
  return useMemo(
    () =>
      SECTIONS.filter((section) => section.group !== "admin" || isAdmin).map(
        describe,
      ),
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
  return SETTINGS_GROUPS.map((id) => ({
    id,
    label: tr(`settings.group.${id}`),
    items: matches.filter((match) => match.category.group === id),
  })).filter((group) => group.items.length > 0)
}
