import type {
  HomeRecommendationRail,
  RecommendationReason,
} from "@matinee/contracts"
import type { t } from "@matinee/contracts/schema"
import { useQuery } from "@tanstack/solid-query"
import { For, Show } from "solid-js"

import { railKey, railName } from "@/components/discover/discover-data"
import { tr } from "@/i18n"
import { enabledWhile, homeQueries } from "@/lib/home-queries"

import { PosterCard } from "./media-item"
import { holdRail, Rail, RailItem, type RailReveal } from "./rail"

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
 * out, so a new account's Home doesn't hold empty places for them, and
 * they never hold the rows around them.
 *
 * "Not interested" lives in the cards' menus, which come later.
 */
export function RecommendationRails(props: { reveal: RailReveal }) {
  const enabled = enabledWhile(() => props.reveal.showing())
  const recommendations = useQuery(() => ({
    ...homeQueries.recommendations(),
    enabled,
  }))
  const rails = () =>
    recommendations.isSuccess ? recommendations.data.rails : []
  return (
    <For each={rails()} keyed={(rail) => railKey(rail)}>
      {(rail) => (
        <Show when={rail().items.length > 0}>
          <RecommendationRail rail={rail()} reveal={props.reveal} />
        </Show>
      )}
    </For>
  )
}

function RecommendationRail(props: {
  rail: t.infer<typeof HomeRecommendationRail>
  reveal: RailReveal
}) {
  const hold = holdRail(props.reveal, () => props.rail.items)
  return (
    <Rail ref={hold.ref} title={railName(props.rail)}>
      <For each={hold.cards(props.rail.items)} keyed={(item) => item.title.id}>
        {(item) => (
          <RailItem artwork="poster">
            <PosterCard
              title={item().title}
              label={
                props.rail.id === "forYou"
                  ? `${item().title.name} · ${reasonLine(item().reason)}`
                  : item().title.name
              }
            />
          </RailItem>
        )}
      </For>
    </Rail>
  )
}
