import type { RecommendationReason, RecommendedTitle } from "@matinee/contracts"
import type { t } from "@matinee/contracts/schema"
import { useQuery, useQueryClient } from "@tanstack/react-query"

import { refKey } from "@/components/catalog/catalog-data"
import { railName } from "@/components/discover/discover-data"
import { PosterCard } from "@/components/media-item"
import { Rail, RailItem } from "@/components/rail"
import { tr } from "@/i18n"
import { homeQueries } from "@/lib/home-queries"
import { useDismissedStore } from "@/stores/recommendations"

/** Why a title is recommended, as its card's tooltip says it. */
export function reasonLine(reason: RecommendationReason | null): string {
  switch (reason?.kind) {
    case "watched":
      return tr("discover.reason.watched", { name: reason.name ?? "" })
    case "person":
      return tr("discover.reason.person", { name: reason.name ?? "" })
    default:
      return tr("discover.reason.taste")
  }
}

/**
 * Home's recommendation rows, of titles on the server the viewer hasn't
 * watched: "Recommended for you", then a row or two of what's like
 * something they watched. Nothing shows until the server has worked them
 * out, so a new account's Home doesn't hold empty places for them.
 */
export function RecommendationRails() {
  const recommendations = useQuery(homeQueries.recommendations())
  const hidden = useDismissedStore((state) => state.hidden)
  const rails = recommendations.data?.rails ?? []
  return rails.map((rail) => {
    const items = rail.items.filter((item) => !hidden.has(refKey(item.ref)))
    if (items.length === 0) return null
    const key = rail.seed ? `${rail.id}:${refKey(rail.seed.ref)}` : rail.id
    return (
      <Rail key={key} title={railName({ id: rail.id, seed: rail.seed })}>
        {items.map((item) => (
          <RailItem key={item.title.id} artwork="poster">
            <RecommendedCard item={item} reason={rail.id === "forYou"} />
          </RailItem>
        ))}
      </Rail>
    )
  })
}

function RecommendedCard({
  item,
  reason,
}: {
  item: t.infer<typeof RecommendedTitle>
  /** Say why in the tooltip, where the row's heading doesn't. */
  reason: boolean
}) {
  const queryClient = useQueryClient()
  const dismiss = useDismissedStore((state) => state.dismiss)
  return (
    <PosterCard
      title={item.title}
      label={
        reason
          ? `${item.title.name} · ${reasonLine(item.reason)}`
          : item.title.name
      }
      dismiss={() => dismiss(queryClient, item.ref, item.title.name)}
    />
  )
}
