import { APP_AUTHORIZE_PATH, AppAuthorizeRequest } from "@matinee/contracts"
import { Button } from "@matinee/ui/components/button"
import { createFileRoute, useLocation } from "@tanstack/react-router"
import { LogInIcon } from "lucide-react"
import { useState } from "react"

import { AuthScreen } from "@/components/auth-screen"
import { DeviceCard } from "@/components/device-card"
import { tr, translateKnown } from "@/i18n"
import { trRich } from "@/i18n/react"

/**
 * Where an app sends someone to sign it in, in the system browser. The
 * query is the app's `AppAuthorizeRequest`. Approving posts it to the
 * server, which sends the browser back to the app with a code.
 */
export const Route = createFileRoute("/_authed/authorize")({
  component: AuthorizeApp,
})

function AuthorizeApp() {
  const { user } = Route.useRouteContext()
  // The raw query: the router would read a numeric `state` as a number.
  const query = useLocation({ select: (location) => location.searchStr })
  const request = AppAuthorizeRequest.safeParse(
    Object.fromEntries(new URLSearchParams(query)),
  )
  const [sent, setSent] = useState(false)

  if (!request.success) {
    return (
      <AuthScreen
        title={tr("link.app.invalid")}
        description={tr("link.app.invalidDescription")}
      >
        <p className="text-muted-foreground text-[13px] leading-5">
          {translateKnown(request.error.issues[0]?.message ?? "")}
        </p>
      </AuthScreen>
    )
  }

  const { device_name: name, platform } = request.data
  const fields = Object.entries(request.data).filter(
    (entry): entry is [string, string] => entry[1] !== undefined,
  )

  return (
    <AuthScreen
      title={tr("link.app.title")}
      description={trRich("link.app.wants", {
        name: (
          <span className="text-foreground font-medium">
            {user.displayName ?? user.username}
          </span>
        ),
      })}
    >
      <div className="flex flex-col gap-4">
        <DeviceCard name={name || null} platform={platform} />
        {/* A form post, so other sites can't send it. The server answers
            with a redirect to the app's URI, which a fetch can't follow. */}
        <form
          method="post"
          action={APP_AUTHORIZE_PATH}
          className="flex"
          onSubmit={() => setSent(true)}
        >
          {fields.map(([key, value]) => (
            <input key={key} type="hidden" name={key} value={value} />
          ))}
          <Button type="submit" size="lg" className="flex-1">
            <LogInIcon />
            {tr("link.app.signIn")}
          </Button>
        </form>
        <p className="text-muted-foreground text-[13px] leading-5">
          {sent ? tr("link.app.sent") : tr("link.app.caution")}
        </p>
      </div>
    </AuthScreen>
  )
}
