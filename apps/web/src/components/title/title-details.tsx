import type { Title } from "@matinee/contracts"
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
import { formatDate, parseDay } from "@/lib/format"

/**
 * What the provider knows beyond the overview, a label and its value a
 * row: the genres, the crew, the studios, and when it came out. Rows
 * without a value are left out.
 */
export function TitleDetails(props: {
  title: Pick<Title, "genres" | "credits" | "studios" | "releaseDate">
}) {
  const crew = createMemo(() =>
    crewKinds
      .map((kind) => ({
        kind,
        names: props.title.credits
          .filter((person) => person.kind === kind)
          .map((person) => person.name),
      }))
      .filter((group) => group.names.length > 0),
  )
  const released = createMemo(() => {
    const day = props.title.releaseDate && parseDay(props.title.releaseDate)
    return day ? formatDate(day) : null
  })
  const genres = createMemo(() => unitList().formatToParts(props.title.genres))
  const any = () =>
    props.title.genres.length > 0 ||
    crew().length > 0 ||
    props.title.studios.length > 0 ||
    released() !== null
  return (
    <Show when={any()}>
      <dl class="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-6 gap-y-1.5 text-sm">
        <Show when={props.title.genres.length}>
          <Row
            label={tr("title.details.genres", {
              count: props.title.genres.length,
            })}
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
        <Show when={props.title.studios.length}>
          <Row
            label={tr("people.studio", { count: props.title.studios.length })}
          >
            {conjunctionList().format(props.title.studios)}
          </Row>
        </Show>
        <Show when={released()}>
          {(day) => <Row label={tr("title.details.released")}>{day()}</Row>}
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
