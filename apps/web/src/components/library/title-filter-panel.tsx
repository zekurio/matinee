import {
  NO_TITLE_FILTERS,
  type RatingSystem,
  type TitleFilterOptions,
  type TitleFilters,
  type TitleKind,
  WATCH_STATES,
} from "@matinee/contracts"

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
import { tr } from "@/i18n"
import { formatRegion, formatRuntime, formatScore } from "@/lib/format"
import { languageName } from "@/lib/languages"

import type { ActiveFilter } from "./list-controls"
import { titleFilterCount } from "./title-filter-params"

/*
 * A list of titles' filters, in the panel Discover's browse has: where
 * the viewer is with them, genres, studios, release year, score, age
 * rating, original language and runtime, each from what the server says
 * the list's titles carry.
 */

type Change = (patch: Partial<TitleFilters>) => void

/** How many studios show before the field that finds the rest. */
const STUDIOS_SHOWN = 10

/**
 * The filters in use as chips, each taking its own off. A range is one
 * chip; so is each genre and studio.
 */
export function activeTitleFilters(
  filters: TitleFilters,
  options: TitleFilterOptions,
  change: Change,
): ActiveFilter[] {
  const active: ActiveFilter[] = []
  if (filters.watched !== null) {
    active.push({
      key: "watched",
      label: tr(`filters.watch.${filters.watched}`),
      remove: () => change({ watched: null }),
    })
  }
  for (const name of filters.genres) {
    active.push({
      key: `genre:${name}`,
      label: name,
      remove: () =>
        change({ genres: filters.genres.filter((other) => other !== name) }),
    })
  }
  for (const name of filters.studios) {
    active.push({
      key: `studio:${name}`,
      label: name,
      remove: () =>
        change({ studios: filters.studios.filter((other) => other !== name) }),
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
  // With one kind of title, "Rated up to"; with both, which kind.
  const both = options.ratings.length > 1
  if (filters.movieRating) {
    const { rating } = filters.movieRating
    active.push({
      key: "movieRating",
      label: both
        ? tr("filters.chip.movieRating", { rating })
        : tr("filters.chip.rating", { rating }),
      remove: () => change({ movieRating: null }),
    })
  }
  if (filters.showRating) {
    const { rating } = filters.showRating
    active.push({
      key: "showRating",
      label: both
        ? tr("filters.chip.showRating", { rating })
        : tr("filters.chip.rating", { rating }),
      remove: () => change({ showRating: null }),
    })
  }
  if (filters.language !== null) {
    active.push({
      key: "language",
      label: languageName(filters.language),
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

/** The Filter button and what it opens, with a list of titles' fields. */
export function TitleFilterPanel({
  kind,
  options,
  filters,
  change,
  open,
  onOpenChange,
  compact = false,
}: {
  /** The kind of every title in the list, if they're all one. */
  kind: TitleKind | undefined
  options: TitleFilterOptions
  filters: TitleFilters
  change: Change
  open: boolean
  onOpenChange: (open: boolean) => void
  compact?: boolean
}) {
  const { ratings, watched } = options
  return (
    <FilterPanel
      active={titleFilterCount(filters)}
      onClear={() => change(NO_TITLE_FILTERS)}
      open={open}
      onOpenChange={onOpenChange}
      compact={compact}
    >
      {options.total > 0 && (
        <Section label={tr("filters.progress")}>
          {(labelId) => (
            <ChoiceChips
              labelId={labelId}
              choices={WATCH_STATES.map((state) => ({
                value: state,
                label: tr(`filters.watch.${state}`),
                count: watched[state],
              }))}
              value={filters.watched}
              onChange={(next) => change({ watched: next })}
            />
          )}
        </Section>
      )}
      {options.genres.length > 0 && (
        <Section label={tr("filters.genres")}>
          {(labelId) => (
            <ToggleChips
              labelId={labelId}
              choices={options.genres.map((facet) => ({
                value: facet.name,
                label: facet.name,
                count: facet.titleCount,
              }))}
              value={filters.genres}
              onChange={(genres) => change({ genres })}
            />
          )}
        </Section>
      )}
      {options.studios.length > 0 && (
        <Section label={tr("filters.studios")}>
          {(labelId) => (
            <ToggleChips
              labelId={labelId}
              choices={options.studios.map((facet) => ({
                value: facet.name,
                label: facet.name,
                count: facet.titleCount,
              }))}
              value={filters.studios}
              onChange={(studios) => change({ studios })}
              limit={STUDIOS_SHOWN}
              find={{
                placeholder: tr("filters.findStudio"),
                empty: tr("filters.noStudio"),
              }}
            />
          )}
        </Section>
      )}
      {options.years && (
        <RangeField
          label={tr("filters.years")}
          range={options.years}
          value={[filters.yearFrom, filters.yearTo]}
          words={yearWords}
          format={String}
          onCommit={([yearFrom, yearTo]) => change({ yearFrom, yearTo })}
        />
      )}
      {options.scores && (
        <RangeField
          label={tr("filters.score")}
          hint={tr("filters.scoreHint")}
          range={options.scores}
          value={[filters.scoreMin, filters.scoreMax]}
          words={(bounds) => scoreWords(bounds)}
          format={formatScore}
          onCommit={([scoreMin, scoreMax]) => change({ scoreMin, scoreMax })}
        />
      )}
      {ratings.length > 0 && (
        <Section
          label={tr("filters.rating")}
          hint={
            ratings.length === 1 && ratings[0]
              ? tr("filters.ratingHint", {
                  country: formatRegion(ratings[0].country),
                })
              : tr("filters.ratingHintBoth")
          }
        >
          {(labelId) =>
            ratings.length === 1 && ratings[0] ? (
              <RatingChips
                labelId={labelId}
                system={ratings[0]}
                filters={filters}
                change={change}
              />
            ) : (
              <div className="flex flex-col gap-3">
                {ratings.map((system) => (
                  <RatingRow
                    key={system.kind}
                    system={system}
                    filters={filters}
                    change={change}
                  />
                ))}
              </div>
            )
          }
        </Section>
      )}
      {options.languages.length > 1 && (
        <Section label={tr("filters.language")}>
          {(labelId) => (
            <OptionSelect
              labelId={labelId}
              any={tr("filters.anyLanguage")}
              choices={options.languages.map((entry) => ({
                value: entry.language,
                label: languageName(entry.language),
                count: entry.titleCount,
              }))}
              value={filters.language}
              onChange={(language) => change({ language })}
            />
          )}
        </Section>
      )}
      {options.runtime && (
        <RuntimeField
          range={options.runtime}
          // A show's runtime is an episode's.
          hint={tr(`filters.runtimeHint.${kind ?? "both"}`)}
          filters={filters}
          change={change}
        />
      )}
    </FilterPanel>
  )
}

function RuntimeField({
  range,
  hint,
  filters,
  change,
}: {
  range: NonNullable<TitleFilterOptions["runtime"]>
  hint: string | undefined
  filters: TitleFilters
  change: Change
}) {
  return (
    <RangeField
      label={tr("filters.runtime")}
      hint={hint}
      range={range}
      value={[filters.runtimeMin, filters.runtimeMax]}
      words={(bounds) => runtimeWords(bounds)}
      format={(minutes) => formatRuntime(minutes) ?? "0"}
      onCommit={([runtimeMin, runtimeMax]) =>
        change({ runtimeMin, runtimeMax })
      }
    />
  )
}

/** One kind's ratings as "up to" chips, "Any" first. */
function RatingChips({
  labelId,
  system,
  filters,
  change,
}: {
  labelId: string
  system: RatingSystem
  filters: TitleFilters
  change: Change
}) {
  const field = system.kind === "movie" ? "movieRating" : "showRating"
  return (
    <ChoiceChips
      labelId={labelId}
      choices={system.ratings.map((entry) => ({
        value: entry.rating,
        label: entry.rating,
      }))}
      value={filters[field]?.rating ?? null}
      onChange={(rating) => {
        const limit =
          rating === null ? null : { country: system.country, rating }
        change(
          field === "movieRating"
            ? { movieRating: limit }
            : { showRating: limit },
        )
      }}
    />
  )
}

/** A kind's ratings under its own small heading, where there are both kinds. */
function RatingRow({
  system,
  filters,
  change,
}: {
  system: RatingSystem
  filters: TitleFilters
  change: Change
}) {
  return (
    <Section
      label={tr(`filters.ratingRow.${system.kind}`, {
        country: formatRegion(system.country),
      })}
      small
    >
      {(labelId) => (
        <RatingChips
          labelId={labelId}
          system={system}
          filters={filters}
          change={change}
        />
      )}
    </Section>
  )
}
