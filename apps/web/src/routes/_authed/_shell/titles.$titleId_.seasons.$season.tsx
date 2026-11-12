import { createFileRoute } from "@tanstack/react-router"

import { SeasonPage } from "@/components/title/season-page"
import { parseSeasonParam } from "@/components/title/seasons"
import {
  seasonItemsOptions,
  titleOptions,
} from "@/components/title/title-queries"

// Beside the title's route rather than inside it, so it gets its own page.
export const Route = createFileRoute(
  "/_authed/_shell/titles/$titleId_/seasons/$season",
)({
  // Starts the show and the season's episodes together while the page's
  // code loads, and on hover.
  loader: ({ context: { queryClient }, params }) => {
    void queryClient.prefetchQuery(titleOptions(params.titleId))
    const season = parseSeasonParam(params.season)
    if (season === undefined) return
    void queryClient.prefetchQuery(seasonItemsOptions(params.titleId, season))
  },
  component: SeasonPage,
})
