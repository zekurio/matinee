import { defineMessages, plural } from "../../catalog"

export default defineMessages("themes", {
  // A theme's card, in theme-card.tsx. {theme} is the theme's name.
  "themes.card.use": "Use {theme} for light and dark",
  "themes.card.variants": plural({
    one: "{count} variant",
    other: "{count} variants",
  }),
  "themes.card.actions": "{theme} actions",
  "themes.card.edit": "Edit",
  "themes.card.rename": "Rename",
  "themes.card.duplicate": "Duplicate",
  "themes.card.duplicateNamed": "Duplicate {theme}",
  "themes.card.export": "Export",
  "themes.card.delete": "Delete",
  // A swatch. {variant} is the variant's name.
  "themes.card.usedLight": "{variant}, used in light mode",
  "themes.card.usedDark": "{variant}, used in dark mode",

  // A copy's name, for a duplicated theme or variant.
  "themes.copyName": "{name} copy",

  // Renaming and deleting, in theme-dialogs.tsx.
  "themes.rename.title": "Rename theme",
  "themes.rename.name": "Name",
  "themes.rename.submit": "Rename",
  "themes.rename.failed": "Couldn't rename theme",
  "themes.delete.title": "Delete {theme}?",
  "themes.delete.titleUnnamed": "Delete theme?",
  "themes.delete.description": "Modes using it go back to Matinee.",
  "themes.delete.submit": "Delete",
  "themes.delete.failed": "Couldn't delete theme",
  "themes.cancel": "Cancel",

  // The theme editor, in theme-editor.tsx.
  "themes.editor.new": "New theme",
  "themes.editor.edit": "Edit theme",
  "themes.editor.picking": "Click anything to find its color. Esc cancels.",
  "themes.editor.miss": "That doesn't use a theme color.",
  "themes.editor.inspect": "Inspect",
  "themes.editor.expand": "Expand",
  "themes.editor.collapse": "Collapse",
  "themes.editor.close": "Close",
  "themes.editor.create": "Create",
  "themes.editor.creating": "Creating…",
  "themes.editor.save": "Save",
  "themes.editor.saving": "Saving…",
  "themes.editor.saved": "Saved",
  "themes.editor.retry": "Try again",

  // The editor's fields, in theme-editor-fields.tsx.
  "themes.editor.name": "Name",
  "themes.editor.variants": "Variants",
  "themes.editor.addVariant": "Add variant",
  "themes.editor.light": "Light",
  "themes.editor.dark": "Dark",
  "themes.editor.variant": "Variant",
  "themes.editor.colors": "Colors",
  "themes.editor.filter": "Filter",
  "themes.editor.filterColors": "Filter colors",
  "themes.editor.advanced": "Advanced",
  "themes.editor.guided": "Pick two colors. Matinee fills in the rest.",
  "themes.editor.duplicateVariant": "Duplicate variant",
  "themes.editor.removeVariant": "Remove variant",

  // Color roles and their groups, in theme-editor-draft.ts.
  "themes.group.surfaces": "Surfaces",
  "themes.group.borders": "Borders",
  "themes.group.text": "Text",
  "themes.group.accent": "Accent",
  "themes.group.status": "Status",
  "themes.role.background": "Background",
  "themes.role.surface": "Surface",
  "themes.role.surfaceRaised": "Raised surface",
  "themes.role.surfaceSunken": "Sunken surface",
  "themes.role.input": "Input",
  "themes.role.border": "Border",
  "themes.role.borderStrong": "Strong border",
  "themes.role.borderEmphasis": "Emphasis border",
  "themes.role.text": "Text",
  "themes.role.textMuted": "Muted text",
  "themes.role.textDim": "Dim text",
  "themes.role.textFaint": "Faint text",
  "themes.role.accent": "Accent",
  "themes.role.accentForeground": "Text on accent",
  "themes.role.accentHover": "Accent hover",
  "themes.role.accentActive": "Accent pressed",
  "themes.role.accentDim": "Dim accent",
  "themes.role.success": "Success",
  "themes.role.warning": "Warning",
  "themes.role.danger": "Danger",
  "themes.role.info": "Info",
  "themes.role.live": "Live",

  // Importing themes, in theme-import-dialog.tsx.
  "themes.import.title": "Import theme",
  "themes.import.description": "Matinee, alloy, or VS Code themes.",
  "themes.import.drop": "Drop .json files here",
  "themes.import.choose": "Choose files",
  "themes.import.paste": "Or paste JSON",
  "themes.import.submit": "Import",
  "themes.import.added": plural({
    one: "Added {count} theme",
    other: "Added {count} themes",
  }),
  // A theme that couldn't be saved: its name, then the reason.
  "themes.import.saveFailed": "{name}: {reason}",
})
