import { Button } from "@matinee/ui/components/button"
import { FeedbackButton } from "@matinee/ui/components/feedback-button"
import { cn } from "@matinee/ui/lib/utils"
import { useBlocker } from "@tanstack/react-router"
import { type ReactNode, useId, useState } from "react"
import { createPortal } from "react-dom"

import { tr } from "@/i18n"
import {
  type ActionFeedback,
  useActionFeedback,
} from "@/lib/use-action-feedback"
import { useSettingsDialogStore } from "@/stores/settings-dialog"

/** Stacks the subsections of a panel, separated by whitespace alone. */
export function SettingsSections({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={cn("flex flex-col gap-8", className)}>{children}</div>
}

/** The icon tile at the start of a settings row. */
export function RowIcon({ children }: { children: ReactNode }) {
  return (
    <span className="bg-secondary text-muted-foreground grid size-9 shrink-0 place-items-center rounded-lg [&_svg]:size-4">
      {children}
    </span>
  )
}

/**
 * A titled block in a settings panel: its name, and no more, as the apps'
 * settings read. `id` must be unique within the panel.
 */
export function SettingsSubsection({
  id,
  title,
  action,
  children,
}: {
  id: string
  title: string
  /** A button for the section, such as the one that adds to its list. */
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section
      id={`settings-${id}`}
      aria-labelledby={`settings-${id}-title`}
      className="flex scroll-mt-6 flex-col gap-3 md:scroll-mt-8"
    >
      {/* Narrow panels put the action under the copy at full width, so its
          label never fights the text for room. */}
      <div className="@container">
        <div className="flex flex-col gap-3 @lg:flex-row @lg:items-center @lg:justify-between @lg:gap-6">
          <h3
            id={`settings-${id}-title`}
            className="min-w-0 text-base font-semibold tracking-tight"
          >
            {title}
          </h3>
          {action ? (
            <div className="shrink-0 [&>*]:w-full @lg:[&>*]:w-auto">
              {action}
            </div>
          ) : null}
        </div>
      </div>
      {children}
    </section>
  )
}

/**
 * Anchored to the bottom edge of the panel while it has unsaved edits. Until
 * they're saved or reset it holds the panel open, and shakes when someone
 * tries to leave, since leaving would drop them.
 *
 * The bar reports the save itself: the button turns into "Saved" for a
 * moment before the bar goes, and a failure stays in the bar with the
 * server's reason until the next attempt or a reset.
 */
export function SettingsSaveBar({
  dirty,
  onReset,
  onSave,
}: {
  dirty: boolean
  onReset: () => void
  /** Saves the draft. Throw or reject to show the failure in the bar. */
  onSave: () => void | Promise<void>
}) {
  // The dialog's slot, on the panel's bottom edge outside the scrolling
  // content, so the bar stays anchored however short or long the panel is.
  const slot = useSettingsDialogStore((state) => state.saveBarSlot)
  // Bumped on each attempt to leave with unsaved edits.
  const [attention, setAttention] = useState(0)
  // Leaving unmounts the panel. Closing, another section, and browser back
  // are navigations this blocks; a reload gets the browser's prompt.
  useBlocker({
    disabled: !dirty,
    enableBeforeUnload: dirty,
    shouldBlockFn: () => {
      setAttention((n) => n + 1)
      return true
    },
  })
  const { feedback: result, reset, run } = useActionFeedback()
  // An edit after a save starts a new round, so "Saved" shouldn't linger:
  // the edit dismisses that save's result.
  const [dismissed, setDismissed] = useState<ActionFeedback | null>(null)
  if (dirty && result.state === "success" && dismissed !== result) {
    setDismissed(result)
  }
  const feedback: ActionFeedback =
    dismissed === result ? { state: "idle" } : result
  const saving = feedback.state === "pending"
  const save = () => {
    if (!saving) void run(onSave)
  }
  if (!dirty && feedback.state === "idle") {
    // Gone until the next edit, which starts calm: an earlier attempt to
    // leave shouldn't shake the bar, or ring it, as it comes back.
    if (attention !== 0) setAttention(0)
    return null
  }
  const bar = (
    <section
      // Remounts on each attempt to leave, which replays the shake.
      key={attention}
      aria-label={tr("common.saveBar.unsaved")}
      className={cn(
        "bg-popover animate-in fade-in-0 slide-in-from-bottom-2 flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 duration-200 motion-reduce:animate-none md:px-6 lg:px-10 max-md:pb-[max(0.75rem,env(safe-area-inset-bottom))]",
        attention > 0 && "settings-attention",
      )}
    >
      {feedback.state === "error" ? (
        <p role="alert" className="text-destructive min-w-0 flex-1 text-sm">
          <span className="font-medium">{tr("common.saveBar.failed")}</span>{" "}
          {feedback.message}
        </p>
      ) : (
        <p role="status" className="text-sm font-medium">
          {feedback.state === "success"
            ? tr("common.saveBar.saved")
            : tr("common.saveBar.unsaved")}
        </p>
      )}
      <div className="ml-auto flex gap-2">
        <Button
          type="button"
          variant="ghost"
          disabled={saving || !dirty}
          onClick={() => {
            reset()
            onReset()
          }}
        >
          {tr("common.saveBar.reset")}
        </Button>
        <FeedbackButton
          type="button"
          state={feedback.state}
          pendingLabel={tr("common.saveBar.saving")}
          successLabel={tr("common.saveBar.done")}
          errorLabel={tr("common.saveBar.retry")}
          disabled={!dirty && feedback.state !== "success"}
          onClick={(event) => {
            event.preventDefault()
            save()
          }}
        >
          {tr("common.saveBar.save")}
        </FeedbackButton>
      </div>
    </section>
  )
  if (!slot) return bar
  return (
    <>
      {createPortal(bar, slot)}
      {/* The visible bar is outside the panel's form, so this stand-in
          makes Enter in one of its fields save. */}
      <button
        type="submit"
        tabIndex={-1}
        aria-hidden
        className="sr-only"
        disabled={saving || !dirty}
        onClick={(event) => {
          event.preventDefault()
          save()
        }}
      />
    </>
  )
}

/**
 * A short line of what the server found or will do, such as the ffmpeg
 * it detected or what a save changes: status, not an explanation of how a
 * setting works, which the settings leave out.
 */
export function SettingNote({ children }: { children: ReactNode }) {
  return (
    <p className="text-muted-foreground text-[13px] leading-5">{children}</p>
  )
}

/** A bordered stack of {@link SettingRow}s split by hairlines. */
export function SettingRows({ children }: { children: ReactNode }) {
  return (
    <div className="bg-foreground/[0.02] divide-y rounded-xl border">
      {children}
    </div>
  )
}

/**
 * A setting: its name, then the control, without a line explaining it, as
 * the apps' settings read.
 * - `inline`: control on the right, for switches.
 * - `split`: control on the right once there's room, below it on phones.
 * - `stack`: control below at full width, for long values like URLs.
 *
 * The control gets the ids to name itself by through `children` as a
 * function, so a switch or input is labelled and described by the row.
 */
export function SettingRow({
  title,
  layout = "inline",
  footer,
  children,
}: {
  title: string
  layout?: "inline" | "split" | "stack"
  /** Content under the row that belongs to it, such as a warning. */
  footer?: ReactNode
  children: (ids: { controlId: string; labelId: string }) => ReactNode
}) {
  const id = useId()
  const ids = {
    controlId: `${id}-control`,
    labelId: `${id}-label`,
  }
  return (
    <div className="@container flex flex-col gap-2.5 px-4 py-2.5">
      <div
        className={cn(
          "flex gap-x-6 gap-y-2.5",
          layout === "inline" && "items-center justify-between",
          layout === "split" &&
            "flex-col @lg:flex-row @lg:items-center @lg:justify-between",
          layout === "stack" && "flex-col",
        )}
      >
        <div className="min-w-0 flex-1">
          <label
            id={ids.labelId}
            htmlFor={ids.controlId}
            className="text-sm font-medium"
          >
            {title}
          </label>
        </div>
        <div
          className={cn(
            "flex shrink-0 items-center gap-2",
            layout === "split" && "@lg:w-72",
          )}
        >
          {children(ids)}
        </div>
      </div>
      {footer}
    </div>
  )
}
