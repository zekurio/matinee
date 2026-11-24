import type { Credit, CreditKind, Title } from "@matinee/contracts"
import { Link } from "@tanstack/solid-router"
import { createMemo, For, Show } from "solid-js"

import { textLink } from "@/components/media-item"
import { Picture, tone } from "@/components/picture"
import { Rail } from "@/components/rail"
import { perLocale, tr } from "@/i18n"
import { art } from "@/lib/media"

const crewKinds = ["creator", "director", "writer"] satisfies CreditKind[]
const maxNames = 3
const conjunctionList = perLocale(
  (locale) => new Intl.ListFormat(locale, { type: "conjunction" }),
)
export const unitList = perLocale(
  (locale) => new Intl.ListFormat(locale, { type: "unit", style: "short" }),
)

function PersonLink(props: { name: string }) {
  return (
    <Link to="/people/$name" params={{ name: props.name }} class={textLink}>
      {props.name}
    </Link>
  )
}

export function CrewFacts(props: {
  title: Pick<Title, "credits" | "studios">
}) {
  const groups = createMemo(() =>
    crewKinds
      .map((kind) => ({
        kind,
        names: props.title.credits
          .filter((person) => person.kind === kind)
          .map((person) => person.name),
      }))
      .filter((group) => group.names.length > 0),
  )
  const studios = createMemo(() => props.title.studios.slice(0, 2))
  return (
    <Show when={groups().length || studios().length}>
      <dl class="flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <For each={groups()} keyed={(group) => group.kind}>
          {(group) => (
            <div class="flex min-w-0 gap-2">
              <dt class="text-muted-foreground shrink-0">
                {tr(`people.credit.${group().kind}`, {
                  count: group().names.length,
                })}
              </dt>
              <dd class="text-foreground/85 min-w-0">
                <CrewNames names={group().names} />
              </dd>
            </div>
          )}
        </For>
        <Show when={studios().length}>
          <div class="flex min-w-0 gap-2">
            <dt class="text-muted-foreground shrink-0">
              {tr("people.studio", { count: studios().length })}
            </dt>
            <dd class="text-foreground/85">
              {conjunctionList().format(studios())}
            </dd>
          </div>
        </Show>
      </dl>
    </Show>
  )
}

function CrewNames(props: { names: string[] }) {
  const parts = createMemo(() => {
    const count = props.names.length
    const shown = props.names.slice(0, maxNames)
    if (count > maxNames)
      shown.push(tr("people.more", { count: count - maxNames }))
    return conjunctionList().formatToParts(shown)
  })
  return (
    <For each={parts()} keyed={false}>
      {(part, index) => (
        <Show
          when={part().type === "element" && index < maxNames * 2 - 1}
          fallback={part().value}
        >
          <PersonLink name={part().value} />
        </Show>
      )}
    </For>
  )
}

function initials(name: string) {
  const words = name.split(/\s+/).filter(Boolean)
  return [words[0], words.length > 1 ? words.at(-1) : undefined]
    .map((word) => (word ? Array.from(word)[0] : ""))
    .join("")
    .toUpperCase()
}

export function CastRail(props: { credits: Credit[] }) {
  const cast = createMemo(() =>
    props.credits.filter((credit) => credit.kind === "actor"),
  )
  return (
    <Show when={cast().length}>
      <Rail title={tr("people.cast")}>
        <For each={cast()} keyed={false}>
          {(person) => (
            <li class="w-24 shrink-0 snap-start sm:w-28 lg:w-32">
              <Link
                to="/people/$name"
                params={{ name: person().name }}
                class="group focus-visible:ring-ring focus-visible:ring-offset-background block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              >
                <figure class="text-center">
                  <span
                    class={[
                      "group-hover:border-foreground/25 relative grid aspect-square place-items-center overflow-hidden rounded-full border text-xl",
                      tone(person().name),
                    ]}
                  >
                    <span
                      aria-hidden="true"
                      class="text-muted-foreground font-medium"
                    >
                      {initials(person().name)}
                    </span>
                    <Show when={art(person().photo, "small")}>
                      {(photo) => (
                        <Picture sources={[photo()]} class="object-[50%_20%]" />
                      )}
                    </Show>
                  </span>
                  <figcaption class="mt-2.5 px-1">
                    <span class="line-clamp-2 text-sm font-medium text-balance">
                      {person().name}
                    </span>
                    <Show when={person().role}>
                      <span class="text-muted-foreground text-13px mt-0.5 line-clamp-2 text-balance">
                        {person().role}
                      </span>
                    </Show>
                  </figcaption>
                </figure>
              </Link>
            </li>
          )}
        </For>
      </Rail>
    </Show>
  )
}
