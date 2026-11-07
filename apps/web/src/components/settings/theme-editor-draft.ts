import type { ThemeColorRole } from "@matinee/ui/lib/theme-colors"

import { tr } from "@/i18n"

/**
 * How the theme editor names and groups the color roles. The draft itself
 * lives in the editor's store, `@/stores/theme-editor`.
 */

type RoleGroupId = "surfaces" | "borders" | "text" | "accent" | "status"

interface RoleGroup {
  id: RoleGroupId
  roles: readonly ThemeColorRole[]
}

export const roleLabel = (role: ThemeColorRole) => tr(`themes.role.${role}`)

export const groupLabel = (group: RoleGroupId) => tr(`themes.group.${group}`)

export const ROLE_GROUPS: readonly RoleGroup[] = [
  {
    id: "surfaces",
    roles: ["background", "surface", "surfaceRaised", "surfaceSunken", "input"],
  },
  { id: "borders", roles: ["border", "borderStrong", "borderEmphasis"] },
  { id: "text", roles: ["text", "textMuted", "textDim", "textFaint"] },
  {
    id: "accent",
    roles: [
      "accent",
      "accentForeground",
      "accentHover",
      "accentActive",
      "accentDim",
    ],
  },
  { id: "status", roles: ["success", "warning", "danger", "info", "live"] },
]
