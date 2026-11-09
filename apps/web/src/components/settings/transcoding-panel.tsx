import type {
  AdminTranscodingSettings,
  TranscodingSettings,
} from "@matinee/contracts"
import { Skeleton } from "@matinee/ui/components/skeleton"
import { useSelector } from "@tanstack/react-form"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { tr } from "@/i18n"
import { useAppForm } from "@/lib/form"
import { client, errorMessage, orpc } from "@/lib/rpc"

import { SettingsSaveBar, SettingsSections } from "./settings-panel"
import { hardwareOf } from "./transcoding-controls"
import {
  draftFrom,
  inputError,
  inputFrom,
  sameDraft,
} from "./transcoding-draft"
import { FfmpegSection } from "./transcoding-ffmpeg-section"
import {
  HardwareDecodingSection,
  HardwareSection,
} from "./transcoding-hardware"
import {
  AudioSection,
  DeinterlacingSection,
  EncodingSection,
  SegmentsSection,
  ToneMappingSection,
} from "./transcoding-output"

export function TranscodingPanel() {
  const settings = useQuery(orpc.admin.transcoding.get.queryOptions())

  return (
    <SettingsSections>
      {settings.isPending ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : settings.isError ? (
        <p className="text-muted-foreground text-sm">
          {tr("transcoding.loadFailed", {
            error: errorMessage(settings.error),
          })}
        </p>
      ) : (
        <TranscodingForm settings={settings.data} />
      )}
    </SettingsSections>
  )
}

/**
 * The transcoding form, also used by setup: the draft, saving it, and
 * running detection again. `onSaved` runs after a save went through.
 */
export function useTranscodingForm(
  settings: AdminTranscodingSettings,
  onSaved?: () => void,
) {
  const queryClient = useQueryClient()
  const initial = draftFrom(settings)
  const apply = (next: AdminTranscodingSettings) =>
    queryClient.setQueryData(orpc.admin.transcoding.get.queryKey(), next)
  const save = useMutation({
    mutationFn: (input: TranscodingSettings) =>
      client.admin.transcoding.update(input),
  })
  const detect = useMutation({
    mutationFn: () => client.admin.transcoding.detect(),
    onSuccess: apply,
  })
  // Until the first edit, the form follows the saved settings, so a refetch
  // or a new detection shows through.
  const form = useAppForm({
    defaultValues: initial,
    onSubmit: async ({ value, formApi }) => {
      const parsed = inputFrom(value)
      if (!parsed.success) throw inputError(parsed.error.issues[0])
      const next = await save.mutateAsync(parsed.data)
      apply(next)
      formApi.reset(draftFrom(next))
      onSaved?.()
    },
  })
  // Edits only: for a render after a refetch, an untouched form still holds
  // the old values.
  const dirty = useSelector(
    form.store,
    (state) => state.isTouched && !sameDraft(state.values, initial),
  )
  const accel = useSelector(
    form.store,
    (state) => state.values.hardwareAcceleration,
  )
  const { capabilities } = settings
  const hardware = accel === "none" ? null : hardwareOf(capabilities, accel)
  return { form, detect, dirty, hardware }
}

function TranscodingForm({ settings }: { settings: AdminTranscodingSettings }) {
  const { form, detect, dirty, hardware } = useTranscodingForm(settings)
  const { capabilities } = settings

  return (
    <form className="contents" onSubmit={(event) => event.preventDefault()}>
      <FfmpegSection
        capabilities={capabilities}
        detecting={detect.isPending}
        detectError={detect.error ? errorMessage(detect.error) : null}
        onDetect={() => detect.mutate()}
      />
      <HardwareSection form={form} settings={settings} hardware={hardware} />
      <HardwareDecodingSection form={form} />
      <EncodingSection
        form={form}
        capabilities={capabilities}
        hardware={hardware}
      />
      <ToneMappingSection
        form={form}
        capabilities={capabilities}
        hardware={hardware}
      />
      <DeinterlacingSection form={form} />
      <AudioSection form={form} capabilities={capabilities} />
      <SegmentsSection form={form} capabilities={capabilities} />
      <SettingsSaveBar
        dirty={dirty}
        onReset={() => form.reset()}
        onSave={() => form.handleSubmit()}
      />
    </form>
  )
}
