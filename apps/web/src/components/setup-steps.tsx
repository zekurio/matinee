import type { AdminTranscodingSettings } from "@matinee/contracts"
import { Button } from "@matinee/ui/components/button"
import { Skeleton } from "@matinee/ui/components/skeleton"
import { toast } from "@matinee/ui/components/sonner"
import { Spinner } from "@matinee/ui/components/spinner"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { ArrowLeftIcon } from "lucide-react"
import { type ReactNode, useState } from "react"

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
import { client, errorMessage, orpc } from "@/lib/rpc"
import { useActionFeedback } from "@/lib/use-action-feedback"

/** What setup asks after the admin account, in order. Done comes last. */
export type SetupStep = "transcoding" | "libraries" | "done"

type StepProps = {
  eyebrow: string
  onBack: (() => void) | undefined
  onNext: () => void
}

export function SetupSteps({ steps }: { steps: SetupStep[] }) {
  const [index, setIndex] = useState(0)
  const step = steps[index] ?? "done"
  const props: StepProps = {
    eyebrow: tr("auth.setup.step", {
      current: index + 1,
      total: steps.length,
    }),
    onBack: index > 0 ? () => setIndex(index - 1) : undefined,
    onNext: () => setIndex(Math.min(index + 1, steps.length - 1)),
  }
  switch (step) {
    case "transcoding":
      return <TranscodingStep {...props} />
    case "libraries":
      return <LibrariesStep {...props} />
    case "done":
      return <DoneStep {...props} />
  }
}

/** Back on the left, the way forward on the right. */
function StepActions({
  onBack,
  children,
}: {
  onBack: (() => void) | undefined
  children: ReactNode
}) {
  return (
    <div className="mt-10 flex items-center justify-between gap-3">
      <div>
        {onBack && (
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeftIcon />
            {tr("auth.setup.back")}
          </Button>
        )}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  )
}

function TranscodingStep(props: StepProps) {
  const settings = useQuery(orpc.admin.transcoding.get.queryOptions())
  return (
    <AuthScreen
      wide
      eyebrow={props.eyebrow}
      title={tr("auth.setup.transcoding.title")}
      description={tr("auth.setup.transcoding.description")}
    >
      {settings.data ? (
        <TranscodingForm settings={settings.data} {...props} />
      ) : settings.isError ? (
        <>
          <FormAlert message={errorMessage(settings.error)} />
          <StepActions onBack={props.onBack}>
            <Button onClick={props.onNext}>{tr("auth.setup.skip")}</Button>
          </StepActions>
        </>
      ) : (
        <Skeleton className="h-96 rounded-xl" />
      )}
    </AuthScreen>
  )
}

/**
 * The part of Settings → Transcoding that depends on the machine: what
 * ffmpeg found, the GPU to use, and what it decodes. The rest keeps
 * Jellyfin's defaults.
 */
function TranscodingForm({
  settings,
  onBack,
  onNext,
}: StepProps & { settings: AdminTranscodingSettings }) {
  const { form, detect, dirty, hardware } = useTranscodingForm(settings)
  const { feedback, run } = useActionFeedback()
  const pending = feedback.state === "pending"
  const next = async () => {
    // Untouched, the defaults stay as they are and nothing needs saving.
    if (await run(() => (dirty ? form.handleSubmit() : undefined))) onNext()
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
          capabilities={settings.capabilities}
          detecting={detect.isPending}
          onDetect={() => detect.mutate()}
        />
        <HardwareSection form={form} settings={settings} hardware={hardware} />
        <HardwareDecodingSection form={form} />
      </SettingsSections>
      <StepActions onBack={onBack}>
        <Button type="button" variant="ghost" onClick={onNext}>
          {tr("auth.setup.skip")}
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <Spinner />}
          {tr("auth.setup.continue")}
        </Button>
      </StepActions>
    </form>
  )
}

function LibrariesStep({ eyebrow, onBack, onNext }: StepProps) {
  return (
    <AuthScreen
      wide
      eyebrow={eyebrow}
      title={tr("auth.setup.libraries.title")}
      description={tr("auth.setup.libraries.description")}
    >
      <LibrariesPanel />
      <StepActions onBack={onBack}>
        <Button onClick={onNext}>{tr("auth.setup.continue")}</Button>
      </StepActions>
    </AuthScreen>
  )
}

function DoneStep({ eyebrow, onBack }: StepProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const finish = useMutation({
    mutationFn: () => client.admin.setup.complete(),
    onSuccess: async () => {
      queryClient.setQueryData(orpc.auth.config.queryKey(), (config) =>
        config ? { ...config, setup: null } : config,
      )
      await navigate({ to: "/" })
    },
    onError: (error) => toast.error(errorMessage(error)),
  })
  return (
    <AuthScreen
      eyebrow={eyebrow}
      title={tr("auth.setup.done.title")}
      description={tr("auth.setup.done.description")}
    >
      <StepActions onBack={onBack}>
        <Button disabled={finish.isPending} onClick={() => finish.mutate()}>
          {finish.isPending && <Spinner />}
          {tr("auth.setup.finish")}
        </Button>
      </StepActions>
    </AuthScreen>
  )
}
