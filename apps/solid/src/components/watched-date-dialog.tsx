import { Dialog, DialogContent } from "@/kit/dialog"

import { WatchedDateForm } from "./watched-date-form"

/** Asks when the user watched, for "Other date" in the watched menus. */
export function WatchedDateDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (watchedAt: Date) => void
}) {
  let trigger: HTMLButtonElement | undefined
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        showCloseButton={false}
        initialFocus={() => trigger}
        class="gap-5 p-6 sm:max-w-sm"
      >
        {/* The dialog unmounts its content when closed, so each opening
            starts again from today. */}
        <WatchedDateForm
          triggerRef={(element) => (trigger = element)}
          onPick={(watchedAt) => {
            props.onPick(watchedAt)
            props.onOpenChange(false)
          }}
        />
      </DialogContent>
    </Dialog>
  )
}
