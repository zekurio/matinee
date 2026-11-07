import { Button } from "@matinee/ui/components/button"
import { setThemeSync, type ThemeState } from "@matinee/ui/lib/theme"
import type { CustomTheme } from "@matinee/ui/lib/theme-custom"
import { FileUpIcon, PlusIcon } from "lucide-react"
import { useCallback, useState } from "react"
import { createPortal } from "react-dom"

import { useThemeState } from "@/lib/theme-state"
import type { ThemeEditorOpening } from "@/stores/theme-editor"

import { ColorSchemePicker } from "./color-scheme-picker"
import { SwitchRow } from "./setting-controls"
import {
  SettingRows,
  SettingsSections,
  SettingsSubsection,
} from "./settings-panel"
import { ThemeCard } from "./theme-card"
import { DeleteThemeDialog, RenameThemeDialog } from "./theme-dialogs"
import { ThemeEditor, type ThemeEditorSeed } from "./theme-editor"
import { ThemeImportDialog } from "./theme-import-dialog"
import { createSeed, duplicateSeed, editSeed } from "./theme-seeds"

/**
 * The color scheme, then every bundled and custom theme as a card whose
 * swatches pick light and dark separately. Ported from alloy.
 */
export function AppearancePanel() {
  const theme = useThemeState()
  return (
    <SettingsSections>
      <ColorSchemeSection theme={theme} />
      <ThemesSection theme={theme} />
    </SettingsSections>
  )
}

function ColorSchemeSection({ theme }: { theme: ThemeState }) {
  return (
    <SettingsSubsection id="color-scheme" title="Color scheme">
      <ColorSchemePicker theme={theme} />
      <SettingRows>
        <SwitchRow
          title="Sync across devices"
          description="Use the same scheme and themes wherever you sign in."
          checked={theme.preferences.sync}
          onChange={(checked) => setThemeSync(checked)}
        />
      </SettingRows>
    </SettingsSubsection>
  )
}

/** One modal at a time: importing, or renaming or deleting a theme. */
type ThemeDialog =
  | { kind: "import" }
  | { kind: "rename" | "delete"; theme: CustomTheme }

function ThemesSection({ theme }: { theme: ThemeState }) {
  // The editor lives in the settings dialog's DOM: anything outside it
  // counts as a press outside and would close the dialog.
  const [container, setContainer] = useState<Element | null>(null)
  const attachEditor = useCallback(
    (element: HTMLElement | null) =>
      setContainer(element?.closest("[data-slot=dialog-content]") ?? null),
    [],
  )
  // The editor floats beside the dialogs, so it keeps its own state.
  const [editor, setEditor] = useState<ThemeEditorSeed | null>(null)
  const [dialog, setDialog] = useState<ThemeDialog | null>(null)
  const dialogTheme = (kind: "rename" | "delete") =>
    dialog?.kind === kind ? dialog.theme : null
  const closeDialog = () => setDialog(null)

  // A new session remounts an open editor, so it starts from this opening.
  const openEditor = (opening: ThemeEditorOpening) =>
    setEditor((current) => ({
      ...opening,
      session: (current?.session ?? 0) + 1,
    }))

  return (
    <SettingsSubsection
      id="themes"
      title="Themes"
      description="Pick a theme for both modes, or a swatch for one."
      action={
        <div
          ref={attachEditor}
          className="flex gap-2 [&>*]:flex-1 @lg:[&>*]:flex-none"
        >
          <Button
            type="button"
            variant="outline"
            onClick={() => setDialog({ kind: "import" })}
          >
            <FileUpIcon />
            Import
          </Button>
          <Button type="button" onClick={() => openEditor(createSeed(theme))}>
            <PlusIcon />
            New theme
          </Button>
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {theme.themes.map((family) => {
          const custom = family.custom
            ? theme.customThemes.find((entry) => entry.id === family.id)
            : undefined
          return (
            <ThemeCard
              key={family.id}
              family={family}
              theme={theme}
              custom={custom ?? null}
              onDuplicate={() => openEditor(duplicateSeed(theme, family))}
              onEdit={(entry) => openEditor(editSeed(theme, family, entry))}
              onRename={(entry) => setDialog({ kind: "rename", theme: entry })}
              onDelete={(entry) => setDialog({ kind: "delete", theme: entry })}
            />
          )
        })}
      </div>

      {editor &&
        container &&
        createPortal(
          <ThemeEditor
            key={editor.session}
            seed={editor}
            onClose={() => setEditor(null)}
          />,
          container,
        )}
      <ThemeImportDialog
        open={dialog?.kind === "import"}
        onOpenChange={(open) => setDialog(open ? { kind: "import" } : null)}
      />
      <RenameThemeDialog theme={dialogTheme("rename")} onClose={closeDialog} />
      <DeleteThemeDialog theme={dialogTheme("delete")} onClose={closeDialog} />
    </SettingsSubsection>
  )
}
