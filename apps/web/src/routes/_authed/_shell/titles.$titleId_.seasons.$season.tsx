import { createFileRoute } from "@tanstack/react-router"

import { SeasonPage } from "@/components/title/season-page"

// Beside the title's route rather than inside it, so it gets its own page.
export const Route = createFileRoute(
  "/_authed/_shell/titles/$titleId_/seasons/$season",
)({
  component: SeasonPage,
})
