import { Button } from "@matinee/ui/components/button"
import { FeedbackButton } from "@matinee/ui/components/feedback-button"
import {
  endThemePreview,
  previewTheme,
  selectThemeFamily,
} from "@matinee/ui/lib/theme"
import type { ThemeColorRole } from "@matinee/ui/lib/theme-colors"
import type { CustomThemeVariant } from "@matinee/ui/lib/theme-custom"
import { cn } from "@matinee/ui/lib/utils"
import { useMutation } from "@tanstack/react-query"
import {
  ChevronDownIcon,
  ChevronUpIcon,
  CrosshairIcon,
  XIcon,
} from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useShallow } from "zustand/react/shallow"

import { tr } from "@/i18n"
import { saveAccountTheme } from "@/lib/theme-sync"
import {
  type ActionFeedback,
  useActionFeedback,
} from "@/lib/use-action-feedback"
import {
  createThemeEditorStore,
  selectedVariant,
  ThemeEditorContext,
  type ThemeEditorOpening,
  useThemeEditor,
  useThemeEditorActions,
} from "@/stores/theme-editor"

import { roleLabel } from "./theme-editor-draft"
import { ThemeColorFields, ThemeDetailsFields } from "./theme-editor-fields"
import { useThemeInspector } from "./theme-inspector"

export interface ThemeEditorSeed extends ThemeEditorOpening {
  /** Bumped per opening so the editor remounts with a fresh store. */
  session: number
}

/**
 * Floating theme editor, ported from alloy. Every change previews live in the
 * appearance of the variant being edited; nothing is stored until Save. The
 * guided mode asks for a background and an accent and derives the rest,
 * Advanced exposes every role, and Inspect picks a role by clicking whatever
 * it paints.
 *
 * The draft is a store rather than a form: it's a live preview of nested
 * palettes that regenerate as a whole, with one field (the name) to check.
 */
export function ThemeEditor({
  seed,
  onClose,
}: {
  seed: ThemeEditorSeed
  onClose: () => void
}) {
  const [store] = useState(() => createThemeEditorStore(seed))

  // Paints the page with the variant being edited until the editor closes.
  useEffect(() => {
    const show = (variant: CustomThemeVariant | undefined) => {
      if (variant) previewTheme(variant.appearance, variant.colors)
    }
    show(selectedVariant(store.getState()))
    const unsubscribe = store.subscribe((state, previous) => {
      const next = selectedVariant(state)
      const last = selectedVariant(previous)
      if (
        next?.colors !== last?.colors ||
        next?.appearance !== last?.appearance
      ) {
        show(next)
      }
    })
    return () => {
      unsubscribe()
      endThemePreview()
    }
  }, [store])

  return (
    <ThemeEditorContext value={store}>
      <EditorPanel onClose={onClose} />
    </ThemeEditorContext>
  )
}

function EditorPanel({ onClose }: { onClose: () => void }) {
  const actions = useThemeEditorActions()
  const { creating, collapsed, picking } = useThemeEditor(
    useShallow((state) => ({
      creating: state.creating,
      collapsed: state.view.collapsed,
      picking: state.view.inspect === "picking",
    })),
  )
  const { feedback: saveFeedback, run: runSave } = useActionFeedback()
  const saveTheme = useMutation({ mutationFn: saveAccountTheme })
  const nameRef = useRef<HTMLInputElement>(null)
  const fieldRefs = useRef(new Map<ThemeColorRole, HTMLDivElement>())

  const hovered = useThemeInspector(
    picking,
    (role) => {
      actions.pickRole(role)
      if (!role) return
      requestAnimationFrame(() =>
        fieldRefs.current
          .get(role)
          ?.scrollIntoView({ block: "nearest", behavior: "smooth" }),
      )
    },
    actions.cancelInspect,
  )

  const save = async () => {
    const theme = actions.attemptSave()
    if (!theme) {
      nameRef.current?.focus()
      return
    }
    const saved = await runSave(async () => {
      const result = await saveTheme.mutateAsync(theme)
      if (creating) selectThemeFamily(result.id)
    })
    if (saved) onClose()
  }

  const title = creating ? tr("themes.editor.new") : tr("themes.editor.edit")

  return (
    <>
      <section
        data-theme-editor=""
        aria-label={title}
        onKeyDown={(event) => {
          // Escape would close settings under the editor and drop the edits.
          // Menus and pickers portal out of the section and close on their own.
          if (
            event.key === "Escape" &&
            event.target instanceof Node &&
            event.currentTarget.contains(event.target)
          ) {
            event.stopPropagation()
          }
        }}
        className={cn(
          "bg-popover text-popover-foreground absolute right-4 bottom-4 z-[60] flex w-[min(24rem,calc(100%-2rem))] flex-col overflow-hidden rounded-xl border shadow-2xl",
          "max-h-[min(42rem,calc(100%-2rem))] max-md:bottom-[max(1rem,env(safe-area-inset-bottom))]",
        )}
      >
        <EditorHeader title={title} onClose={onClose} />
        {!collapsed && (
          <>
            <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-3.5">
              <ThemeDetailsFields nameRef={nameRef} />
              <ThemeColorFields fieldRefs={fieldRefs} />
            </div>
            <EditorFooter
              creating={creating}
              feedback={saveFeedback}
              onCancel={onClose}
              onSave={() => void save()}
            />
          </>
        )}
      </section>
      {hovered && <InspectorOutline rect={hovered} />}
    </>
  )
}

