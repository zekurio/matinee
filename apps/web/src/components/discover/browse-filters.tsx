import type { CatalogFilters, TitleKind } from "@matinee/contracts"

import {
  ChoiceChips,
  FilterPanel,
  OptionSelect,
  RangeField,
  Section,
  ToggleChips,
} from "@/components/filters/filter-panel"
import {
  RUNTIME_CHIP,
  runtimeWords,
  SCORE_CHIP,
  scoreWords,
  yearWords,
} from "@/components/filters/ranges"
import type { ActiveFilter } from "@/components/library/list-controls"
import { tr } from "@/i18n"
import {
  formatCount,
  formatRegion,
  formatRuntime,
  formatScore,
} from "@/lib/format"

import { type BrowseOptions, filterCount, NO_FILTERS } from "./browse-params"

/*
 * A browse's filters: whether to list only the viewer's
 * recommendations, what's coming soon, or what can be asked for, then
 * genres, release year, user score, votes, age rating, original language
 * and runtime, all from what the server offers, in the panel the
 * libraries share.
 */

/**
 * The filters in use as chips, each taking its own off. A range is one
 * chip; so is each genre.
 */
export function activeFilters(
  filters: CatalogFilters,
  options: BrowseOptions,
  change: (patch: Partial<CatalogFilters>) => void,
): ActiveFilter[] {
  const active: ActiveFilter[] = []
  if (filters.recommended) {
    active.push({
      key: "recommended",
      label: tr("discover.browse.recommended"),
      remove: () => change({ recommended: false }),
    })
  }
  if (filters.upcoming) {
    active.push({
      key: "upcoming",
      label: tr("discover.browse.upcoming"),
      remove: () => change({ upcoming: false }),
    })
  }
  if (filters.requestable) {
    active.push({
      key: "requestable",
      label: tr("discover.browse.requestable"),
      remove: () => change({ requestable: false }),
    })
  }
  for (const id of filters.genres) {
    const genre = options.genres.find((entry) => entry.id === id)
    if (!genre) continue
    active.push({
      key: `genre:${id}`,
      label: genre.name,
      remove: () =>
        change({ genres: filters.genres.filter((other) => other !== id) }),
    })
  }
  if (filters.yearFrom !== null || filters.yearTo !== null) {
    active.push({
      key: "years",
      label: yearWords([filters.yearFrom, filters.yearTo]),
      remove: () => change({ yearFrom: null, yearTo: null }),
    })
  }
  if (filters.scoreMin !== null || filters.scoreMax !== null) {
    active.push({
      key: "score",
      label: scoreWords([filters.scoreMin, filters.scoreMax], SCORE_CHIP),
      remove: () => change({ scoreMin: null, scoreMax: null }),
    })
  }
  if (filters.votesMin !== null) {
    active.push({
      key: "votes",
      label: tr("discover.browse.chip.votes", { count: filters.votesMin }),
      remove: () => change({ votesMin: null }),
    })
  }
  if (filters.rating !== null) {
    active.push({
      key: "rating",
      label: tr("filters.chip.rating", { rating: filters.rating }),
      remove: () => change({ rating: null }),
    })
  }
  if (filters.language !== null) {
    const language = options.languages.find(
      (entry) => entry.id === filters.language,
    )
    active.push({
      key: "language",
      label: language?.name ?? filters.language,
      remove: () => change({ language: null }),
    })
  }
  if (filters.runtimeMin !== null || filters.runtimeMax !== null) {
    active.push({
      key: "runtime",
      label: runtimeWords(
        [filters.runtimeMin, filters.runtimeMax],
        RUNTIME_CHIP,
      ),
      remove: () => change({ runtimeMin: null, runtimeMax: null }),
    })
  }
  return active
}

