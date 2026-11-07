import {
  type AdminTrickplaySettings,
  type HardwareAcceleration,
  TRICKPLAY_INTERVALS,
  TRICKPLAY_WIDTHS,
  TrickplaySettings,
} from "@matinee/contracts"
import { Skeleton } from "@matinee/ui/components/skeleton"
import { useSelector } from "@tanstack/react-form"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { tr } from "@/i18n"
import { firstError, useAppForm } from "@/lib/form"
import { client, errorMessage, orpc } from "@/lib/rpc"

import { SelectField, SwitchField } from "./setting-controls"
import {
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

function sameDraft(a: Draft, b: Draft): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function TrickplayPanel() {
  const settings = useQuery(orpc.admin.trickplay.get.queryOptions())

  return (
    <SettingsSections>
      {settings.isPending ? (
        <Skeleton className="h-72 rounded-xl" />
      ) : settings.isError ? (
        <p className="text-muted-foreground text-sm">
          {tr("trickplay.loadFailed", { error: errorMessage(settings.error) })}
        </p>
      ) : (
        <TrickplayForm saved={settings.data} />
      )}
    </SettingsSections>
  )
}

function TrickplayForm({ saved }: { saved: AdminTrickplaySettings }) {
  const queryClient = useQueryClient()
  const initial = draftFrom(saved.settings)
  const save = useMutation({
    mutationFn: (input: TrickplaySettings) =>
      client.admin.trickplay.update(input),
  })
  // Until the first edit, the form follows the saved settings.
  const form = useAppForm({
    defaultValues: initial,
    onSubmit: async ({ value, formApi }) => {
      const parsed = TrickplaySettings.safeParse({
        ...value,
        intervalSeconds: Number(value.intervalSeconds),
        width: Number(value.width),
      })
      if (!parsed.success) {
        throw new Error(
          firstError(parsed.error.issues) ?? tr("trickplay.checkFields"),
        )
      }
      const next = await save.mutateAsync(parsed.data)
      queryClient.setQueryData(orpc.admin.trickplay.get.queryKey(), next)
      formApi.reset(draftFrom(next.settings))
    },
  })
  const dirty = useSelector(
    form.store,
    (state) => state.isTouched && !sameDraft(state.values, initial),
  )
  const gpu = saved.hardwareAcceleration
    ? (DECODER_NAMES.get(saved.hardwareAcceleration) ?? null)
    : null

  return (
    <form className="contents" onSubmit={(event) => event.preventDefault()}>
      <SettingsSubsection
        id="trickplay"
        title={tr("trickplay.title")}
        description={
          saved.videos > 0
            ? tr("trickplay.descriptionCount", {
                count: saved.videos,
                ready: saved.ready,
              })
            : tr("trickplay.description")
        }
      >
        <SettingRows>
          <form.AppField name="enabled">
            {() => (
              <SwitchField
                title={tr("trickplay.enabled")}
                description={tr("trickplay.enabled.description")}
              />
            )}
          </form.AppField>
          <form.AppField name="intervalSeconds">
            {() => (
              <SelectField
                title={tr("trickplay.interval")}
                description={tr("trickplay.interval.description")}
                options={INTERVALS}
                labelOf={(value) =>
                  tr("trickplay.interval.option", { count: Number(value) })
                }
              />
            )}
          </form.AppField>
          <form.AppField name="width">
            {() => (
              <SelectField
                title={tr("trickplay.width")}
                description={tr("trickplay.width.description")}
                options={WIDTHS}
                labelOf={(value) =>
                  tr("trickplay.width.option", { width: value })
                }
              />
            )}
          </form.AppField>
          <form.AppField name="keyframesOnly">
            {() => (
              <SwitchField
                title={tr("trickplay.keyframesOnly")}
                description={tr("trickplay.keyframesOnly.description")}
              />
            )}
          </form.AppField>
          <form.AppField name="hardwareDecoding">
            {() => (
              <CapabilitySwitchField
                title={tr("trickplay.hardwareDecoding")}
                description={
                  gpu
                    ? tr("trickplay.hardwareDecoding.description", {
                        decoder: gpu,
                      })
                    : undefined
                }
                unavailable={tr("trickplay.hardwareDecoding.unavailable")}
                available={gpu !== null}
              />
            )}
          </form.AppField>
        </SettingRows>
        <p className="text-muted-foreground text-[13px] leading-5">
          {tr("trickplay.regenerates")}
        </p>
      </SettingsSubsection>
      <SettingsSaveBar
        dirty={dirty}
        onReset={() => form.reset()}
        onSave={() => form.handleSubmit()}
      />
    </form>
  )
}
