import type { TitleSummary, WatchedAt } from "@matinee/contracts"
import { cn } from "@matinee/ui/lib/utils"
import { useMutation, useQueryClient } from "@tanstack/solid-query"
import { Calendar, CalendarClock, CalendarOff, Check, Clock } from "lucide"
import { createSignal, createUniqueId, Show } from "solid-js"

import { titleActionButton } from "@/components/favorite-button"
import { tr } from "@/i18n"
import { Button, buttonVariants } from "@/kit/button"
import { Dialog, DialogContent, DialogFooter, DialogTitle } from "@/kit/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/kit/dropdown-menu"
import { Icon } from "@/kit/icon"
import { Input } from "@/kit/input"
import { toast } from "@/kit/toast"
import { client, errorMessage } from "@/lib/rpc"
import { invalidateViewerState } from "@/lib/viewer-state"

export function useTitleWatched(
  title: () => Pick<TitleSummary, "id" | "watched">,
) {
  const queryClient = useQueryClient()
  const set = useMutation(() => ({
    mutationFn: (input: {
      titleId: string
      watched: boolean
      watchedAt?: WatchedAt
    }) => client.playback.setTitleWatched(input),
    onError: (error, { watched }) =>
      toast.error(
        tr(watched ? "media.markWatchedFailed" : "media.markUnwatchedFailed"),
        {
          description: errorMessage(error),
        },
      ),
    onSettled: () => invalidateViewerState(queryClient),
  }))
  const pending = () =>
    set.isPending && !set.failureCount ? set.variables?.watched : undefined
  return {
    pending,
    on: () => pending() ?? title().watched,
    mark: (watched: boolean, watchedAt?: WatchedAt) => {
      if (!set.isPending)
        set.mutate({ titleId: title().id, watched, watchedAt })
    },
  }
}

export function WatchedButton(props: {
  watched: ReturnType<typeof useTitleWatched>
}) {
  const [picking, setPicking] = createSignal(false)
  // The date dialog costs a popup's setup and parts on every page open while
  // closed; it is built when its menu first opens instead, before anyone can
  // pick a date, so it still opens with its transition.
  const [dialogReady, setDialogReady] = createSignal(false)
  return (
    <>
      <Show
        when={props.watched.on()}
        fallback={
          <DropdownMenu
            onOpenChange={(open) => {
              if (open) setDialogReady(true)
            }}
          >
            <DropdownMenuTrigger
              aria-pressed="false"
              aria-label={tr("media.markWatched")}
              title={tr("media.markWatched")}
              class={cn(
                buttonVariants({ variant: "secondary", size: "icon-lg" }),
                titleActionButton,
              )}
            >
              <Icon icon={Check} class="size-5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent sideOffset={6} class="min-w-44">
              <DropdownMenuItem onSelect={() => props.watched.mark(true)}>
                <Icon icon={Clock} />
                {tr("media.watchedAt.now")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => props.watched.mark(true, "released")}
              >
                <Icon icon={Calendar} />
                {tr("media.watchedAt.released")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setPicking(true)}>
                <Icon icon={CalendarClock} />
                {tr("media.watchedAt.other")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => props.watched.mark(true, "unknown")}
              >
                <Icon icon={CalendarOff} />
                {tr("media.watchedAt.unknown")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      >
        <Button
          variant="secondary"
          size="icon-lg"
          aria-pressed="true"
          aria-label={tr("media.markUnwatched")}
          title={tr("media.markUnwatched")}
          onClick={() => props.watched.mark(false)}
          class={cn(titleActionButton, "text-primary")}
        >
          <Icon icon={Check} class="size-5" stroke-width="3" />
        </Button>
      </Show>
      <Show when={dialogReady()}>
        <Dialog open={picking()} onOpenChange={setPicking}>
          <DialogContent showCloseButton={false} class="gap-5 p-6">
            <WatchedDateForm
              onPick={(date) => {
                setPicking(false)
                props.watched.mark(true, date)
              }}
            />
          </DialogContent>
        </Dialog>
      </Show>
    </>
  )
}

function WatchedDateForm(props: { onPick: (date: Date) => void }) {
  const id = createUniqueId()
  const today = new Date()
  const lastDay = new Date(today.getTime() - today.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10)
  let input: HTMLInputElement | undefined
  return (
    <form
      class="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault()
        const date = new Date(`${input?.value ?? ""}T12:00:00`)
        if (Number.isFinite(date.getTime()))
          props.onPick(date > today ? new Date() : date)
      }}
    >
      <DialogTitle class="text-lg font-semibold">
        {tr("media.watchedDate.title")}
      </DialogTitle>
      <label for={id} class="grid gap-2">
        {tr("media.watchedDate.date")}
        <Input
          ref={(element) => (input = element)}
          id={id}
          type="date"
          defaultValue={lastDay}
          max={lastDay}
          required
        />
      </label>
      <DialogFooter showCancelButton class="-mx-6 -mb-6 px-6">
        <Button type="submit">
          <Icon icon={Check} />
          {tr("media.markWatched")}
        </Button>
      </DialogFooter>
    </form>
  )
}
