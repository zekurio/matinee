import { cn } from "@matinee/ui/lib/utils"
import { type JSX, Portal } from "@solidjs/web"
import { useBlocker } from "@tanstack/solid-router"
import {
  createEffect,
  createMemo,
  createSignal,
  createUniqueId,
  Show,
} from "solid-js"

import { tr } from "@/i18n"
import { Button } from "@/kit/button"
import { FeedbackButton } from "@/kit/feedback-button"
import {
  type ActionFeedback,
  useActionFeedback,
} from "@/lib/use-action-feedback"
import { saveBarSlot } from "@/stores/settings-dialog"

/** Stacks the subsections of a panel, separated by whitespace alone. */
export function SettingsSections(props: {
  children: JSX.Element
  class?: string
}) {
  return (
    <div class={cn("flex flex-col gap-8", props.class)}>{props.children}</div>
  )
}

/** The icon tile at the start of a settings row. */
export function RowIcon(props: { children: JSX.Element }) {
  return (
    <span class="bg-secondary text-muted-foreground grid size-9 shrink-0 place-items-center rounded-lg [&_svg]:size-4">
      {props.children}
    </span>
  )
}

/**
 * A titled block in a settings panel: its name, and no more, as the apps'
 * settings read. `id` must be unique within the panel.
 */
