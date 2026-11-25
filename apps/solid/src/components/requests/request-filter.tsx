import {
  REQUEST_STATES,
  type RequestState,
  TITLE_KINDS,
  TitleKind,
} from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"

import {
  ChoiceChips,
  FilterPanel,
  Section,
  ToggleChips,
} from "@/components/filters/filter-panel"
import { tr } from "@/i18n"

/*
 * What a list of requests is kept to, as the URL holds it, so a filtered
 * list can be linked and reloaded: `?state=waiting,here&kind=show`. The
 * server does the keeping, by the same rule the cards' badges read.
 * Anything the URL says that isn't a state or a kind is dropped.
 */

export const RequestSearch = t.object({
  /** States, comma separated, in any order. */
  state: t.string().max(120).optional().catch(undefined),
  kind: TitleKind.optional().catch(undefined),
})
export type RequestSearch = t.infer<typeof RequestSearch>

/** A list's filter, as `requests.mine` and the queue take it. */
export type RequestFilter = {
  states: RequestState[]
  kind?: TitleKind
}

/** The filter the URL asks for, the states in the badges' order. */
export function requestFilter(search: RequestSearch): RequestFilter {
  const named = new Set((search.state ?? "").split(","))
  return {
    states: REQUEST_STATES.filter((state) => named.has(state)),
    kind: search.kind,
  }
}

/** The search params for `filter`, leaving out what's off. */
export function searchFor(filter: RequestFilter): RequestSearch {
  return {
    state: filter.states.length ? filter.states.join(",") : undefined,
    kind: filter.kind,
  }
}

/** How many filters are on: each state, and the kind. */
export function filterCount(filter: RequestFilter): number {
  return filter.states.length + Number(filter.kind !== undefined)
}

/**
 * The Filter button and its panel for a list of requests: the states, any
 * number of them on, with the badges' words, and movies or shows. None on
 * lists everything.
 */
export function RequestFilterPanel(props: {
  filter: RequestFilter
  onChange: (filter: RequestFilter) => void
  /** The icon the phone bar has room for. */
  compact?: boolean
}) {
  return (
    <FilterPanel
      active={filterCount(props.filter)}
      onClear={() => props.onChange({ states: [] })}
      compact={props.compact ?? false}
    >
      <Section label={tr("requests.filter.state")}>
        {(labelId) => (
          <ToggleChips
            labelId={labelId}
            choices={REQUEST_STATES.map((state) => ({
              value: state,
              label: tr(`requests.state.${state}`),
            }))}
            value={props.filter.states}
            onChange={(next) =>
              props.onChange({
                ...props.filter,
                states: REQUEST_STATES.filter((state) => next.includes(state)),
              })
            }
          />
        )}
      </Section>
      <Section label={tr("requests.filter.kind")}>
        {(labelId) => (
          <ChoiceChips
            labelId={labelId}
            choices={TITLE_KINDS.map((kind) => ({
              value: kind,
              label: tr(`browse.kind.${kind}`),
            }))}
            value={props.filter.kind ?? null}
            onChange={(kind) =>
              props.onChange({ ...props.filter, kind: kind ?? undefined })
            }
          />
        )}
      </Section>
    </FilterPanel>
  )
}
