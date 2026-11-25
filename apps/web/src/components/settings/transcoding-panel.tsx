import type {
  AdminTranscodingSettings,
  TranscodingSettings,
} from "@matinee/contracts"
import { useMutation, useQuery, useQueryClient } from "@tanstack/solid-query"
import { createMemo, Match, Switch } from "solid-js"

import { tr } from "@/i18n"
import { Skeleton } from "@/kit/skeleton"
import { toast } from "@/kit/toast"
import { client, errorMessage, orpc } from "@/lib/rpc"

import { createDraftForm } from "./settings-draft"
import { SettingsSaveBar, SettingsSections } from "./settings-panel"
import { hardwareOf } from "./transcoding-controls"
import {
  type Draft,
  draftFrom,
  inputError,
  inputFrom,
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
  const settings = useQuery(() => orpc.admin.transcoding.get.queryOptions())

  return (
    <SettingsSections>
      <Switch>
        <Match when={settings.isPending}>
          <Skeleton class="h-96 rounded-xl" />
        </Match>
        <Match when={settings.isError}>
          <p class="text-muted-foreground text-sm">
            {tr("transcoding.loadFailed", {
              error: errorMessage(settings.error),
            })}
          </p>
        </Match>
        <Match when={settings.isSuccess && settings.data}>
          {(saved) => <TranscodingForm settings={saved()} />}
        </Match>
      </Switch>
    </SettingsSections>
  )
}

/**
 * The transcoding form, also used by setup: the draft, saving it, and
 * running detection again. `onSaved` runs after a save went through.
 * `dirty` and `hardware` are accessors.
 */
export function useTranscodingForm(
  settings: () => AdminTranscodingSettings,
  onSaved?: () => void,
) {
  const queryClient = useQueryClient()
  const apply = (next: AdminTranscodingSettings) =>
    queryClient.setQueryData(orpc.admin.transcoding.get.queryKey(), next)
  const save = useMutation(() => ({
    mutationFn: (input: TranscodingSettings) =>
      client.admin.transcoding.update(input),
  }))
  const detect = useMutation(() => ({
    mutationFn: () => client.admin.transcoding.detect(),
    onSuccess: apply,
    onError: (error) => toast.error(errorMessage(error)),
  }))
  const initial = createMemo(() => draftFrom(settings()))
  // Until the first edit, the form follows the saved settings, so a refetch
  // or a new detection shows through.
  const form = createDraftForm<Draft>({
    initial,
    onSubmit: async (value) => {
      const parsed = inputFrom(value)
      if (!parsed.success) throw inputError(parsed.error.issues[0])
      const next = await save.mutate(parsed.data)
      apply(next)
      form.reset()
      onSaved?.()
    },
  })
  const hardware = () => {
    const accel = form.values().hardwareAcceleration
    return accel === "none" ? null : hardwareOf(settings().capabilities, accel)
  }
  return { form, detect, dirty: form.dirty, hardware }
}

function TranscodingForm(props: { settings: AdminTranscodingSettings }) {
  const { form, detect, dirty, hardware } = useTranscodingForm(
    () => props.settings,
  )
  const capabilities = () => props.settings.capabilities

  return (
    <form class="contents" onSubmit={(event) => event.preventDefault()}>
      <FfmpegSection
        capabilities={capabilities()}
        detecting={detect.isPending}
        onDetect={() => void detect.mutate()}
      />
      <HardwareSection
        form={form}
        settings={props.settings}
        hardware={hardware()}
      />
      <HardwareDecodingSection form={form} settings={props.settings} />
      <EncodingSection
        form={form}
        capabilities={capabilities()}
        hardware={hardware()}
      />
      <ToneMappingSection
        form={form}
        capabilities={capabilities()}
        hardware={hardware()}
      />
      <DeinterlacingSection form={form} />
      <AudioSection form={form} capabilities={capabilities()} />
      <SegmentsSection form={form} capabilities={capabilities()} />
      <SettingsSaveBar
        dirty={dirty()}
        onReset={() => form.reset()}
        onSave={() => form.submit()}
      />
    </form>
  )
}
