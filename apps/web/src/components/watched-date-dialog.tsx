import { Dialog, DialogContent } from "@matinee/ui/components/dialog"
import { Spinner } from "@matinee/ui/components/spinner"
import { lazy, Suspense, useRef } from "react"

// The calendar and the form library are heavy and rarely needed.
const WatchedDateForm = lazy(() =>
  import("./watched-date-form").then((module) => ({
    default: module.WatchedDateForm,
  })),
)

/** Asks when the user watched, for "Other date" in `WatchedButton`. */
export function WatchedDateDialog({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (watchedAt: Date) => void
}) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        initialFocus={triggerRef}
        className="gap-5 p-6 sm:max-w-sm"
      >
        {/* The dialog unmounts its content when closed, so each opening
            starts again from today. */}
        <Suspense
          fallback={<Spinner className="mx-auto my-16 size-6 opacity-60" />}
        >
          <WatchedDateForm
            triggerRef={triggerRef}
            onPick={(watchedAt) => {
              onPick(watchedAt)
              onOpenChange(false)
            }}
          />
        </Suspense>
      </DialogContent>
    </Dialog>
  )
}
