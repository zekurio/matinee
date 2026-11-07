import type { JobQueueStatus } from "@matinee/contracts"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@matinee/ui/components/dialog"
import { List, ListItem } from "@matinee/ui/components/list"
import { Spinner } from "@matinee/ui/components/spinner"
import { CircleAlertIcon } from "lucide-react"
import type { ReactNode } from "react"

import { tr, translateKnown } from "@/i18n"
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
export function QueueDetailsDialog({
  queue,
  summary,
  open,
  onOpenChange,
}: {
  queue: JobQueueStatus
  summary: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-4rem)] grid-rows-[auto_minmax(0,1fr)] gap-5 p-6 sm:max-w-xl">
        <DialogHeader className="pr-8">
          <DialogTitle className="text-lg leading-7 font-semibold">
            {queueName(queue)}
          </DialogTitle>
          <DialogDescription className="tabular-nums">
            {summary}
          </DialogDescription>
        </DialogHeader>
        <div className="-mx-6 flex min-h-0 flex-col gap-6 overflow-y-auto px-6">
          <Section title={tr("jobs.details.running")}>
            {queue.running.length === 0 ? (
              <Empty>
                {queue.paused
                  ? tr("jobs.details.pausedNothingRunning")
                  : tr("jobs.details.nothingRunning")}
              </Empty>
            ) : (
              <List>
                {queue.running.map((job, i) => (
                  <ListItem key={`${i}:${job.label}`} className="items-start">
                    <Spinner className="text-muted-foreground mt-0.5 size-4 shrink-0" />
                    <Job
                      label={job.label}
                      meta={tr("jobs.details.runningFor", {
                        span: formatSpan(
                          (Date.now() - job.startedAt.getTime()) / 1000,
                        ),
                      })}
                    />
                  </ListItem>
                ))}
              </List>
            )}
          </Section>
          <Section
            title={tr("jobs.details.failures")}
            description={failureNote(queue.retryAfterSeconds)}
          >
            {queue.failures.length === 0 ? (
              <Empty>{tr("jobs.details.noFailures")}</Empty>
            ) : (
              <List>
                {queue.failures.map((failure, i) => (
                  <ListItem
                    key={`${failure.at.getTime()}:${i}`}
                    className="items-start"
                  >
                    <CircleAlertIcon className="text-destructive mt-0.5 size-4 shrink-0" />
                    <Job
                      label={translateKnown(failure.label)}
                      meta={formatRelative(failure.at)}
                      detail={translateKnown(failure.message)}
                    />
                  </ListItem>
                ))}
              </List>
            )}
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

function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-2">
      <div>
        <h3 className="text-sm leading-5 font-medium">{title}</h3>
        {description && (
          <p className="text-muted-foreground text-[13px] leading-5">
            {description}
          </p>
        )}
      </div>
      {children}
    </section>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="text-muted-foreground rounded-xl border border-dashed px-4 py-3 text-[13px] leading-5">
      {children}
    </p>
  )
}

/** A job's label, which is often a long path, with a line or two under it. */
function Job({
  label,
  meta,
  detail,
}: {
  label: string
  meta: string
  detail?: string
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      <p className="text-[13px] leading-5 font-medium wrap-anywhere">{label}</p>
      {detail && (
        <p className="text-muted-foreground text-[13px] leading-5 wrap-anywhere whitespace-pre-line">
          {detail}
        </p>
      )}
      <p className="text-muted-foreground text-xs leading-4 tabular-nums">
        {meta}
      </p>
    </div>
  )
}
