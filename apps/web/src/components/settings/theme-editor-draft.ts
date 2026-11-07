import type { ThemeColorRole } from "@matinee/ui/lib/theme-colors"

/**
 * How the theme editor names and groups the color roles. The draft itself
 * lives in the editor's store, `@/stores/theme-editor`.
 */

interface RoleGroup {
  label: string
  roles: readonly ThemeColorRole[]
}

const ROLE_LABELS = new Map<ThemeColorRole, string>([
  ["background", "Background"],
  ["surface", "Surface"],
  ["surfaceRaised", "Raised surface"],
  ["surfaceSunken", "Sunken surface"],
  ["input", "Input"],
  ["border", "Border"],
  ["borderStrong", "Strong border"],
  ["borderEmphasis", "Emphasis border"],
  ["text", "Text"],
  ["textMuted", "Muted text"],
  ["textDim", "Dim text"],
  ["textFaint", "Faint text"],
  ["accent", "Accent"],
  ["accentForeground", "Text on accent"],
  ["accentHover", "Accent hover"],
  ["accentActive", "Accent pressed"],
  ["accentDim", "Dim accent"],
  ["success", "Success"],
  ["warning", "Warning"],
  ["danger", "Danger"],
  ["info", "Info"],
  ["live", "Live"],
])

export const roleLabel = (role: ThemeColorRole) => ROLE_LABELS.get(role) ?? role

export const ROLE_GROUPS: readonly RoleGroup[] = [
  {
    label: "Surfaces",
    roles: ["background", "surface", "surfaceRaised", "surfaceSunken", "input"],
  },
  { label: "Borders", roles: ["border", "borderStrong", "borderEmphasis"] },
  { label: "Text", roles: ["text", "textMuted", "textDim", "textFaint"] },
  {
    label: "Accent",
    roles: [
      "accent",
      "accentForeground",
      "accentHover",
      "accentActive",
      "accentDim",
    ],
  },
  { label: "Status", roles: ["success", "warning", "danger", "info", "live"] },
]
