import type { JobQueueStatus } from "@matinee/contracts"
import type { JSX } from "@solidjs/web"
import { CircleAlert } from "lucide"
import { For, Show } from "solid-js"

import { knownMessage, tr, translateKnown } from "@/i18n"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/kit/dialog"
import { Icon } from "@/kit/icon"
import { List, ListItem } from "@/kit/list"
import { Spinner } from "@/kit/spinner"
import { formatRelative, formatSpan } from "@/lib/format"

/** A queue's name in the interface's language. */
export function queueName(queue: JobQueueStatus): string {
  return tr(`jobs.queue.${queue.id}.name`)
}

/** What a queue does, in the interface's language. */
export function queueDescription(queue: JobQueueStatus): string {
  return tr(`jobs.queue.${queue.id}.description`)
}

/**
 * What a queue works on and what failed lately, as Jellyfin shows a log
 * entry's details: the row stays a line long, and the paths and errors,
 * which run long, open here.
 */
export function QueueDetailsDialog(props: {
  queue: JobQueueStatus
  summary: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={props.open} onOpenChange={(open) => props.onOpenChange(open)}>
      <DialogContent class="max-h-[calc(100dvh-4rem)] grid-rows-[auto_minmax(0,1fr)] gap-5 p-6 sm:max-w-xl">
        <DialogHeader class="pr-8">
          <DialogTitle class="text-lg leading-7 font-semibold">
            {queueName(props.queue)}
          </DialogTitle>
          <DialogDescription class="tabular-nums">
            {props.summary}
          </DialogDescription>
        </DialogHeader>
        <div class="-mx-6 flex min-h-0 flex-col gap-6 overflow-y-auto px-6">
          <Section title={tr("jobs.details.running")}>
            <Show
              when={props.queue.running.length > 0}
              fallback={
                <Empty>
                  {props.queue.paused
                    ? tr("jobs.details.pausedNothingRunning")
                    : tr("jobs.details.nothingRunning")}
                </Empty>
              }
            >
              <List>
                {/* The stream sends new rows each time; keep them in place. */}
                <For each={props.queue.running} keyed={false}>
                  {(job) => (
                    <ListItem class="items-start">
                      <Spinner class="text-muted-foreground mt-0.5 size-4 shrink-0" />
                      <Job
                        label={job().label}
                        meta={tr("jobs.details.runningFor", {
                          span: formatSpan(
                            (Date.now() - job().startedAt.getTime()) / 1000,
                          ),
                        })}
                      />
                    </ListItem>
                  )}
                </For>
              </List>
            </Show>
          </Section>
          <Section
            title={tr("jobs.details.failures")}
            description={failureNote(props.queue.retryAfterSeconds)}
          >
            <Show
              when={props.queue.failures.length > 0}
              fallback={<Empty>{tr("jobs.details.noFailures")}</Empty>}
            >
              <List>
                <For each={props.queue.failures} keyed={false}>
                  {(failure) => (
                    <ListItem class="items-start">
                      <Icon
                        icon={CircleAlert}
                        class="text-destructive mt-0.5 size-4 shrink-0"
                      />
                      <Job
                        label={translateKnown(failure().label)}
                        meta={formatRelative(failure().at)}
                        detail={
                          knownMessage(failure().message) ??
                          tr("jobs.task.failedUnknown")
                        }
                        title={failure().message}
                      />
                    </ListItem>
                  )}
                </For>
              </List>
            </Show>
          </Section>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function failureNote(retryAfterSeconds: number | null): string {
  if (retryAfterSeconds === null) return tr("jobs.details.retryOnRestart")
  return retryAfterSeconds > 0
    ? tr("jobs.details.retryAfter", { span: formatSpan(retryAfterSeconds) })
    : tr("jobs.details.kept")
}

function Section(props: {
  title: string
  description?: string
  children: JSX.Element
}) {
  return (
    <section class="flex flex-col gap-2">
      <div>
        <h3 class="text-sm leading-5 font-medium">{props.title}</h3>
        <Show when={props.description}>
          <p class="text-muted-foreground text-13px leading-5">
            {props.description}
          </p>
        </Show>
      </div>
      {props.children}
    </section>
  )
}

function Empty(props: { children: JSX.Element }) {
  return (
    <p class="text-muted-foreground text-13px rounded-xl border border-dashed px-4 py-3 leading-5">
      {props.children}
    </p>
  )
}

/** A job's label, which is often a long path, with a line or two under it. */
function Job(props: {
  label: string
  meta: string
  detail?: string
  /** The whole detail, for an admin to see what the server said. */
  title?: string
}) {
  return (
    <div class="flex min-w-0 flex-1 flex-col gap-0.5">
      <p class="text-13px leading-5 font-medium wrap-anywhere">{props.label}</p>
      <Show when={props.detail}>
        <p
          title={props.title}
          class="text-muted-foreground text-13px leading-5 wrap-anywhere whitespace-pre-line"
        >
          {props.detail}
        </p>
      </Show>
      <p class="text-muted-foreground text-xs leading-4 tabular-nums">
        {props.meta}
      </p>
    </div>
  )
}
