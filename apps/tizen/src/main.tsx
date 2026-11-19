import "./platform/polyfills"
import "./styles/app.css"
import { render } from "preact"
import { useEffect } from "preact/hooks"

import { session } from "@/auth/session"
import { startNavigation } from "@/input/navigation"
import { useObserved } from "@/lib/observable"
import { registerRemoteKeys } from "@/platform/tizen"
import { Connect, Connecting, SignIn, Unreachable } from "@/screens/auth"
import { pageFor } from "@/screens/pages"
import { SignedInApp } from "@/screens/shell"

/**
 * The app on a TV, from picking a server to signed in: a screen for each
 * step. A TV has no downloads, so no offline mode: a server that doesn't
 * answer shows the unreachable screen, with Retry, whatever is saved.
 */
function Root() {
  const { state } = useObserved(session)
  useEffect(() => session.start(), [])
  switch (state.kind) {
    case "noServer":
      return <Connect canCancel={state.canCancel} />
    case "connecting":
      return <Connecting server={state.server} />
    case "unreachable":
      return (
        <Unreachable
          server={state.server}
          offline={state.offline}
          retrying={state.retrying}
        />
      )
    case "signedOut":
      return (
        // Another server's sign-in starts afresh, with its own code.
        <SignIn
          key={state.server}
          server={state.server}
          config={state.config}
          adding={state.adding}
        />
      )
    case "signedIn":
      return (
        // A new account starts the pages, and what they keep, afresh.
        <SignedInApp
          key={`${state.user.id} ${state.server}`}
          user={state.user}
          pages={pageFor}
        />
      )
  }
}

registerRemoteKeys()
startNavigation()
const root = document.getElementById("app")
if (root) render(<Root />, root)
