import {
  type AdminTrickplaySettings,
  type HardwareAcceleration,
  TRICKPLAY_INTERVALS,
  TRICKPLAY_WIDTHS,
  TrickplaySettings,
} from "@matinee/contracts"
import { useMutation, useQuery, useQueryClient } from "@tanstack/solid-query"
import { Match, Show, Switch } from "solid-js"

import { tr, translateKnown } from "@/i18n"
import { Skeleton } from "@/kit/skeleton"
import { client, errorMessage, orpc } from "@/lib/rpc"
import { ShownError } from "@/lib/shown-error"

import { SelectField, SwitchField } from "./setting-controls"
import { createDraftForm } from "./settings-draft"
import {
  SettingNote,
  SettingRows,
  SettingsSaveBar,
  SettingsSections,
  SettingsSubsection,
} from "./settings-panel"
import { CapabilitySwitchField } from "./transcoding-controls"

const INTERVALS = TRICKPLAY_INTERVALS.map(String)
const WIDTHS = TRICKPLAY_WIDTHS.map(String)

/** What each GPU decodes with, by the name its vendor gives it. */
const DECODER_NAMES = new Map<HardwareAcceleration, string>([
  ["vaapi", "VAAPI"],
  ["qsv", "Quick Sync"],
  ["nvenc", "NVDEC"],
  ["videotoolbox", "VideoToolbox"],
])

/** The form. The selects hold their numbers as text. */
type Draft = {
  enabled: boolean
  intervalSeconds: string
  width: string
  keyframesOnly: boolean
  hardwareDecoding: boolean
}

function draftFrom(settings: TrickplaySettings): Draft {
  return {
    ...settings,
    intervalSeconds: String(settings.intervalSeconds),
    width: String(settings.width),
  }
}

export function TrickplayPanel() {
  const settings = useQuery(() => orpc.admin.trickplay.get.queryOptions())

  return (
    <SettingsSections>
      <Switch>
        <Match when={settings.isPending}>
          <Skeleton class="h-72 rounded-xl" />
        </Match>
        <Match when={settings.isError}>
          <p class="text-muted-foreground text-sm">
            {tr("trickplay.loadFailed", {
              error: errorMessage(settings.error),
            })}
          </p>
        </Match>
        <Match when={settings.isSuccess && settings.data}>
          {(saved) => <TrickplayForm saved={saved()} />}
        </Match>
      </Switch>
    </SettingsSections>
  )
}

function TrickplayForm(props: { saved: AdminTrickplaySettings }) {
  const queryClient = useQueryClient()
  const save = useMutation(() => ({
    mutationFn: (input: TrickplaySettings) =>
      client.admin.trickplay.update(input),
  }))
  // Until the first edit, the form follows the saved settings.
  const form = createDraftForm<Draft>({
    initial: () => draftFrom(props.saved.settings),
    onSubmit: async (value) => {
      const parsed = TrickplaySettings.safeParse({
        ...value,
        intervalSeconds: Number(value.intervalSeconds),
        width: Number(value.width),
      })
      if (!parsed.success) {
        const message = parsed.error.issues.find(
          (issue) => issue.message,
        )?.message
        throw new ShownError(
          message === undefined
            ? tr("trickplay.checkFields")
            : translateKnown(message),
        )
      }
      const next = await save.mutate(parsed.data)
      queryClient.setQueryData(orpc.admin.trickplay.get.queryKey(), next)
      form.reset()
    },
  })
  const gpu = () => {
    const accel = props.saved.hardwareAcceleration
    return accel ? (DECODER_NAMES.get(accel) ?? null) : null
  }

  return (
    <form class="contents" onSubmit={(event) => event.preventDefault()}>
      <SettingsSubsection id="trickplay" title={tr("trickplay.title")}>
        <Show when={props.saved.videos > 0}>
          <SettingNote>
            {tr("trickplay.descriptionCount", {
              count: props.saved.videos,
              ready: props.saved.ready,
            })}
          </SettingNote>
        </Show>
        <SettingRows>
          <SwitchField
            form={form}
            name="enabled"
            title={tr("trickplay.enabled")}
          />
          <SelectField
            form={form}
            name="intervalSeconds"
            title={tr("trickplay.interval")}
            options={INTERVALS}
            labelOf={(value) =>
              tr("trickplay.interval.option", { count: Number(value) })
            }
          />
          <SelectField
            form={form}
            name="width"
            title={tr("trickplay.width")}
            options={WIDTHS}
            labelOf={(value) => tr("trickplay.width.option", { width: value })}
          />
          <SwitchField
            form={form}
            name="keyframesOnly"
            title={tr("trickplay.keyframesOnly")}
          />
          <CapabilitySwitchField
            form={form}
            name="hardwareDecoding"
            title={tr("trickplay.hardwareDecoding")}
            unavailable={tr("trickplay.hardwareDecoding.unavailable")}
            available={gpu() !== null}
          />
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
