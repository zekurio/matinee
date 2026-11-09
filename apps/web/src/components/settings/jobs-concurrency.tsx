import {
  type ConcurrencyInput,
  JOB_QUEUE_IDS,
  type JobQueueId,
  type JobQueueStatus,
  type JobsOverview,
} from "@matinee/contracts"
import { Button } from "@matinee/ui/components/button"
import { Input } from "@matinee/ui/components/input"
import { useSelector } from "@tanstack/react-form"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { MinusIcon, PlusIcon } from "lucide-react"
import { useState } from "react"

import { tr } from "@/i18n"
import { useAppForm, useFieldContext } from "@/lib/form"
import { client, orpc } from "@/lib/rpc"

import { queueName } from "./queue-details-dialog"
import {
  SettingRow,
  SettingRows,
  SettingsSaveBar,
  SettingsSubsection,
} from "./settings-panel"

type Draft = Partial<Record<JobQueueId, number>>

function draftFrom(queues: readonly JobQueueStatus[]): Draft {
  return Object.fromEntries(
    queues.map((queue) => [queue.id, queue.concurrency]),
  )
}

function sameDraft(a: Draft, b: Draft): boolean {
  return JOB_QUEUE_IDS.every((id) => a[id] === b[id])
}

/** The queues whose concurrency an admin may change. */
export function tunableQueues(overview: JobsOverview): JobQueueStatus[] {
  return overview.queues.filter((queue) => queue.concurrencyNote !== null)
}

/**
 * How many jobs each queue runs at once, saved with the save bar like the
 * rest of Settings.
 */
export function ConcurrencySection({
  queues,
}: {
  queues: readonly JobQueueStatus[]
}) {
  const queryClient = useQueryClient()
  const initial = draftFrom(queues)
  const save = useMutation({
    mutationFn: (input: ConcurrencyInput) =>
      client.admin.jobs.updateConcurrency(input),
  })
  // Until the first edit, the form follows the saved numbers, so a refetch
  // shows through.
  const form = useAppForm({
    defaultValues: initial,
    onSubmit: async ({ value, formApi }) => {
      const next = await save.mutateAsync({ concurrency: value })
      queryClient.setQueryData(orpc.admin.jobs.get.queryKey(), next)
      formApi.reset(draftFrom(tunableQueues(next)))
    },
  })
  const dirty = useSelector(
    form.store,
    (state) => state.isTouched && !sameDraft(state.values, initial),
  )

  return (
    <form className="contents" onSubmit={(event) => event.preventDefault()}>
      <SettingsSubsection id="concurrency" title={tr("jobs.concurrency")}>
        <SettingRows>
          {queues.map((queue) => (
            <form.AppField key={queue.id} name={queue.id}>
              {() => <StepperField queue={queue} />}
            </form.AppField>
          ))}
        </SettingRows>
      </SettingsSubsection>
      <SettingsSaveBar
        dirty={dirty}
        onReset={() => form.reset()}
        onSave={() => form.handleSubmit()}
      />
    </form>
  )
}

/**
 * A whole number between 1 and the queue's maximum, typed or stepped. A
 * typed number counts once it's in range; leaving the field puts back the
 * last one that was.
 */
function StepperField({ queue }: { queue: JobQueueStatus }) {
  const field = useFieldContext<number | undefined>()
  const value =
    useSelector(field.store, (state) => state.value) ?? queue.concurrency
  // What's typed, while it differs from the field's number.
  const [typed, setTyped] = useState<string | null>(null)
  const max = queue.maxConcurrency
  const inRange = (n: number) => Number.isInteger(n) && n >= 1 && n <= max
  const typedValid = typed === null || inRange(Number(typed))
  const set = (n: number) => {
    setTyped(null)
    field.handleChange(Math.max(1, Math.min(max, n)))
  }
  const name = queueName(queue)

  return (
    <SettingRow title={name} layout="split">
      {(ids) => (
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label={tr("jobs.concurrency.decrease", { queue: name })}
            disabled={value <= 1}
            onClick={() => set(value - 1)}
          >
            <MinusIcon />
          </Button>
          <Input
            id={ids.controlId}
            aria-invalid={typedValid ? undefined : true}
            inputMode="numeric"
            className="w-14 text-center tabular-nums"
            value={typed ?? String(value)}
            onChange={(event) => {
              const text = event.target.value.replace(/\D/g, "")
              const n = Number(text)
              if (text !== "" && inRange(n)) set(n)
              else setTyped(text)
            }}
            onBlur={() => setTyped(null)}
            onKeyDown={(event) => {
              if (event.key === "ArrowUp" && value < max) {
                event.preventDefault()
                set(value + 1)
              } else if (event.key === "ArrowDown" && value > 1) {
                event.preventDefault()
                set(value - 1)
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label={tr("jobs.concurrency.increase", { queue: name })}
            disabled={value >= max}
            onClick={() => set(value + 1)}
          >
            <PlusIcon />
          </Button>
          <span className="sr-only" aria-live="polite">
            {tr("jobs.concurrency.atOnce", { count: value })}
          </span>
        </div>
      )}
    </SettingRow>
  )
}
