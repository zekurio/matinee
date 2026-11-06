import { createFileRoute, redirect } from "@tanstack/react-router"

// Library management lives in the settings dialog (see `_shell.tsx`).
export const Route = createFileRoute("/_authed/_shell/admin/libraries")({
  beforeLoad: () => {
    throw redirect({
      to: "/",
      search: { settings: "libraries" },
      replace: true,
    })
  },
})
