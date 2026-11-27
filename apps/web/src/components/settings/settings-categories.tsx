import type { Permission, User } from "@matinee/contracts"
import type { QueryClient } from "@tanstack/solid-query"
import {
  Film,
  GalleryHorizontalEnd,
  Inbox,
  KeyRound,
  KeySquare,
  LibraryBig,
  ListChecks,
  Network,
  Paintbrush,
  Palette,
  ShieldCheck,
  TvMinimalPlay,
  UserRound,
  Users,
} from "lucide"
import { type Accessor, type Component, createMemo } from "solid-js"

import { tr } from "@/i18n"
import type { IconNode } from "@/kit/icon"
import { can, canAny } from "@/lib/permissions"
import { orpc } from "@/lib/rpc"
import type { SettingsSectionId } from "@/lib/settings"

import { AccessPanel } from "./access-panel"
import { AccountPanel } from "./account-panel"
import { ApiTokensPanel } from "./api-tokens"
import { AppearancePanel } from "./appearance-panel"
import { AuthPanel } from "./auth-panel"
import { BrandingPanel } from "./branding-panel"
import { JobsPanel } from "./jobs-panel"
import { LibrariesPanel } from "./libraries-panel"
import { NetworkPanel } from "./network-panel"
import { PlaybackPanel } from "./playback-panel"
import { RequestsPanel } from "./requests-panel"
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
  icon: IconNode
  Panel: Component
  /**
   * Starts the queries the panel opens with, so a switch that finds them
   * loaded shows the panel whole instead of a skeleton for a moment.
   */
  prefetch?: (queryClient: QueryClient) => void
}

const SETTINGS_GROUPS: readonly SettingsGroup[] = ["account", "admin"]

/** A section's place in the nav; its text comes from the catalog. */
type SectionEntry = Pick<
  SettingsCategory,
  "id" | "group" | "icon" | "Panel" | "prefetch"
> & {
  /**
   * The permissions that open the section: an account with any of them
   * sees it. Its panel checks each action itself, so holding one is
   * enough to use it. None for a section every account has.
   */
  needs?: readonly Permission[]
  /**
   * The permissions a section needs every one of: those its panel calls
   * with. The panel is one form or list with no read-only form, so an
   * account short of one would see controls that always fail.
   */
  needsAll?: readonly Permission[]
}

const SECTIONS: SectionEntry[] = [
  {
    id: "account",
    group: "account",
    icon: UserRound,
    Panel: AccountPanel,
    prefetch: (queryClient) => {
      void queryClient.prefetchQuery(orpc.account.passkeys.list.queryOptions())
      void queryClient.prefetchQuery(orpc.account.sessions.list.queryOptions())
    },
  },
  {
    id: "appearance",
    group: "account",
    icon: Palette,
    Panel: AppearancePanel,
  },
  {
    id: "playback",
    group: "account",
    icon: TvMinimalPlay,
    Panel: PlaybackPanel,
    prefetch: (queryClient) =>
      void queryClient.prefetchQuery(orpc.playback.options.queryOptions()),
  },
  {
    // Every account, as one that may no longer make tokens still revokes
    // the ones it has.
    id: "apiTokens",
    group: "account",
    icon: KeySquare,
    Panel: ApiTokensPanel,
    prefetch: (queryClient) =>
      void queryClient.prefetchQuery(
        orpc.account.apiTokens.list.queryOptions(),
      ),
  },
  {
    id: "libraries",
    group: "admin",
    needs: [
      "library.create",
      "library.update",
      "library.delete",
      "library.scan",
    ],
    icon: LibraryBig,
    Panel: LibrariesPanel,
    prefetch: (queryClient) => {
      void queryClient.prefetchQuery(orpc.libraries.list.queryOptions())
      void queryClient.prefetchQuery(orpc.metadata.providers.queryOptions())
    },
  },
  {
    id: "users",
    group: "admin",
    needs: ["adminUser.read"],
    icon: Users,
    Panel: UsersPanel,
    prefetch: (queryClient) =>
      void queryClient.prefetchQuery(orpc.admin.users.list.queryOptions()),
  },
  {
    id: "access",
    group: "admin",
    needs: ["group.read"],
    icon: ShieldCheck,
    Panel: AccessPanel,
    prefetch: (queryClient) => {
      void queryClient.prefetchQuery(orpc.admin.groups.list.queryOptions())
      void queryClient.prefetchQuery(orpc.libraries.list.queryOptions())
    },
  },
  {
    id: "requests",
    group: "admin",
    needsAll: [
      "fulfilment.read",
      "fulfilment.create",
      "fulfilment.update",
      "fulfilment.delete",
    ],
    icon: Inbox,
    Panel: RequestsPanel,
    prefetch: (queryClient) => {
      void queryClient.prefetchQuery(
        orpc.admin.fulfilment.sources.queryOptions(),
      )
      void queryClient.prefetchQuery(
        orpc.admin.fulfilment.connections.queryOptions(),
      )
    },
  },
  {
    id: "authentication",
    group: "admin",
    needs: ["all"],
    icon: KeyRound,
    Panel: AuthPanel,
    prefetch: (queryClient) =>
      void queryClient.prefetchQuery(orpc.admin.auth.get.queryOptions()),
  },
  {
    id: "transcoding",
    group: "admin",
    needsAll: ["transcodingSettings.read", "transcodingSettings.update"],
    icon: Film,
    Panel: TranscodingPanel,
    prefetch: (queryClient) =>
      void queryClient.prefetchQuery(orpc.admin.transcoding.get.queryOptions()),
  },
  {
    id: "trickplay",
    group: "admin",
    needsAll: ["trickplaySettings.read", "trickplaySettings.update"],
    icon: GalleryHorizontalEnd,
    Panel: TrickplayPanel,
    prefetch: (queryClient) =>
      void queryClient.prefetchQuery(orpc.admin.trickplay.get.queryOptions()),
  },
  {
    id: "network",
    group: "admin",
    needsAll: ["networkSettings.read", "networkSettings.update"],
    icon: Network,
    Panel: NetworkPanel,
    prefetch: (queryClient) =>
      void queryClient.prefetchQuery(orpc.admin.network.get.queryOptions()),
  },
  {
    id: "jobs",
    group: "admin",
    needsAll: ["job.read", "job.update"],
    icon: ListChecks,
    Panel: JobsPanel,
  },
  {
    id: "branding",
    group: "admin",
    needsAll: ["branding.read", "branding.update"],
    icon: Paintbrush,
    Panel: BrandingPanel,
    prefetch: (queryClient) =>
      void queryClient.prefetchQuery(orpc.admin.branding.get.queryOptions()),
  },
]

/** A section in the interface's language. */
function describe(section: SectionEntry): SettingsCategory {
  const keywords = tr(`settings.section.${section.id}.keywords`)
  return {
    id: section.id,
    group: section.group,
    icon: section.icon,
    Panel: section.Panel,
    prefetch: section.prefetch,
    label: tr(`settings.section.${section.id}.label`),
    description: tr(`settings.section.${section.id}.description`),
    keywords: keywords.split(",").map((word) => word.trim()),
  }
}

/** Sections this user can open, in nav order. */
export function useSettingsCategories(
  user: () => User,
): Accessor<SettingsCategory[]> {
  return createMemo(() => {
    const { permissions } = user()
    return SECTIONS.filter(
      (section) =>
        (!section.needs || canAny({ permissions }, section.needs)) &&
        (section.needsAll ?? []).every((permission) =>
          can({ permissions }, permission),
        ),
    ).map(describe)
  })
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
