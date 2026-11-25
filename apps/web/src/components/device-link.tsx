import { ORPCError } from "@matinee/client"
import { formatUserCode, UserCode } from "@matinee/contracts"
import type { JSX } from "@solidjs/web"
import { useMutation, useQuery } from "@tanstack/solid-query"
import { getRouteApi } from "@tanstack/solid-router"
import { Check, RefreshCw } from "lucide"
import { type Component, Match, onSettled, Show, Switch } from "solid-js"

import { DeviceCard } from "@/components/device-card"
import { tr } from "@/i18n"
import { trRich } from "@/i18n/solid"
import { Button } from "@/kit/button"
import { Icon } from "@/kit/icon"
import { Skeleton } from "@/kit/skeleton"
import { Spinner } from "@/kit/spinner"
import { toast } from "@/kit/toast"
import { deviceLabel } from "@/lib/devices"
import { createForm } from "@/lib/form"
import { SubmitButton, TextField } from "@/lib/form-fields"
import { client, errorMessage, orpc } from "@/lib/rpc"

const authed = getRouteApi("/_authed")

/*
 * Signing in a device by the code it shows, for the /link page and the
 * dialog in Settings → Account. Each step names itself through `Frame`:
 * the page's screen, or the dialog's header.
 */

export type DeviceLinkFrame = Component<{
  title: string
  description?: JSX.Element
  children: JSX.Element
}>

/** The field for the code a TV or app shows. Hands it on as `BCDF-GHJK`. */
export function DeviceCodeForm(props: {
  code?: string
  onSubmit: (userCode: string) => void
}) {
  const form = createForm({
    defaultValues: { code: "" },
    checks: { code: UserCode },
    onSubmit: (values) => props.onSubmit(formatUserCode(values.code)),
  })
  // A starting code, as from the address; the form keeps what's typed.
  onSettled(() => {
    const code = props.code
    if (code) form.reset({ code })
  })

  return (
    <form
      class="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        void form.submit()
      }}
    >
      <TextField
        form={form}
        name="code"
        id="device-code"
        label={tr("link.device.code")}
        placeholder="BCDF-GHJK"
        autocomplete="off"
        autocapitalize="characters"
        spellcheck={false}
        maxlength={9}
      />
      <SubmitButton form={form} size="lg">
        {tr("link.device.continue")}
      </SubmitButton>
    </form>
  )
}

/**
 * The device a code belongs to, for the person to check, and approving it.
 * `done` follows the approval, `again` a code that is gone.
 */
export function DeviceApproval(props: {
  userCode: string
  Frame: DeviceLinkFrame
  done: JSX.Element
  again: JSX.Element
}) {
  const context = authed.useRouteContext()
  const approve = useMutation(() => ({
    mutationFn: () => client.auth.device.approve({ userCode: props.userCode }),
    onError: (error) => toast.error(errorMessage(error)),
  }))
  const request = useQuery(() => ({
    ...orpc.auth.device.get.queryOptions({
      input: { userCode: props.userCode },
    }),
    // Once approved, the code is used up; asking again would only say so.
    enabled: !approve.isSuccess,
    staleTime: 0,
  }))
  const name = () => context().user.displayName ?? context().user.username
  const gone = () =>
    request.error instanceof ORPCError && request.error.code === "NOT_FOUND"

  return (
    <Switch>
      <Match when={approve.isSuccess && request.data}>
        {(device) => (
          <props.Frame
            title={tr("link.device.signedIn")}
            description={tr("link.device.signedInDescription", {
              device: deviceLabel(device().deviceName, device().platform),
              name: name(),
            })}
          >
            {props.done}
          </props.Frame>
        )}
      </Match>
      <Match when={request.isPending}>
        <props.Frame title={tr("link.device.title")}>
          <Skeleton class="h-16 rounded-xl" />
        </props.Frame>
      </Match>
      <Match when={request.isError}>
        <props.Frame
          title={
            gone() ? tr("link.device.codeGone") : tr("link.device.lookupFailed")
          }
          description={
            gone()
              ? tr("link.device.codeGoneDescription")
              : errorMessage(request.error)
          }
        >
          <Show when={!gone()} fallback={props.again}>
            <Button
              variant="outline"
              size="lg"
              class="w-full"
              onClick={() => void request.refetch()}
            >
              <Icon icon={RefreshCw} />
              {tr("link.device.retry")}
            </Button>
          </Show>
        </props.Frame>
      </Match>
      <Match when={request.data}>
        {(device) => (
          <props.Frame
            title={tr("link.device.title")}
            description={trRich("link.device.wants", {
              name: <span class="text-foreground font-medium">{name()}</span>,
            })}
          >
            <div class="flex flex-col gap-4">
              <DeviceCard
                name={device().deviceName}
                platform={device().platform}
              />
              <p class="text-sm">
                {trRich("link.device.codeShown", {
                  code: (
                    <span class="font-mono font-medium tracking-wider">
                      {device().userCode}
                    </span>
                  ),
                })}
              </p>
              <Button
                size="lg"
                disabled={approve.isPending}
                onClick={() => approve.mutate()}
              >
                <Show when={approve.isPending} fallback={<Icon icon={Check} />}>
                  <Spinner />
                </Show>
                {tr("link.device.approve")}
              </Button>
              <p class="text-muted-foreground text-13px leading-5">
                {tr("link.device.warning")}
              </p>
            </div>
          </props.Frame>
        )}
      </Match>
    </Switch>
  )
}
