import {
  type ConcurrencyInput,
  type JobQueueId,
  type JobQueueStatus,
  type JobsOverview,
} from "@matinee/contracts"
import { useMutation, useQueryClient } from "@tanstack/solid-query"
import { Minus, Plus } from "lucide"
import { createSignal, For } from "solid-js"

import { tr, translateKnown } from "@/i18n"
import { Button } from "@/kit/button"
import { Icon } from "@/kit/icon"
import { Input } from "@/kit/input"
import type { Form } from "@/lib/form"
import { client, orpc } from "@/lib/rpc"

import { queueName } from "./queue-details-dialog"
import { createDraftForm } from "./settings-draft"
import {
  SettingNote,
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

/** The queues whose concurrency an admin may change. */
export function tunableQueues(overview: JobsOverview): JobQueueStatus[] {
  return overview.queues.filter((queue) => queue.concurrencyNote !== null)
}

/**
 * How many jobs each queue runs at once, saved with the save bar like the
 * rest of Settings.
 */
export function ConcurrencySection(props: {
  queues: readonly JobQueueStatus[]
}) {
  const queryClient = useQueryClient()
  const save = useMutation(() => ({
    mutationFn: (input: ConcurrencyInput) =>
      client.admin.jobs.updateConcurrency(input),
  }))
  // Until the first edit, the form follows the saved numbers, so what the
  // stream sends shows through.
  const form = createDraftForm<Draft>({
    initial: () => draftFrom(props.queues),
    onSubmit: async (value) => {
      const next = await save.mutate({ concurrency: value })
      queryClient.setQueryData(
        orpc.admin.jobs.live.experimental_liveKey(),
        next,
      )
      form.reset()
    },
  })
  return (
    <form class="contents" onSubmit={(event) => event.preventDefault()}>
      <SettingsSubsection id="concurrency" title={tr("jobs.concurrency")}>
        <SettingRows>
          <For each={props.queues} keyed={(queue) => queue.id}>
            {(queue) => <StepperField form={form} queue={queue()} />}
          </For>
        </SettingRows>
      </SettingsSubsection>
      <SettingsSaveBar
        dirty={form.dirty()}
        onReset={() => form.reset()}
        onSave={() => form.submit()}
      />
    </form>
  )
}

/**
 * A whole number between 1 and the queue's maximum, typed or stepped. A
 * typed number counts once it's in range; leaving the field puts back the
 * last one that was.
 */
function StepperField(props: { form: Form<Draft>; queue: JobQueueStatus }) {
  const value = () =>
    props.form.values()[props.queue.id] ?? props.queue.concurrency
  // What's typed, while it differs from the field's number.
  const [typed, setTyped] = createSignal<string | null>(null)
  const max = () => props.queue.maxConcurrency
  const inRange = (n: number) => Number.isInteger(n) && n >= 1 && n <= max()
  const typedValid = () => {
    const text = typed()
    return text === null || inRange(Number(text))
  }
  const set = (n: number) => {
    setTyped(null)
    props.form.set(props.queue.id, Math.max(1, Math.min(max(), n)))
  }
  const name = () => queueName(props.queue)

  return (
    <SettingRow
      title={name()}
      layout="split"
      footer={
        // The server's note on what the limit does, in English, translated when known.
        props.queue.concurrencyNote === null ? undefined : (
          <SettingNote>
            {translateKnown(props.queue.concurrencyNote)}
          </SettingNote>
        )
      }
    >
      {(ids) => (
        <div class="flex shrink-0 items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label={tr("jobs.concurrency.decrease", { queue: name() })}
            disabled={value() <= 1}
            onClick={() => set(value() - 1)}
          >
            <Icon icon={Minus} />
          </Button>
          <Input
            id={ids.controlId}
            aria-invalid={typedValid() ? undefined : "true"}
            inputmode="numeric"
            class="w-14 text-center tabular-nums"
            value={typed() ?? String(value())}
            onInput={(event) => {
              const text = event.currentTarget.value.replace(/\D/g, "")
              // Letters typed are taken out of the field at once.
              event.currentTarget.value = text
              const n = Number(text)
              if (text !== "" && inRange(n)) set(n)
              else setTyped(text)
            }}
            onBlur={() => setTyped(null)}
            onKeyDown={(event) => {
              if (event.key === "ArrowUp" && value() < max()) {
                event.preventDefault()
                set(value() + 1)
              } else if (event.key === "ArrowDown" && value() > 1) {
                event.preventDefault()
                set(value() - 1)
              }
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label={tr("jobs.concurrency.increase", { queue: name() })}
            disabled={value() >= max()}
            onClick={() => set(value() + 1)}
          >
            <Icon icon={Plus} />
          </Button>
          <span class="sr-only" aria-live="polite">
            {tr("jobs.concurrency.atOnce", { count: value() })}
          </span>
        </div>
      )}
    </SettingRow>
  )
}