export function SettingsSubsection(props: {
  id: string
  title: string
  /** A button for the section, such as the one that adds to its list. */
  action?: JSX.Element
  children: JSX.Element
}) {
  return (
    <section
      id={`settings-${props.id}`}
      aria-labelledby={`settings-${props.id}-title`}
      class="flex scroll-mt-6 flex-col gap-3 md:scroll-mt-8"
    >
      {/* Narrow panels put the action under the copy at full width, so its
          label never fights the text for room. */}
      <div class="@container">
        <div class="flex flex-col gap-3 @lg:flex-row @lg:items-center @lg:justify-between @lg:gap-6">
          <h3
            id={`settings-${props.id}-title`}
            class="min-w-0 text-base font-semibold tracking-tight"
          >
            {props.title}
          </h3>
          <Show when={props.action}>
            <div class="shrink-0 [&>*]:w-full @lg:[&>*]:w-auto">
              {props.action}
            </div>
          </Show>
        </div>
      </div>
      {props.children}
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
export function SettingsSaveBar(props: {
  dirty: boolean
  onReset: () => void
  /** Saves the draft. Throw or reject to show the failure in the bar. */
  onSave: () => void | Promise<void>
}) {
  // Bumped on each attempt to leave with unsaved edits.
  const [attention, setAttention] = createSignal(0)
  // Leaving unmounts the panel. Closing, another section, and browser back
  // are navigations this blocks; a reload gets the browser's prompt.
  useBlocker({
    get disabled() {
      return !props.dirty
    },
    enableBeforeUnload: () => props.dirty,
    shouldBlockFn: () => {
      setAttention((n) => n + 1)
      return true
    },
  })
  const action = useActionFeedback({ failed: tr("common.saveBar.failed") })
  // An edit after a save starts a new round, so "Saved" shouldn't linger:
  // the edit dismisses that save's result.
  const [dismissed, setDismissed] = createSignal<ActionFeedback | null>(null)
  createEffect(
    () => ({ dirty: props.dirty, result: action.feedback() }),
    ({ dirty, result }) => {
      if (dirty && result.state === "success") setDismissed(result)
    },
  )
  const feedback = (): ActionFeedback =>
    dismissed() === action.feedback() ? { state: "idle" } : action.feedback()
  const saving = () => feedback().state === "pending"
  const save = () => {
    if (!saving()) void action.run(props.onSave)
  }
  const shown = createMemo(() => props.dirty || feedback().state !== "idle")
  // Gone until the next edit, which starts calm: an earlier attempt to
  // leave shouldn't shake the bar, or ring it, as it comes back.
  createEffect(shown, (isShown) => {
    if (!isShown) setAttention(0)
  })

  const bar = () => (
    // Built again on each attempt to leave, which replays the shake.
    <Show when={attention() + 1} keyed>
      {(round) => (
        <section
          aria-label={tr("common.saveBar.unsaved")}
          class={cn(
            "bg-popover animate-in fade-in-0 slide-in-from-bottom-2 flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 duration-200 motion-reduce:animate-none md:px-6 lg:px-10 max-md:pb-[max(0.75rem,env(safe-area-inset-bottom))]",
            round > 1 && "settings-attention",
          )}
        >
          <p role="status" class="text-sm font-medium">
            {feedback().state === "success"
              ? tr("common.saveBar.saved")
              : tr("common.saveBar.unsaved")}
          </p>
          <div class="ml-auto flex gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={saving() || !props.dirty}
              onClick={() => {
                action.reset()
                props.onReset()
              }}
            >
              {tr("common.saveBar.reset")}
            </Button>
            <FeedbackButton
              type="button"
              state={feedback().state}
              pendingLabel={tr("common.saveBar.saving")}
              successLabel={tr("common.saveBar.done")}
              errorLabel={tr("common.saveBar.retry")}
              disabled={!props.dirty && feedback().state !== "success"}
              onClick={(event) => {
                event.preventDefault()
                save()
              }}
            >
              {tr("common.saveBar.save")}
            </FeedbackButton>
          </div>
        </section>
      )}
    </Show>
  )

  return (
    <Show when={shown()}>
      <Show when={saveBarSlot()} fallback={bar()}>
        {(slot) => (
          <>
            <Portal mount={slot()}>{bar()}</Portal>
            {/* The visible bar is outside the panel's form, so this stand-in
                makes Enter in one of its fields save. */}
            <button
              type="submit"
              tabindex={-1}
              aria-hidden="true"
              class="sr-only"
              disabled={saving() || !props.dirty}
              onClick={(event) => {
                event.preventDefault()
                save()
              }}
            />
          </>
        )}
      </Show>
    </Show>
  )
}

/**
 * A short line of what the server found or will do, such as the ffmpeg
 * it detected or what a save changes: status, not an explanation of how a
 * setting works, which the settings leave out.
 */
export function SettingNote(props: { children: JSX.Element }) {
  return (
    <p class="text-muted-foreground text-13px leading-5">{props.children}</p>
  )
}

/** A bordered stack of {@link SettingRow}s split by hairlines. */
export function SettingRows(props: { children: JSX.Element }) {
  return (
    <div class="bg-foreground/[0.02] divide-y rounded-xl border">
      {props.children}
    </div>
  )
}

export type SettingRowIds = {
  controlId: string
  labelId: string
  /** The hint's id, for the control's `aria-describedby`. */
  hintId: string | undefined
}

/**
 * A setting: its name, then the control. A settings panel's row has no
 * line explaining it, as the apps' settings read.
 * - `inline`: control on the right, for switches.
 * - `split`: control on the right once there's room, below it on phones.
 * - `side`: as `split`, for a narrow column such as a form dialog's: the
 *   control moves beside the name sooner, at a set width.
 * - `stack`: control below at full width, for long values like URLs.
 *
 * In a form dialog, a `hint` under the name says what the row covers,
 * beside the control. A `footer` goes under the whole row.
 *
 * The control gets the ids to name itself by through `children` as a
 * function, so a switch or input is labelled and described by the row.
 */
export function SettingRow(props: {
  title: string
  layout?: "inline" | "split" | "side" | "stack"
  /** A line under the name on what the setting does. */
  hint?: JSX.Element
  /** Content under the row that belongs to it, such as a warning. */
  footer?: JSX.Element
  children: (ids: SettingRowIds) => JSX.Element
}) {
  const id = createUniqueId()
  const layout = () => props.layout ?? "inline"
  const ids = (): SettingRowIds => ({
    controlId: `${id}-control`,
    labelId: `${id}-label`,
    hintId: props.hint ? `${id}-hint` : undefined,
  })
  return (
    <div class="@container flex flex-col gap-2.5 px-4 py-2.5">
      <div
        class={[
          "flex gap-x-6 gap-y-2.5",
          {
            "items-center justify-between": layout() === "inline",
            "flex-col @lg:flex-row @lg:items-center @lg:justify-between":
              layout() === "split",
            "flex-col @sm:flex-row @sm:items-center @sm:justify-between":
              layout() === "side",
            "flex-col": layout() === "stack",
          },
        ]}
      >
        <div class="min-w-0 flex-1">
          <label
            id={`${id}-label`}
            for={`${id}-control`}
            class="text-sm font-medium"
          >
            {props.title}
          </label>
          <Show when={props.hint}>
            <p
              id={`${id}-hint`}
              class="text-muted-foreground text-13px mt-0.5 leading-5"
            >
              {props.hint}
            </p>
          </Show>
        </div>
        <div
          class={[
            "flex shrink-0 items-center gap-2",
            {
              "@lg:w-72": layout() === "split",
              "@sm:w-52": layout() === "side",
            },
          ]}
        >
          {props.children(ids())}
        </div>
      </div>
      {props.footer}
    </div>
  )
}
