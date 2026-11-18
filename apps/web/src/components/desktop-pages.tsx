import { Button } from "@matinee/ui/components/button"
import { Spinner } from "@matinee/ui/components/spinner"
import { ServerIcon } from "lucide-react"
import { useEffect } from "react"

import { tr } from "@/i18n"
import { leaveSignedOut, showServers } from "@/lib/desktop"

import { AuthScreen } from "./auth-screen"

/**
 * In place of the login in the desktop app, which signs in itself: it
 * hands over to the app's own sign-in as soon as it shows.
 */
export function DesktopSignedOut() {
  useEffect(() => leaveSignedOut(), [])
  return (
    <AuthScreen
      title={tr("desktop.signedOut.title")}
      description={tr("desktop.signedOut.description")}
    >
      <Spinner className="text-muted-foreground mx-auto size-6" />
    </AuthScreen>
  )
}

/**
 * A page that needs a real browser, in the desktop app: it says so, and
 * offers the app's list of servers.
 */
export function DesktopBrowserOnly({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <AuthScreen title={title} description={description}>
      <Button
        variant="outline"
        size="lg"
        className="w-full"
        onClick={showServers}
      >
        <ServerIcon />
        {tr("desktop.switchServer")}
      </Button>
    </AuthScreen>
  )
}
