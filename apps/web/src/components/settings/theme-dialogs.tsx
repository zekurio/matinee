import { THEME_NAME_MAX_LENGTH, UserThemeInput } from "@matinee/contracts"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@matinee/ui/components/alert-dialog"
import { Button } from "@matinee/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@matinee/ui/components/dialog"
import { Input } from "@matinee/ui/components/input"
import { toast } from "@matinee/ui/components/sonner"
import { Spinner } from "@matinee/ui/components/spinner"
import type { CustomTheme } from "@matinee/ui/lib/theme-custom"
import { useSelector } from "@tanstack/react-form"
import { useMutation } from "@tanstack/react-query"
import { type RefObject, useRef, useState } from "react"

import { tr } from "@/i18n"
import { useAppForm } from "@/lib/form"
import { errorMessage } from "@/lib/rpc"
import { deleteAccountTheme, saveAccountTheme } from "@/lib/theme-sync"

export function RenameThemeDialog({
  theme,
  onClose,
}: {
  theme: CustomTheme | null
  onClose: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const shown = useShownWhileClosing(theme)
  return (
    <Dialog open={theme !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent initialFocus={inputRef} className="gap-5 p-6 sm:max-w-sm">
        {shown && (
          <RenameThemeForm
            key={shown.session}
            theme={shown.value}
            inputRef={inputRef}
            onDone={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

/** A theme's name as the account stores it. */
const ThemeName = UserThemeInput.pick({ name: true })

function RenameThemeForm({
  theme,
  inputRef,
  onDone,
}: {
  theme: CustomTheme
  inputRef: RefObject<HTMLInputElement | null>
  onDone: () => void
}) {
  const rename = useMutation({
    mutationFn: (name: string) => saveAccountTheme({ ...theme, name }),
  })
  const form = useAppForm({
    defaultValues: { name: theme.name },
    validators: { onChange: ThemeName },
    onSubmit: async ({ value }) => {
      const name = value.name.trim()
      if (name === theme.name) {
        onDone()
        return
      }
      try {
        await rename.mutateAsync(name)
        onDone()
      } catch (cause) {
        toast.error(tr("themes.rename.failed"), {
          description: errorMessage(cause),
        })
      }
    },
  })
  // A blank name can't be saved; the button says so by staying disabled.
  const canSubmit = useSelector(form.store, (state) => state.canSubmit)

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault()
        if (!form.state.isSubmitting) void form.handleSubmit()
      }}
    >
      <DialogHeader>
        <DialogTitle className="text-lg leading-7 font-semibold">
          {tr("themes.rename.title")}
        </DialogTitle>
      </DialogHeader>
      <form.Field name="name">
        {(field) => (
          <Input
            aria-label={tr("themes.rename.name")}
            name={field.name}
            value={field.state.value}
            maxLength={THEME_NAME_MAX_LENGTH}
            autoComplete="off"
            ref={inputRef}
            onChange={(event) => field.handleChange(event.target.value)}
            onBlur={field.handleBlur}
          />
        )}
      </form.Field>
      <DialogFooter className="-mx-6 -mb-6 px-6 py-4">
        <Button type="button" variant="ghost" onClick={onDone}>
          {tr("themes.cancel")}
        </Button>
        <form.AppForm>
          <form.SubmitButton disabled={!canSubmit}>
            {tr("themes.rename.submit")}
          </form.SubmitButton>
        </form.AppForm>
      </DialogFooter>
    </form>
  )
}

export function DeleteThemeDialog({
  theme,
  onClose,
}: {
  theme: CustomTheme | null
  onClose: () => void
}) {
  const shown = useShownWhileClosing(theme)?.value
  const remove = useMutation({
    mutationFn: deleteAccountTheme,
    onSuccess: onClose,
    onError: (error) =>
      toast.error(tr("themes.delete.failed"), {
        description: errorMessage(error),
      }),
  })

  return (
    <AlertDialog
      open={theme !== null}
      onOpenChange={(open) => !open && !remove.isPending && onClose()}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {shown
              ? tr("themes.delete.title", { theme: shown.name })
              : tr("themes.delete.titleUnnamed")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {tr("themes.delete.description")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={remove.isPending}>
            {tr("themes.cancel")}
          </AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={remove.isPending}
            onClick={() => theme && remove.mutate(theme.id)}
          >
            {remove.isPending && <Spinner />}
            {tr("themes.delete.submit")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

interface ShownValue<T> {
  value: T
  /** Moves on with each opening, to key what should start fresh. */
  session: number
}

/**
 * What a dialog opened for, kept while it animates closed so its content
 * doesn't blank out on the way.
 */
function useShownWhileClosing<T>(value: T | null): ShownValue<T> | null {
  const [shown, setShown] = useState<ShownValue<T> | null>(null)
  const [open, setOpen] = useState(false)
  if ((value !== null) !== open) {
    setOpen(value !== null)
    if (value !== null) {
      setShown({ value, session: (shown?.session ?? 0) + 1 })
    }
  }
  return shown
}
