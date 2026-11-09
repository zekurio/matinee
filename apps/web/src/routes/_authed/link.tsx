import { formatUserCode, UserCode } from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
import { buttonVariants } from "@matinee/ui/components/button"
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"

import { AuthScreen } from "@/components/auth-screen"
import { DeviceApproval, DeviceCodeForm } from "@/components/device-link"
import { tr } from "@/i18n"

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
  const { code } = Route.useSearch()
  const navigate = useNavigate()
  if (code === undefined || !UserCode.safeParse(code).success) {
    return (
      <AuthScreen
        title={tr("link.device.title")}
        description={tr("link.device.enterCode")}
      >
        <DeviceCodeForm
          code={code}
          onSubmit={(userCode) =>
            navigate({ to: "/link", search: { code: userCode } })
          }
        />
      </AuthScreen>
    )
  }
  return (
    <DeviceApproval
      key={code}
      userCode={formatUserCode(code)}
      Frame={AuthScreen}
      done={
        <Link to="/" className={WIDE_OUTLINE}>
          {tr("link.device.home")}
        </Link>
      }
      again={
        <Link to="/link" className={WIDE_OUTLINE}>
          {tr("link.device.anotherCode")}
        </Link>
      }
    />
  )
}
