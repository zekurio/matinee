import { formatUserCode, UserCode } from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
import { cn } from "@matinee/ui/lib/utils"
import { createFileRoute, Link, useNavigate } from "@tanstack/solid-router"
import { Show } from "solid-js"

import { AuthScreen } from "@/components/auth-screen"
import { DeviceApproval, DeviceCodeForm } from "@/components/device-link"
import { tr } from "@/i18n"
import { buttonVariants } from "@/kit/button"

const LinkSearch = t.object({
  /** The code from the app, when it showed a link or a QR code. */
  code: t.string().optional().catch(undefined),
})

// The links that stand in for a full-width button.
const WIDE_OUTLINE = cn(
  buttonVariants({ variant: "outline", size: "lg" }),
  "w-full",
)

/**
 * Where someone signs in an app that has no browser, with its code. A
 * phone's camera lands here from the QR code a TV shows, with the code
 * filled in.
 */
export const Route = createFileRoute("/_authed/link")({
  validateSearch: LinkSearch,
  component: LinkDevice,
})

function LinkDevice() {
  const search = Route.useSearch()
  const navigate = useNavigate()
  const valid = () => {
    const code = search().code
    return code !== undefined && UserCode.safeParse(code).success ? code : null
  }

  return (
    <Show
      when={valid()}
      keyed
      fallback={
        <AuthScreen
          title={tr("link.device.title")}
          description={tr("link.device.enterCode")}
        >
          <DeviceCodeForm
            code={search().code}
            onSubmit={(userCode) =>
              void navigate({ to: "/link", search: { code: userCode } })
            }
          />
        </AuthScreen>
      }
    >
      {(code) => (
        <DeviceApproval
          userCode={formatUserCode(code)}
          Frame={AuthScreen}
          done={
            <Link to="/" class={WIDE_OUTLINE}>
              {tr("link.device.home")}
            </Link>
          }
          again={
            <Link to="/link" class={WIDE_OUTLINE}>
              {tr("link.device.anotherCode")}
            </Link>
          }
        />
      )}
    </Show>
  )
}
