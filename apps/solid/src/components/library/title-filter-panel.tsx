import {
  type Library,
  NO_TITLE_FILTERS,
  type RatingSystem,
  type TitleFilterOptions,
  type TitleFilters,
  type TitleKind,
  WATCH_STATES,
} from "@matinee/contracts"
import { For, Show } from "solid-js"

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
import { titleFilterCount } from "@/components/library/title-filter-params"
import { tr } from "@/i18n"
import { formatRegion, formatRuntime, formatScore } from "@/lib/format"
import { languageName } from "@/lib/languages"

type Change = (patch: Partial<TitleFilters>) => void

export function TitleFilterPanel(props: {
  options: TitleFilterOptions
  filters: TitleFilters
  change: Change
  compact: boolean
  /** Every library of this kind, when the page can narrow to one. */
  libraries?: Library[]
  libraryId?: string
  onLibraryChange?: (libraryId?: string) => void
  /** Movies, shows, or both, when the list can hold both. */
  kind?: TitleKind
  onKindChange?: (kind?: TitleKind) => void
  trigger?: "chip" | "button"
  align?: "start" | "end"
}) {
  return (
    <FilterPanel
      active={titleFilterCount(props.filters)}
      onClear={() => props.change(NO_TITLE_FILTERS)}
      compact={props.compact}
      trigger={props.trigger}
      align={props.align}
    >
      <Show when={props.onKindChange}>
        <Section label={tr("requests.filter.kind")}>
          {(labelId) => (
            <ChoiceChips
              labelId={labelId}
              anyLabel={tr("browse.kind.all")}
              choices={[
                { value: "movie", label: tr("browse.kind.movie") },
                { value: "show", label: tr("browse.kind.show") },
              ]}
              value={props.kind ?? null}
              onChange={(kind) => props.onKindChange?.(kind ?? undefined)}
            />
          )}
        </Section>
      </Show>
      <Show when={(props.libraries?.length ?? 0) > 1}>
        <Section label={tr("browse.library")}>
          {(labelId) => (
            <ChoiceChips
              labelId={labelId}
              anyLabel={tr("browse.library.all")}
              choices={(props.libraries ?? []).map((library) => ({
                value: library.id,
                label: library.name,
              }))}
              value={props.libraryId ?? null}
              onChange={(libraryId) =>
                props.onLibraryChange?.(libraryId ?? undefined)
              }
            />
          )}
        </Section>
      </Show>
      <Show when={props.options.total > 0}>
        <Section label={tr("filters.progress")}>
          {(labelId) => (
            <ChoiceChips
              labelId={labelId}
              choices={WATCH_STATES.map((state) => ({
                value: state,
                label: tr(`filters.watch.${state}`),
                count: props.options.watched[state],
              }))}
              value={props.filters.watched}
              onChange={(watched) => props.change({ watched })}
            />
          )}
        </Section>
      </Show>
      <Show when={props.options.genres.length > 0}>
        <Section label={tr("filters.genres")}>
          {(labelId) => (
            <ToggleChips
              labelId={labelId}
              choices={props.options.genres.map((facet) => ({
                value: facet.name,
                label: facet.name,
                count: facet.titleCount,
              }))}
              value={props.filters.genres}
              onChange={(genres) => props.change({ genres })}
            />
          )}
        </Section>
      </Show>
      <Show when={props.options.studios.length > 0}>
        <Section label={tr("filters.studios")}>
          {(labelId) => (
            <ToggleChips
              labelId={labelId}
              choices={props.options.studios.map((facet) => ({
                value: facet.name,
                label: facet.name,
                count: facet.titleCount,
              }))}
              value={props.filters.studios}
              onChange={(studios) => props.change({ studios })}
              find={{
                limit: 10,
                placeholder: tr("filters.findStudio"),
                empty: tr("filters.noStudio"),
              }}
            />
          )}
        </Section>
      </Show>
      <Show when={props.options.years}>
        {(range) => (
          <RangeField
            label={tr("filters.years")}
            range={range()}
            value={[props.filters.yearFrom, props.filters.yearTo]}
            words={yearWords}
            format={String}
            onCommit={([yearFrom, yearTo]) =>
              props.change({ yearFrom, yearTo })
            }
          />
        )}
      </Show>
      <Show when={props.options.scores}>
        {(range) => (
          <RangeField
            label={tr("filters.score")}
            hint={tr("filters.scoreHint")}
            range={range()}
            value={[props.filters.scoreMin, props.filters.scoreMax]}
            words={scoreWords}
            format={formatScore}
            onCommit={([scoreMin, scoreMax]) =>
              props.change({ scoreMin, scoreMax })
            }
          />
        )}
      </Show>
      <For each={props.options.ratings} keyed={(system) => system.kind}>
        {(system) => (
          <RatingField
            system={system()}
            filters={props.filters}
            change={(patch) => props.change(patch)}
          />
        )}
      </For>
      <Show when={props.options.languages.length > 1}>
        <Section label={tr("filters.language")}>
          {(labelId) => (
            <OptionSelect
              labelId={labelId}
              any={tr("filters.anyLanguage")}
              choices={props.options.languages.map((entry) => ({
                value: entry.language,
                label: languageName(entry.language),
                count: entry.titleCount,
              }))}
              value={props.filters.language}
              onChange={(language) => props.change({ language })}
            />
          )}
        </Section>
      </Show>
      <Show when={props.options.runtime}>
        {(range) => (
          <RangeField
            label={tr("filters.runtime")}
            range={range()}
            value={[props.filters.runtimeMin, props.filters.runtimeMax]}
            words={runtimeWords}
            format={(value) => formatRuntime(value) ?? "0"}
            onCommit={([runtimeMin, runtimeMax]) =>
              props.change({ runtimeMin, runtimeMax })
            }
          />
        )}
      </Show>
    </FilterPanel>
  )
}

function RatingField(props: {
  system: RatingSystem
  filters: TitleFilters
  change: Change
}) {
  const field = () =>
    props.system.kind === "movie" ? "movieRating" : "showRating"
  return (
    <Section
      label={tr("filters.rating")}
      hint={tr("filters.ratingHint", {
        country: formatRegion(props.system.country),
      })}
    >
      {(labelId) => (
        <ChoiceChips
          labelId={labelId}
          choices={props.system.ratings.map((entry) => ({
            value: entry.rating,
            label: entry.rating,
          }))}
          value={props.filters[field()]?.rating ?? null}
          onChange={(rating) => {
            const limit =
              rating === null ? null : { rating, country: props.system.country }
            props.change({ [field()]: limit })
          }}
        />
      )}
    </Section>
  )
}
