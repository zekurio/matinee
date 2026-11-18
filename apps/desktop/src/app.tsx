import { useApp } from "@/stores/app"

import { Frame } from "./components/frame"
import { ServersScreen } from "./components/servers-screen"
import { SignInScreen } from "./components/sign-in-screen"
import {
  FailedScreen,
  NoShellScreen,
  SignedOutScreen,
  UnreachableScreen,
} from "./components/state-screens"

export function App() {
  const screen = useApp((state) => state.screen)
  // Each step of a sign-in fades in, but for a button starting one.
  const step = useApp((state) =>
    state.signIn.phase === "starting" ? "choose" : state.signIn.phase,
  )
  switch (screen.name) {
    case "starting":
      // The shell answers in a moment; a blank window beats a flash.
      return <Frame screen="starting">{null}</Frame>
    case "no-shell":
      return (
        <Frame screen="no-shell" quit={false}>
          <NoShellScreen />
        </Frame>
      )
    case "failed":
      return (
        <Frame screen="failed">
          <FailedScreen />
        </Frame>
      )
    case "servers":
      return (
        <Frame screen="servers">
          <ServersScreen />
        </Frame>
      )
    case "signed-out":
      return (
        <Frame screen="signed-out">
          <SignedOutScreen server={screen.server} />
        </Frame>
      )
    case "unreachable":
      return (
        <Frame screen="unreachable">
          <UnreachableScreen server={screen.server} />
        </Frame>
      )
    case "sign-in":
      return (
        <Frame screen={`sign-in ${step} ${screen.url}`}>
          <SignInScreen url={screen.url} />
        </Frame>
      )
  }
}
