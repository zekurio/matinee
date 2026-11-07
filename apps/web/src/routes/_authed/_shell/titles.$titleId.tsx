import { createFileRoute } from "@tanstack/react-router"

import { TitlePage } from "@/components/title/title-page"

export const Route = createFileRoute("/_authed/_shell/titles/$titleId")({
  component: TitlePage,
})
