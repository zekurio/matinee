import { Button } from "@matinee/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@matinee/ui/components/dialog"
import { toast } from "@matinee/ui/components/sonner"
import { Textarea } from "@matinee/ui/components/textarea"
import { getThemeState, selectThemeFamily } from "@matinee/ui/lib/theme"
import {
  importThemeSources,
  newCustomThemeId,
  uniqueThemeName,
  type ThemeSource,
} from "@matinee/ui/lib/theme-custom"
import { cn } from "@matinee/ui/lib/utils"
import { useSelector } from "@tanstack/react-form"
import { useMutation } from "@tanstack/react-query"
import { CircleAlertIcon, FileUpIcon } from "lucide-react"
import { type DragEvent, useRef, useState } from "react"

import { useAppForm } from "@/lib/form"
import { errorMessage } from "@/lib/rpc"
import { saveAccountTheme } from "@/lib/theme-sync"

const THEME_JSON_PLACEHOLDER = `{
  "version": 2,
  "name": "Aurora",
  "variants": [
    { "appearance": "dark",
      "colors": { "background": "#10131a", "accent": "#7dd3fc" } }
  ]
}`

interface ImportResult {
  added: string[]
  errors: string[]
}

/**
 * Adds themes from Matinee or alloy theme files and VS Code color themes,
 * picked as files or pasted as JSON. Files are added as soon as they're
 * picked; pasted JSON waits for the button. Ported from alloy.
 */
export function ThemeImportDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-5 p-6 sm:max-w-xl">
        {/* Mounted only while open, so each opening starts empty. */}
        {open && <ThemeImportForm onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

async function importSources(
  sources: readonly ThemeSource[],
): Promise<ImportResult> {
  const result = importThemeSources(sources)
  const errors = [...result.errors]
  const names = getThemeState().customThemes.map((theme) => theme.name)
  const added: string[] = []
  for (const draft of result.themes) {
    const name = uniqueThemeName(draft.name, names)
    try {
      const saved = await saveAccountTheme({
        ...draft,
        id: newCustomThemeId(),
        name,
        guided: false,
      })
      names.push(saved.name)
      added.push(saved.id)
    } catch (cause) {
      // The rest would most likely fail the same way, at the theme limit or
      // while offline.
      errors.push(`${name}: ${errorMessage(cause)}`)
      break
    }
  }
  return { added, errors }
}

function ThemeImportForm({ onDone }: { onDone: () => void }) {
  const [dragging, setDragging] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const importer = useMutation({
    mutationFn: importSources,
    onSuccess: ({ added, errors }) => {
      const [first] = added
      if (!first) return
      selectThemeFamily(first)
      toast.success(
        added.length === 1 ? "Added theme" : `Added ${added.length} themes`,
      )
      if (errors.length === 0) onDone()
    },
  })
  const form = useAppForm({
    defaultValues: { text: "" },
    onSubmit: async ({ value, formApi }) => {
      // Failures come back in the result and show below the field.
      const { added } = await importer.mutateAsync([
        { text: value.text, name: null },
      ])
      if (added.length > 0) formApi.reset()
    },
  })
  const blank = useSelector(form.store, (state) => !state.values.text.trim())
  const adding = importer.isPending
  const errors = importer.data?.errors ?? []

  const addFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const sources = await Promise.all(
      Array.from(files, async (file) => ({
        text: await file.text(),
        name: file.name,
      })),
    )
    importer.mutate(sources)
  }

  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragging(false)
    void addFiles(event.dataTransfer.files)
  }

  return (
    <form
      className="flex min-w-0 flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault()
        if (!blank && !adding) void form.handleSubmit()
      }}
    >
      <DialogHeader>
        <DialogTitle className="text-lg leading-7 font-semibold">
          Import theme
        </DialogTitle>
        <DialogDescription>
          Matinee, alloy, or VS Code themes.
        </DialogDescription>
      </DialogHeader>

      <div
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={drop}
        className={cn(
          "flex items-center gap-3 rounded-lg border border-dashed p-3 transition-colors",
          dragging ? "border-accent bg-accent-soft" : "border-input",
        )}
      >
        <p className="text-muted-foreground min-w-0 flex-1 text-sm">
          Drop .json files here
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={adding}
          onClick={() => fileInput.current?.click()}
        >
          <FileUpIcon />
          Choose files
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept=".json,.jsonc,application/json"
          multiple
          hidden
          onChange={(event) => {
            void addFiles(event.target.files)
            event.target.value = ""
          }}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="theme-import-json" className="text-sm font-medium">
          Or paste JSON
        </label>
        <form.Field name="text">
          {(field) => (
            <Textarea
              id="theme-import-json"
              name={field.name}
              value={field.state.value}
              spellCheck={false}
              placeholder={THEME_JSON_PLACEHOLDER}
              className="max-h-72 min-h-40 font-mono text-xs md:text-xs"
              onChange={(event) => field.handleChange(event.target.value)}
              onBlur={field.handleBlur}
            />
          )}
        </form.Field>
      </div>

      {errors.length > 0 && (
        <ul
          role="alert"
          className="text-destructive flex flex-col gap-1 text-sm"
        >
          {errors.map((error) => (
            <li key={error} className="flex items-start gap-2">
              <CircleAlertIcon className="mt-0.5 size-4 shrink-0" />
              <span className="min-w-0 break-words">{error}</span>
            </li>
          ))}
        </ul>
      )}

      <DialogFooter className="-mx-6 -mb-6 px-6 py-4">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <form.AppForm>
          <form.SubmitButton pending={adding} disabled={blank}>
            Import
          </form.SubmitButton>
        </form.AppForm>
      </DialogFooter>
    </form>
  )
}