/** The Filter button and what it opens, with Discover's fields. */
export function BrowseFilterPanel({
  kind,
  options,
  filters,
  change,
  open,
  onOpenChange,
  compact = false,
}: {
  kind: TitleKind
  options: BrowseOptions
  filters: CatalogFilters
  change: (patch: Partial<CatalogFilters>) => void
  open: boolean
  onOpenChange: (open: boolean) => void
  compact?: boolean
}) {
  const ratings = options.ratings
  const genres = new Map(
    options.genres.map((genre) => [String(genre.id), genre.id]),
  )
  const only = [
    ...(filters.recommended ? ["recommended"] : []),
    ...(filters.upcoming ? ["upcoming"] : []),
    ...(filters.requestable ? ["requestable"] : []),
  ]
  return (
    <FilterPanel
      active={filterCount(filters)}
      onClear={() => change(NO_FILTERS)}
      open={open}
      onOpenChange={onOpenChange}
      compact={compact}
    >
      <Section
        label={tr("discover.browse.only")}
        hint={tr("discover.browse.onlyHint")}
      >
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
            value={only}
            onChange={(next) =>
              change({
                recommended: next.includes("recommended"),
                upcoming: next.includes("upcoming"),
                requestable: next.includes("requestable"),
              })
            }
          />
        )}
      </Section>
      {options.genres.length > 0 && (
        <Section label={tr("filters.genres")}>
          {(labelId) => (
            <ToggleChips
              labelId={labelId}
              choices={options.genres.map((genre) => ({
                value: String(genre.id),
                label: genre.name,
              }))}
              value={filters.genres.map(String)}
              onChange={(next) =>
                change({
                  genres: next.flatMap((id) => {
                    const genre = genres.get(id)
                    return genre === undefined ? [] : [genre]
                  }),
                })
              }
            />
          )}
        </Section>
      )}
      <RangeField
        label={tr("filters.years")}
        range={options.years}
        value={[filters.yearFrom, filters.yearTo]}
        words={yearWords}
        format={String}
        onCommit={([yearFrom, yearTo]) => change({ yearFrom, yearTo })}
      />
      <RangeField
        label={tr("filters.score")}
        hint={tr("discover.browse.scoreHint")}
        range={options.scores}
        value={[filters.scoreMin, filters.scoreMax]}
        words={(bounds) => scoreWords(bounds)}
        format={formatScore}
        onCommit={([scoreMin, scoreMax]) => change({ scoreMin, scoreMax })}
      />
      {options.votes.length > 0 && (
        <Section label={tr("discover.browse.votes")}>
          {(labelId) => (
            <ChoiceChips
              labelId={labelId}
              choices={options.votes.map((count) => ({
                value: count,
                label: tr("discover.browse.votesStep", {
                  count: formatCount(count),
                }),
              }))}
              value={filters.votesMin}
              onChange={(votesMin) => change({ votesMin })}
            />
          )}
        </Section>
      )}
      {ratings && (
        <Section
          label={tr("filters.rating")}
          hint={tr("filters.ratingHint", {
            country: formatRegion(ratings.country),
          })}
        >
          {(labelId) => (
            <ChoiceChips
              labelId={labelId}
              choices={ratings.ratings.map((rating) => ({
                value: rating,
                label: rating,
              }))}
              value={filters.rating}
              onChange={(rating) => change({ rating })}
            />
          )}
        </Section>
      )}
      {options.languages.length > 0 && (
        <Section label={tr("filters.language")}>
          {(labelId) => (
            <OptionSelect
              labelId={labelId}
              any={tr("filters.anyLanguage")}
              choices={options.languages.map((entry) => ({
                value: entry.id,
                label: entry.name,
              }))}
              value={filters.language}
              onChange={(language) => change({ language })}
            />
          )}
        </Section>
      )}
      <RangeField
        label={tr("filters.runtime")}
        hint={tr(`filters.runtimeHint.${kind}`)}
        range={options.runtime}
        value={[filters.runtimeMin, filters.runtimeMax]}
        words={(bounds) => runtimeWords(bounds)}
        format={(minutes) =>
          minutes >= options.runtime.max
            ? tr("filters.highest")
            : (formatRuntime(minutes) ?? "0")
        }
        onCommit={([runtimeMin, runtimeMax]) =>
          change({ runtimeMin, runtimeMax })
        }
      />
    </FilterPanel>
  )
}
