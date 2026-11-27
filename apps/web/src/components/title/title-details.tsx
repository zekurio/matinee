import type { Credit, CreditKind } from "@matinee/contracts"
import type { JSX } from "@solidjs/web"
import { Link } from "@tanstack/solid-router"
import { createMemo, For, Show } from "solid-js"

import {
  conjunctionList,
  CrewNames,
  crewKinds,
  unitList,
} from "@/components/credits"
import { textLink } from "@/components/media-item"
import { tr } from "@/i18n"
import { formatDate, formatDateRange, parseDay } from "@/lib/format"

/** The table's row of dates: its label, and the day or days worded. */
export type DetailDates = { label: string; value: string }

/** "Released" and the day, when there is one. */
export function releasedOn(day: string | null): DetailDates | null {
  const date = day ? parseDay(day) : null
  return date
    ? { label: tr("title.details.released"), value: formatDate(date) }
    : null
}

/**
 * "Aired" and the first day to the last, or the one day when they're the
 * same, from the episodes' air dates. Null when none has one.
 */
export function airedBetween(days: (string | null)[]): DetailDates | null {
  const dates = days
    .map((day) => (day ? parseDay(day) : null))
    .filter((date) => date !== null)
    .toSorted((a, b) => a.getTime() - b.getTime())
  const first = dates[0]
  const last = dates.at(-1)
  if (!first || !last) return null
  return {
    label: tr("title.details.aired"),
    value:
      first.getTime() === last.getTime()
        ? formatDate(first)
        : formatDateRange(first, last),
  }
}

/**
 * What the provider knows beyond the overview, a label and its value a
 * row: the genres, the crew, the studios, and when it came out. Rows
 * without a value are left out.
 */
export function TitleDetails(props: {
  genres: string[]
  studios: string[]
  credits: Credit[]
  /**
   * The crew kinds to list. A season or an episode lists only its show's
   * creators, as its own directors and writers aren't the show's.
   */
  crew?: CreditKind[]
  dates: DetailDates | null
}) {
  const crew = createMemo(() =>
    (props.crew ?? crewKinds)
      .map((kind) => ({
        kind,
        names: props.credits
          .filter((person) => person.kind === kind)
          .map((person) => person.name),
      }))
      .filter((group) => group.names.length > 0),
  )
  const genres = createMemo(() => unitList().formatToParts(props.genres))
  const any = () =>
    props.genres.length > 0 ||
    crew().length > 0 ||
    props.studios.length > 0 ||
    props.dates !== null
  return (
    <Show when={any()}>
      <dl class="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-6 gap-y-1.5 text-sm">
        <Show when={props.genres.length}>
          <Row
            label={tr("title.details.genres", { count: props.genres.length })}
          >
            <For each={genres()} keyed={false}>
              {(part) => (
                <Show when={part().type === "element"} fallback={part().value}>
                  <Link
                    to="/genres/$genre"
                    params={{ genre: part().value }}
                    class={textLink}
                  >
                    {part().value}
                  </Link>
                </Show>
              )}
            </For>
          </Row>
        </Show>
        <For each={crew()} keyed={(group) => group.kind}>
          {(group) => (
            <Row
              label={tr(`people.credit.${group().kind}`, {
                count: group().names.length,
              })}
            >
              <CrewNames names={group().names} />
            </Row>
          )}
        </For>
        <Show when={props.studios.length}>
          <Row label={tr("people.studio", { count: props.studios.length })}>
            {conjunctionList().format(props.studios)}
          </Row>
        </Show>
        <Show when={props.dates}>
          {(dates) => <Row label={dates().label}>{dates().value}</Row>}
        </Show>
      </dl>
    </Show>
  )
}

function Row(props: { label: string; children: JSX.Element }) {
  return (
    <>
      <dt class="text-muted-foreground">{props.label}</dt>
      <dd class="text-foreground/90 min-w-0 font-medium">{props.children}</dd>
    </>
  )
}
