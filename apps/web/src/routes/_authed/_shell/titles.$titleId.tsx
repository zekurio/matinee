import { createFileRoute } from "@tanstack/react-router"

import { TitlePage } from "@/components/title/title-page"
import { orpc } from "@/lib/rpc"

export const Route = createFileRoute("/_authed/_shell/titles/$titleId")({
  // Starts the title's fetch while the page's code loads, and on hover.
  loader: ({ context, params }) => {
    void context.queryClient.prefetchQuery(
      orpc.titles.get.queryOptions({ input: { id: params.titleId } }),
    )
  },
  component: TitlePage,
})
