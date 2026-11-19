import type { SavedServer } from "@matinee/desktop-bridge"
import { Button } from "@matinee/ui/components/button"
import { FieldError } from "@matinee/ui/components/field"
import { Spinner } from "@matinee/ui/components/spinner"
import { LogInIcon, RefreshCwIcon, ServerIcon } from "lucide-react"

import { tr } from "@/i18n"
import { hostOf } from "@/lib/format"
import { useApp } from "@/stores/app"

import { Page, ServerCard } from "./frame"

/** The server in use ended its session: sign in again, or go elsewhere. */
export function SignedOutScreen({ server }: { server: SavedServer }) {
  const signInTo = useApp((state) => state.signInTo)
  const showServers = useApp((state) => state.showServers)
  return (
    <Page
      title={tr("signedOut.title")}
      description={tr("signedOut.description", { host: hostOf(server.url) })}
    >
      <div className="flex flex-col gap-3">
        <ServerCard server={server} />
        <Button
          size="lg"
          className="mt-5"
          data-primary
          onClick={() => signInTo(server.url)}
        >
          <LogInIcon />
          {tr("signedOut.signIn")}
        </Button>
        <Button variant="outline" size="lg" onClick={showServers}>
          <ServerIcon />
          {tr("common.otherServer")}
        </Button>
      </div>
    </Page>
  )
}

/** The server in use didn't answer: try it again, or go elsewhere. */
export function UnreachableScreen({ server }: { server: SavedServer }) {
  const opening = useApp((state) => state.opening)
  const openFailed = useApp((state) => state.openFailed)
  const open = useApp((state) => state.open)
  const showServers = useApp((state) => state.showServers)
  const host = hostOf(server.url)
  return (
    <Page
      title={tr("unreachable.title")}
      description={tr("unreachable.description", { host })}
    >
      <div className="flex flex-col gap-3">
        <ServerCard server={server} />
        <Button
          size="lg"
          className="mt-5"
          data-primary
          // Not disabled while it opens, which would drop the focus.
          aria-busy={opening === server.id}
          onClick={() => {
            if (opening === null) void open(server.id)
          }}
        >
          {opening === server.id ? <Spinner /> : <RefreshCwIcon />}
          {tr("unreachable.retry")}
        </Button>
        <Button variant="outline" size="lg" onClick={showServers}>
          <ServerIcon />
          {tr("common.otherServer")}
        </Button>
        {openFailed === server.id && (
          <FieldError>{tr("servers.openFailed", { host })}</FieldError>
        )}
      </div>
    </Page>
  )
}

/** Not in the app, or in one too old to talk to. */
export function NoShellScreen() {
  return (
    <Page
      title={tr("app.noShell.title")}
      description={tr("app.noShell.description")}
    />
  )
}

/** The shell didn't answer what to show. */
export function FailedScreen() {
  const start = useApp((state) => state.start)
  return (
    <Page
      title={tr("app.failed.title")}
      description={tr("app.failed.description")}
    >
      <Button
        size="lg"
        className="w-full"
        data-primary
        onClick={() => void start()}
      >
        <RefreshCwIcon />
        {tr("app.failed.retry")}
      </Button>
    </Page>
  )
}