function EditorHeader({
  title,
  onClose,
}: {
  title: string
  onClose: () => void
}) {
  const actions = useThemeEditorActions()
  const { inspect, pickedRole, collapsed } = useThemeEditor(
    useShallow((state) => ({
      inspect: state.view.inspect,
      pickedRole: state.view.pickedRole,
      collapsed: state.view.collapsed,
    })),
  )
  const status =
    inspect === "picking"
      ? tr("themes.editor.picking")
      : inspect === "miss"
        ? tr("themes.editor.miss")
        : pickedRole
          ? roleLabel(pickedRole)
          : null

  return (
    <header className="flex items-center gap-1 border-b py-2 pr-2 pl-3.5">
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-sm font-semibold">{title}</h2>
        {status && (
          <p
            className="text-muted-foreground truncate text-xs"
            aria-live="polite"
          >
            {status}
          </p>
        )}
      </div>
      <Button
        type="button"
        variant={inspect === "picking" ? "secondary" : "ghost"}
        size="sm"
        aria-pressed={inspect === "picking"}
        onClick={actions.toggleInspect}
      >
        <CrosshairIcon />
        {tr("themes.editor.inspect")}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={
          collapsed ? tr("themes.editor.expand") : tr("themes.editor.collapse")
        }
        aria-expanded={!collapsed}
        onClick={actions.toggleCollapsed}
      >
        {collapsed ? <ChevronUpIcon /> : <ChevronDownIcon />}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={tr("themes.editor.close")}
        onClick={onClose}
      >
        <XIcon />
      </Button>
    </header>
  )
}

function EditorFooter({
  creating,
  feedback,
  onCancel,
  onSave,
}: {
  creating: boolean
  feedback: ActionFeedback
  onCancel: () => void
  onSave: () => void
}) {
  return (
    <footer className="flex items-center justify-end gap-2 border-t px-3.5 py-2.5">
      {feedback.state === "error" && (
        <p
          role="alert"
          className="text-destructive mr-auto min-w-0 text-xs leading-snug"
        >
          {feedback.message}
        </p>
      )}
      <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
        {tr("themes.cancel")}
      </Button>
      <FeedbackButton
        type="button"
        size="sm"
        state={feedback.state}
        pendingLabel={
          creating ? tr("themes.editor.creating") : tr("themes.editor.saving")
        }
        successLabel={tr("themes.editor.saved")}
        errorLabel={tr("themes.editor.retry")}
        onClick={onSave}
      >
        {creating ? tr("themes.editor.create") : tr("themes.editor.save")}
      </FeedbackButton>
    </footer>
  )
}

/** Outlines what Inspect would pick under the pointer. */
function InspectorOutline({ rect }: { rect: DOMRect }) {
  return createPortal(
    <div
      aria-hidden
      className="outline-accent pointer-events-none fixed z-[100] rounded-sm outline-2 outline-offset-1"
      style={{
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      }}
    />,
    document.body,
  )
}
