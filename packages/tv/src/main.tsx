import type { User } from "@matinee/contracts"
import { render } from "@solidjs/web"
import { Show, onSettled } from "solid-js"

import { useServerAccent } from "./app/accent"
import { session } from "./auth/session"
import { startNavigation } from "./input/navigation"
import { startFullscreenOnGesture, startPointerIdle } from "./input/tv-mode"
import { useObserved } from "./lib/observable"
import { platform, setPlatform, type Platform } from "./platform/runtime"
import { Connect, Connecting, SignIn, Unreachable } from "./screens/auth"
import { pageFor } from "./screens/pages"
import { SignedInApp } from "./screens/shell"

/**
 * The app on a TV, from picking a server to signed in: a screen for each
 * step. A TV has no downloads, so no offline mode: a server that doesn't
 * answer shows the unreachable screen, with Retry, whatever is saved.
 */
function Root() {
  const observed = useObserved(session)
  const state = () => observed().state
  onSettled(() => session.start())
  useServerAccent(state)

  // The signed-in app stays mounted while the same account is on the same
  // server, so a preference saved in Settings doesn't throw away the
  // pages under it.
  const accountKey = () => {
    const current = state()
    return current.kind === "signedIn"
      ? `${current.user.id} ${current.server}`
      : null
  }
  const signedInUser = (): User | null => {
    const current = state()
    return current.kind === "signedIn" ? current.user : null
  }

  const outside = () => {
    const current = state()
    switch (current.kind) {
      case "noServer":
        return <Connect canCancel={current.canCancel} />
      case "connecting":
        return <Connecting server={current.server} />
      case "unreachable":
        return (
          <Unreachable
            server={current.server}
            offline={current.offline}
            retrying={current.retrying}
          />
        )
      case "signedOut":
        return (
          // Another server's sign-in starts afresh, with its own code.
          <SignIn
            server={current.server}
            config={current.config}
            adding={current.adding}
          />
        )
      case "signedIn":
        return null
    }
  }

  return (
    <>
      {outside()}
      <Show when={accountKey()} keyed>
        {(_account) => {
          const user = signedInUser()
          return user ? <SignedInApp user={user} pages={pageFor} /> : null
        }}
      </Show>
    </>
  )
}

/**
 * The TV UI, the same screens in the Solid web app at `/tv/` and in the
 * Tizen package. Set the platform first for a TV; the browser is the
 * default.
 */
export function mountTv(root: HTMLElement, host?: Platform): void {
  if (host) setPlatform(host)
  platform().registerRemoteKeys()
  startNavigation()
  startFullscreenOnGesture()
  startPointerIdle()
  render(() => <Root />, root)
}
