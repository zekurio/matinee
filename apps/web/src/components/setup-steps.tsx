import type { AdminTranscodingSettings } from "@matinee/contracts"
import type { JSX } from "@solidjs/web"
import { useMutation, useQuery, useQueryClient } from "@tanstack/solid-query"
import { useNavigate } from "@tanstack/solid-router"
import { ArrowLeft } from "lucide"
import { createSignal, Match, Show, Switch } from "solid-js"

import { AuthScreen } from "@/components/auth-screen"
import { FormAlert } from "@/components/form-alert"
import { LibrariesPanel } from "@/components/settings/libraries-panel"
import { SettingsSections } from "@/components/settings/settings-panel"
import { FfmpegSection } from "@/components/settings/transcoding-ffmpeg-section"
import {
  HardwareDecodingSection,
  HardwareSection,
} from "@/components/settings/transcoding-hardware"
import { useTranscodingForm } from "@/components/settings/transcoding-panel"
import { tr } from "@/i18n"
import { Button } from "@/kit/button"
import { Icon } from "@/kit/icon"
import { Skeleton } from "@/kit/skeleton"
import { Spinner } from "@/kit/spinner"
import { toast } from "@/kit/toast"
import { client, errorMessage, orpc } from "@/lib/rpc"
import { useActionFeedback } from "@/lib/use-action-feedback"

/** What setup asks after the admin account, in order. Done comes last. */
export type SetupStep = "transcoding" | "libraries" | "done"

type StepProps = {
  eyebrow: string
  onBack: (() => void) | undefined
  onNext: () => void
}

export function SetupSteps(props: { steps: SetupStep[] }) {
  const [index, setIndex] = createSignal(0)
  const step = () => props.steps[index()] ?? "done"
  const eyebrow = () =>
    tr("auth.setup.step", { current: index() + 1, total: props.steps.length })
  const onBack = () =>
    index() > 0 ? () => setIndex((current) => current - 1) : undefined
  const onNext = () =>
    setIndex((current) => Math.min(current + 1, props.steps.length - 1))

  return (
    <Switch>
      <Match when={step() === "transcoding"}>
        <TranscodingStep
          eyebrow={eyebrow()}
          onBack={onBack()}
          onNext={onNext}
        />
      </Match>
      <Match when={step() === "libraries"}>
        <LibrariesStep eyebrow={eyebrow()} onBack={onBack()} onNext={onNext} />
      </Match>
      <Match when={step() === "done"}>
        <DoneStep eyebrow={eyebrow()} onBack={onBack()} onNext={onNext} />
      </Match>
    </Switch>
  )
}

/** Back on the left, the way forward on the right. */
function StepActions(props: {
  onBack: (() => void) | undefined
  children: JSX.Element
}) {
  return (
    <div class="mt-10 flex items-center justify-between gap-3">
      <div>
        <Show when={props.onBack}>
          {(back) => (
            <Button variant="ghost" onClick={() => back()()}>
              <Icon icon={ArrowLeft} />
              {tr("auth.setup.back")}
            </Button>
          )}
        </Show>
      </div>
      <div class="flex items-center gap-2">{props.children}</div>
    </div>
  )
}

function TranscodingStep(props: StepProps) {
  const settings = useQuery(() => orpc.admin.transcoding.get.queryOptions())
  return (
    <AuthScreen
      wide
      eyebrow={props.eyebrow}
      title={tr("auth.setup.transcoding.title")}
      description={tr("auth.setup.transcoding.description")}
    >
      <Switch fallback={<Skeleton class="h-96 rounded-xl" />}>
        <Match when={settings.data}>
          {(data) => (
            <TranscodingForm
              settings={data()}
              eyebrow={props.eyebrow}
              onBack={props.onBack}
              onNext={props.onNext}
            />
          )}
        </Match>
        <Match when={settings.isError}>
          <FormAlert message={errorMessage(settings.error)} />
          <StepActions onBack={props.onBack}>
            <Button onClick={() => props.onNext()}>
              {tr("auth.setup.skip")}
            </Button>
          </StepActions>
        </Match>
      </Switch>
    </AuthScreen>
  )
}

/**
 * The part of Settings → Transcoding that depends on the machine: what
 * ffmpeg found, the GPU to use, and what it decodes. The rest keeps
 * Jellyfin's defaults.
 */
function TranscodingForm(
  props: StepProps & { settings: AdminTranscodingSettings },
) {
  const { form, detect, dirty, hardware } = useTranscodingForm(
    () => props.settings,
  )
  const { feedback, run } = useActionFeedback()
  const pending = () => feedback().state === "pending"
  const next = async () => {
    // Untouched, the defaults stay as they are and nothing needs saving.
    if (await run(() => (dirty() ? form.submit() : undefined))) props.onNext()
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void next()
      }}
    >
      <SettingsSections>
        <FfmpegSection
          capabilities={props.settings.capabilities}
          detecting={detect.isPending}
          onDetect={() => void detect.mutate()}
        />
        <HardwareSection
          form={form}
          settings={props.settings}
          hardware={hardware()}
        />
        <HardwareDecodingSection form={form} settings={props.settings} />
      </SettingsSections>
      <StepActions onBack={props.onBack}>
        <Button type="button" variant="ghost" onClick={() => props.onNext()}>
          {tr("auth.setup.skip")}
        </Button>
        <Button type="submit" disabled={pending()}>
          <Show when={pending()}>
            <Spinner />
          </Show>
          {tr("auth.setup.continue")}
        </Button>
      </StepActions>
    </form>
  )
}

function LibrariesStep(props: StepProps) {
  return (
    <AuthScreen
      wide
      eyebrow={props.eyebrow}
      title={tr("auth.setup.libraries.title")}
      description={tr("auth.setup.libraries.description")}
    >
      <LibrariesPanel />
      <StepActions onBack={props.onBack}>
        <Button onClick={() => props.onNext()}>
          {tr("auth.setup.continue")}
        </Button>
      </StepActions>
    </AuthScreen>
  )
}

function DoneStep(props: StepProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const finish = useMutation(() => ({
    mutationFn: () => client.admin.setup.complete(),
    onSuccess: async () => {
      queryClient.setQueryData(orpc.auth.config.queryKey(), (config) =>
        config ? { ...config, setup: null } : config,
      )
      await navigate({ to: "/" })
    },
    onError: (error) => toast.error(errorMessage(error)),
  }))
  return (
    <AuthScreen
      eyebrow={props.eyebrow}
      title={tr("auth.setup.done.title")}
      description={tr("auth.setup.done.description")}
    >
      <StepActions onBack={props.onBack}>
        <Button
          disabled={finish.isPending}
          onClick={() => void finish.mutate()}
        >
          <Show when={finish.isPending}>
            <Spinner />
          </Show>
          {tr("auth.setup.finish")}
        </Button>
      </StepActions>
    </AuthScreen>
  )
}
