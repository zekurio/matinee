import type { CatalogFilters } from "@matinee/contracts"
import { createMemo, Show } from "solid-js"

import {
  type BrowseOptions,
  filterCount,
  NO_FILTERS,
} from "@/components/discover/browse-params"
import {
  ChoiceChips,
  FilterPanel,
  OptionSelect,
  RangeField,
  Section,
  ToggleChips,
} from "@/components/filters/filter-panel"
import {
  runtimeWords,
  scoreWords,
  yearWords,
} from "@/components/filters/ranges"
import { tr } from "@/i18n"
import {
  formatCount,
  formatRegion,
  formatRuntime,
  formatScore,
} from "@/lib/format"

/*
 * A browse's filters: whether to list only the viewer's
 * recommendations, what's coming soon, or what can be asked for, then
 * genres, release year, user score, votes, age rating, original language
 * and runtime, all from what the server offers, in the panel the
 * libraries share.
 */

/** The Filter button and what it opens, with Discover's fields. */
export function BrowseFilterPanel(props: {
  options: BrowseOptions
  filters: CatalogFilters
  change: (patch: Partial<CatalogFilters>) => void
  open: boolean
  onOpenChange: (open: boolean) => void
  compact?: boolean
}) {
  const genres = createMemo(
    () =>
      new Map(
        props.options.genres.map((genre) => [String(genre.id), genre.id]),
      ),
  )
  const only = () => [
    ...(props.filters.recommended ? ["recommended"] : []),
    ...(props.filters.upcoming ? ["upcoming"] : []),
    ...(props.filters.requestable ? ["requestable"] : []),
  ]
  return (
    <FilterPanel
      active={filterCount(props.filters)}
      onClear={() => props.change(NO_FILTERS)}
      open={props.open}
      onOpenChange={props.onOpenChange}
      compact={props.compact ?? false}
    >
      <Section label={tr("discover.browse.only")}>
        {(labelId) => (
          <ToggleChips
            labelId={labelId}
            choices={[
              {
                value: "recommended",
                label: tr("discover.browse.recommended"),
              },
              { value: "upcoming", label: tr("discover.browse.upcoming") },
              {
                value: "requestable",
                label: tr("discover.browse.requestable"),
              },
            ]}
            value={only()}
            onChange={(next) =>
              props.change({
                recommended: next.includes("recommended"),
                upcoming: next.includes("upcoming"),
                requestable: next.includes("requestable"),
              })
            }
          />
        )}
      </Section>
      <Show when={props.options.genres.length > 0}>
        <Section label={tr("filters.genres")}>
          {(labelId) => (
            <ToggleChips
              labelId={labelId}
              choices={props.options.genres.map((genre) => ({
                value: String(genre.id),
                label: genre.name,
              }))}
              value={props.filters.genres.map(String)}
              onChange={(next) =>
                props.change({
                  genres: next.flatMap((id) => {
                    const genre = genres().get(id)
                    return genre === undefined ? [] : [genre]
                  }),
                })
              }
            />
          )}
        </Section>
      </Show>
      <RangeField
        label={tr("filters.years")}
        range={props.options.years}
        value={[props.filters.yearFrom, props.filters.yearTo]}
        words={yearWords}
        format={String}
        onCommit={([yearFrom, yearTo]) => props.change({ yearFrom, yearTo })}
      />
      <RangeField
        label={tr("filters.score")}
        hint={tr("discover.browse.scoreHint")}
        range={props.options.scores}
        value={[props.filters.scoreMin, props.filters.scoreMax]}
        words={(bounds) => scoreWords(bounds)}
        format={formatScore}
        onCommit={([scoreMin, scoreMax]) =>
          props.change({ scoreMin, scoreMax })
        }
      />
      <Show when={props.options.votes.length > 0}>
        <Section label={tr("discover.browse.votes")}>
          {(labelId) => (
            <ChoiceChips
              labelId={labelId}
              choices={props.options.votes.map((count) => ({
                value: String(count),
                label: tr("discover.browse.votesStep", {
                  count: formatCount(count),
                }),
              }))}
              value={
                props.filters.votesMin === null
                  ? null
                  : String(props.filters.votesMin)
              }
              onChange={(votes) =>
                props.change({
                  votesMin: votes === null ? null : Number(votes),
                })
              }
            />
          )}
        </Section>
      </Show>
      <Show when={props.options.ratings}>
        {(ratings) => (
          <Section
            label={tr("filters.rating")}
            hint={tr("filters.ratingHint", {
              country: formatRegion(ratings().country),
            })}
          >
            {(labelId) => (
              <ChoiceChips
                labelId={labelId}
                choices={ratings().ratings.map((rating) => ({
                  value: rating,
                  label: rating,
                }))}
                value={props.filters.rating}
                onChange={(rating) => props.change({ rating })}
              />
            )}
          </Section>
        )}
      </Show>
      <Show when={props.options.languages.length > 0}>
        <Section label={tr("filters.language")}>
          {(labelId) => (
            <OptionSelect
              labelId={labelId}
              any={tr("filters.anyLanguage")}
              choices={props.options.languages.map((entry) => ({
                value: entry.id,
                label: entry.name,
              }))}
              value={props.filters.language}
              onChange={(language) => props.change({ language })}
            />
          )}
        </Section>
      </Show>
      <RangeField
        label={tr("filters.runtime")}
        range={props.options.runtime}
        value={[props.filters.runtimeMin, props.filters.runtimeMax]}
        words={(bounds) => runtimeWords(bounds)}
        format={(minutes) =>
          minutes >= props.options.runtime.max
            ? tr("filters.highest")
            : (formatRuntime(minutes) ?? "0")
        }
        onCommit={([runtimeMin, runtimeMax]) =>
          props.change({ runtimeMin, runtimeMax })
        }
      />
    </FilterPanel>
  )
}
