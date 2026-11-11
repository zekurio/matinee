import { ORPCError } from "@matinee/client"
import { formatUserCode, UserCode } from "@matinee/contracts"
import { Button } from "@matinee/ui/components/button"
import { Skeleton } from "@matinee/ui/components/skeleton"
import { toast } from "@matinee/ui/components/sonner"
import { Spinner } from "@matinee/ui/components/spinner"
import { useMutation, useQuery } from "@tanstack/react-query"
import { getRouteApi } from "@tanstack/react-router"
import { CheckIcon, RefreshCwIcon } from "lucide-react"
import type { ComponentType, ReactNode } from "react"

import { DeviceCard } from "@/components/device-card"
import { tr } from "@/i18n"
import { trRich } from "@/i18n/react"
import { deviceLabel } from "@/lib/devices"
import { useAppForm } from "@/lib/form"
import { client, errorMessage, orpc } from "@/lib/rpc"

const authed = getRouteApi("/_authed")

/*
 * Signing in a device by the code it shows, for the /link page and the
 * dialog in Settings → Account. Each step names itself through `Frame`:
 * the page's screen, or the dialog's header.
 */

export type DeviceLinkFrame = ComponentType<{
  title: string
  description?: ReactNode
  children: ReactNode
}>

/** The field for the code a TV or app shows. Hands it on as `BCDF-GHJK`. */
export function DeviceCodeForm({
  code,
  onSubmit,
}: {
  code?: string
  onSubmit: (userCode: string) => void
}) {
  const form = useAppForm({
    defaultValues: { code: code ?? "" },
    onSubmit: ({ value }) => onSubmit(formatUserCode(value.code)),
  })

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.AppField name="code" validators={{ onChange: UserCode }}>
        {(field) => (
          <field.TextField
            id="device-code"
            label={tr("link.device.code")}
            placeholder="BCDF-GHJK"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={9}
          />
        )}
      </form.AppField>
      <form.AppForm>
        <form.SubmitButton size="lg">
          {tr("link.device.continue")}
        </form.SubmitButton>
      </form.AppForm>
    </form>
  )
}

/**
 * The device a code belongs to, for the person to check, and approving it.
 * `done` follows the approval, `again` a code that is gone.
 */
export function DeviceApproval({
  userCode,
  Frame,
  done,
  again,
}: {
  userCode: string
  Frame: DeviceLinkFrame
  done: ReactNode
  again: ReactNode
}) {
  const { user } = authed.useRouteContext()
  const approve = useMutation({
    mutationFn: () => client.auth.device.approve({ userCode }),
    onError: (error) => toast.error(errorMessage(error)),
  })
  const request = useQuery({
    ...orpc.auth.device.get.queryOptions({ input: { userCode } }),
    // Once approved, the code is used up; asking again would only say so.
    enabled: !approve.isSuccess,
    staleTime: 0,
  })
  const name = user.displayName ?? user.username

  if (approve.isSuccess && request.data) {
    const { deviceName, platform } = request.data
    return (
      <Frame
        title={tr("link.device.signedIn")}
        description={tr("link.device.signedInDescription", {
          device: deviceLabel(deviceName, platform),
          name,
        })}
      >
        {done}
      </Frame>
    )
  }
  if (request.isPending) {
    return (
      <Frame title={tr("link.device.title")}>
        <Skeleton className="h-16 rounded-xl" />
      </Frame>
    )
  }
  if (request.isError) {
    const gone =
      request.error instanceof ORPCError && request.error.code === "NOT_FOUND"
    return (
      <Frame
        title={
          gone ? tr("link.device.codeGone") : tr("link.device.lookupFailed")
        }
        description={
          gone
            ? tr("link.device.codeGoneDescription")
            : errorMessage(request.error)
        }
      >
        {gone ? (
          again
        ) : (
          <Button
            variant="outline"
            size="lg"
            className="w-full"
            onClick={() => void request.refetch()}
          >
            <RefreshCwIcon />
            {tr("link.device.retry")}
          </Button>
        )}
      </Frame>
    )
  }

  return (
    <Frame
      title={tr("link.device.title")}
      description={trRich("link.device.wants", {
        name: <span className="text-foreground font-medium">{name}</span>,
      })}
    >
      <div className="flex flex-col gap-4">
        <DeviceCard
          name={request.data.deviceName}
          platform={request.data.platform}
        />
        <p className="text-sm">
          {trRich("link.device.codeShown", {
            code: (
              <span className="font-mono font-medium tracking-wider">
                {request.data.userCode}
              </span>
            ),
          })}
        </p>
        <Button
          size="lg"
          disabled={approve.isPending}
          onClick={() => approve.mutate()}
        >
          {approve.isPending ? <Spinner /> : <CheckIcon />}
          {tr("link.device.approve")}
        </Button>
        <p className="text-muted-foreground text-[13px] leading-5">
          {tr("link.device.warning")}
        </p>
      </div>
    </Frame>
  )
}
