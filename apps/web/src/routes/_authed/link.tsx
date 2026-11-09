import { ORPCError } from "@matinee/client"
import { formatUserCode, UserCode } from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
import { Button, buttonVariants } from "@matinee/ui/components/button"
import { Skeleton } from "@matinee/ui/components/skeleton"
import { Spinner } from "@matinee/ui/components/spinner"
import { useMutation, useQuery } from "@tanstack/react-query"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { CheckIcon, RefreshCwIcon } from "lucide-react"

import { AuthScreen } from "@/components/auth-screen"
import { DeviceCard } from "@/components/device-card"
import { FormAlert } from "@/components/form-alert"
import { tr } from "@/i18n"
import { trRich } from "@/i18n/react"
import { deviceLabel } from "@/lib/devices"
import { useAppForm } from "@/lib/form"
import { client, errorMessage, orpc } from "@/lib/rpc"

const LinkSearch = t.object({
  /** The code from the app, when it showed a link or a QR code. */
  code: t.string().optional().catch(undefined),
})

// The links that stand in for a full-width button.
const WIDE_OUTLINE = buttonVariants({
  variant: "outline",
  size: "lg",
  className: "w-full",
})

/** Where someone signs in an app that has no browser, with its code. */
export const Route = createFileRoute("/_authed/link")({
  validateSearch: LinkSearch,
  component: LinkDevice,
})

function LinkDevice() {
  const { code } = Route.useSearch()
  if (code === undefined || !UserCode.safeParse(code).success) {
    return <EnterCode code={code} />
  }
  return <ApproveDevice key={code} userCode={formatUserCode(code)} />
}

function EnterCode({ code }: { code: string | undefined }) {
  const navigate = useNavigate()
  const form = useAppForm({
    defaultValues: { code: code ?? "" },
    onSubmit: ({ value }) =>
      navigate({ to: "/link", search: { code: formatUserCode(value.code) } }),
  })

  return (
    <AuthScreen
      title={tr("link.device.title")}
      description={tr("link.device.enterCode")}
    >
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
    </AuthScreen>
  )
}

function ApproveDevice({ userCode }: { userCode: string }) {
  const { user } = Route.useRouteContext()
  const approve = useMutation({
    mutationFn: () => client.auth.device.approve({ userCode }),
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
      <AuthScreen
        title={tr("link.device.signedIn")}
        description={tr("link.device.signedInDescription", {
          device: deviceLabel(deviceName, platform),
          name,
        })}
      >
        <Link to="/" className={WIDE_OUTLINE}>
          {tr("link.device.home")}
        </Link>
      </AuthScreen>
    )
  }
  if (request.isPending) {
    return (
      <AuthScreen title={tr("link.device.title")}>
        <Skeleton className="h-16 rounded-xl" />
      </AuthScreen>
    )
  }
  if (request.isError) {
    const gone =
      request.error instanceof ORPCError && request.error.code === "NOT_FOUND"
    return (
      <AuthScreen
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
          <Link to="/link" className={WIDE_OUTLINE}>
            {tr("link.device.anotherCode")}
          </Link>
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
      </AuthScreen>
    )
  }

  return (
    <AuthScreen
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
        {approve.error && <FormAlert message={errorMessage(approve.error)} />}
        <p className="text-muted-foreground text-[13px] leading-5">
          {tr("link.device.warning")}
        </p>
      </div>
    </AuthScreen>
  )
}
