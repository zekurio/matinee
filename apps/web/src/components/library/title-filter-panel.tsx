import {
  NO_TITLE_FILTERS,
  type RatingSystem,
  type TitleFilterOptions,
  type TitleFilters,
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
  runtimeWords,
  scoreWords,
  yearWords,
} from "@/components/filters/ranges"
import { tr } from "@/i18n"
import { formatRegion, formatRuntime, formatScore } from "@/lib/format"
import { languageName } from "@/lib/languages"

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

/** The Filter button and what it opens, with a list of titles' fields. */
export function TitleFilterPanel({
  options,
  filters,
  change,
  open,
  onOpenChange,
  compact = false,
}: {
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
          filters={filters}
          change={change}
        />
      )}
    </FilterPanel>
  )
}

function RuntimeField({
  range,
  filters,
  change,
}: {
  range: NonNullable<TitleFilterOptions["runtime"]>
  filters: TitleFilters
  change: Change
}) {
  return (
    <RangeField
      label={tr("filters.runtime")}
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
