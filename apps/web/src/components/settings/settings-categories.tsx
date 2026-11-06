import type { User } from "@matinee/contracts"
import {
  KeyRoundIcon,
  LibraryBigIcon,
  type LucideIcon,
  UserIcon,
} from "lucide-react"
import { type ComponentType, useMemo } from "react"

import type { SettingsSectionId } from "@/lib/settings"

import { AccountPanel } from "./account-panel"
import { AuthPanel } from "./auth-panel"
import { LibrariesPanel } from "./libraries-panel"

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
    description: "Passkeys and single sign-on",
    keywords: [
      "Passkeys",
      "Security key",
      "Sign-in methods",
      "Single sign-on",
      "Linked accounts",
      "OIDC",
    ],
    icon: UserIcon,
    Panel: AccountPanel,
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
