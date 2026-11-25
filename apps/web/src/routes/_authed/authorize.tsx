import { APP_AUTHORIZE_PATH, AppAuthorizeRequest } from "@matinee/contracts"
import { isStaleRequest } from "@matinee/contracts/schema"
import { createFileRoute, useLocation } from "@tanstack/solid-router"
import { LogIn } from "lucide"
import { createMemo, createSignal, For, Show } from "solid-js"

import { AuthScreen, StatusScreen } from "@/components/auth-screen"
import { DeviceCard } from "@/components/device-card"
import { tr, translateKnown } from "@/i18n"
import { trRich } from "@/i18n/solid"
import { Button } from "@/kit/button"
import { Icon } from "@/kit/icon"

/**
 * Where an app sends someone to sign it in, in the system browser. The
 * query is the app's `AppAuthorizeRequest`. Approving posts it to the
 * server, which sends the browser back to the app with a code.
 */
export const Route = createFileRoute("/_authed/authorize")({
  component: AuthorizeApp,
})

function AuthorizeApp() {
  const context = Route.useRouteContext()
  // The raw query: the router would read a numeric `state` as a number.
  const query = useLocation({ select: (location) => location.searchStr })
  const request = createMemo(() =>
    AppAuthorizeRequest.safeParse(
      Object.fromEntries(new URLSearchParams(query())),
    ),
  )
  const [sent, setSent] = createSignal(false)

  const invalid = () => {
    const result = request()
    if (result.success) return null
    // A missing or unknown key reads "reload the page", which can't fix
    // the app's request, so only a problem with a value the app sent shows.
    const issue = result.error.issues.find((each) => !isStaleRequest(each))
    return { detail: issue && translateKnown(issue.message) }
  }
  const data = () => {
    const result = request()
    return result.success ? result.data : null
  }

  return (
    <Show
      when={data()}
      fallback={
        <StatusScreen
          title={tr("link.app.invalid")}
          description={tr("link.app.invalidDescription")}
          detail={invalid()?.detail}
        />
      }
    >
      {(app) => (
        <AuthScreen
          title={tr("link.app.title")}
          description={trRich("link.app.wants", {
            name: (
              <span class="text-foreground font-medium">
                {context().user.displayName ?? context().user.username}
              </span>
            ),
          })}
        >
          <div class="flex flex-col gap-4">
            <DeviceCard
              name={app().device_name || null}
              platform={app().platform}
            />
            {/* A form post, so other sites can't send it. The server answers
                with a redirect to the app's URI, which a fetch can't follow. */}
            <form
              method="post"
              action={APP_AUTHORIZE_PATH}
              class="flex"
              onSubmit={() => setSent(true)}
            >
              <For
                each={Object.entries(app()).filter(
                  (entry): entry is [string, string] => entry[1] !== undefined,
                )}
              >
                {([key, value]) => (
                  <input type="hidden" name={key} value={value} />
                )}
              </For>
              <Button type="submit" size="lg" class="flex-1">
                <Icon icon={LogIn} />
                {tr("link.app.signIn")}
              </Button>
            </form>
            <p class="text-muted-foreground text-13px leading-5">
              {sent() ? tr("link.app.sent") : tr("link.app.caution")}
            </p>
          </div>
        </AuthScreen>
      )}
    </Show>
  )
}
