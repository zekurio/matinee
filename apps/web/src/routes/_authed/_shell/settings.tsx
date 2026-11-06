import { AUTH_ERROR_QUERY_KEY } from "@matinee/contracts"
import { createFileRoute, redirect } from "@tanstack/react-router"

// Settings is a dialog over the app, opened by the `settings` search param
// (see `_shell.tsx`). This address opens it over Home.
export const Route = createFileRoute("/_authed/_shell/settings")({
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/",
      search: {
        settings: "account",
        [AUTH_ERROR_QUERY_KEY]: search[AUTH_ERROR_QUERY_KEY],
      },
      replace: true,
    })
  },
})
