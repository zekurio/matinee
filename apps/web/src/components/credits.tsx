import type { Artwork, Credit, CreditKind, Title } from "@matinee/contracts"
import { cn } from "@matinee/ui/lib/utils"
import { Link } from "@tanstack/react-router"
import { Fragment, type ReactNode } from "react"

import { perLocale, tr } from "@/i18n"
import { art } from "@/lib/media"

import { Picture, textLink, tone } from "./media-item"
import { Rail, RailItem } from "./rail"

// The hero names a few; the rest would crowd it.
const MAX_NAMES = 3

/** `Hayao Miyazaki` → `HM`, for a portrait that didn't load. */
function initials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean)
  const letters = [words[0], words.length > 1 ? words.at(-1) : undefined]
    .map((word) => (word ? Array.from(word)[0] : ""))
    .join("")
  return letters.toUpperCase()
}

/** What someone is credited as, like `Director`, or `Directors` for more. */
export function creditLabel(kind: CreditKind, count = 1): string {
  return tr(`people.credit.${kind}`, { count })
}

/** "A, B, and C", for names in running text. */
const conjunctionList = perLocale(
  (locale) => new Intl.ListFormat(locale, { type: "conjunction" }),
)

/** "A, B, C", for a list of tags or labels. */
export const unitList = perLocale(
  (locale) => new Intl.ListFormat(locale, { type: "unit", style: "short" }),
)

/**
 * Elements listed the way the language lists things, with its own commas
 * and "and": `format` comes from {@link conjunctionList} or {@link unitList}.
 */
export function listNodes(
  format: Intl.ListFormat,
  nodes: readonly ReactNode[],
): ReactNode {
  const parts = format.formatToParts(nodes.map((_, index) => String(index)))
  return parts.map((part, index) => (
    <Fragment key={index}>
      {part.type === "element" ? nodes[Number(part.value)] : part.value}
    </Fragment>
  ))
}

type Fact = { kind: "person" | "studio"; name: string }

/** A name in the facts, linking to the person's or the studio's page. */
function FactLink({ fact }: { fact: Fact }) {
  const className = cn(textLink, "hover:text-foreground")
  return fact.kind === "studio" ? (
    <Link
      to="/studios/$studio"
      params={{ studio: fact.name }}
      className={className}
    >
      {fact.name}
    </Link>
  ) : (
    <Link to="/people/$name" params={{ name: fact.name }} className={className}>
      {fact.name}
    </Link>
  )
}

/**
 * Who made the title and where, as label and names in one wrapping line:
 * creators, directors, writers, then studios. Each name opens its page.
 */
export function CrewFacts({
  title,
  className,
}: {
  /** A library title, or a catalog title's details. */
  title: Pick<Title, "credits" | "studios">
  className?: string
}) {
  const kinds = ["creator", "director", "writer"] satisfies CreditKind[]
  const groups: { label: string; facts: Fact[] }[] = kinds
    .map((kind) => {
      const people = title.credits.filter((c) => c.kind === kind)
      return {
        label: creditLabel(kind, people.length),
        facts: people.map((person): Fact => ({
          kind: "person",
          name: person.name,
        })),
      }
    })
    .filter((group) => group.facts.length > 0)
  const studios = title.studios.slice(0, 2)
  if (studios.length > 0) {
    groups.push({
      label: tr("people.studio", { count: studios.length }),
      facts: studios.map((name): Fact => ({ kind: "studio", name })),
    })
  }
  if (groups.length === 0) return null
  return (
    <dl
      className={cn(
        "flex max-w-4xl flex-wrap gap-x-6 gap-y-1 text-sm",
        className,
      )}
    >
      {groups.map((group) => (
        <div key={group.label} className="flex min-w-0 gap-2">
          <dt className="text-muted-foreground shrink-0">{group.label}</dt>
          <dd className="text-foreground/85 min-w-0">
            {listNodes(conjunctionList(), [
              ...group.facts
                .slice(0, MAX_NAMES)
                .map((fact) => <FactLink key={fact.name} fact={fact} />),
              ...(group.facts.length > MAX_NAMES
                ? [
                    <span key="more" className="text-muted-foreground">
                      {tr("people.more", {
                        count: group.facts.length - MAX_NAMES,
                      })}
                    </span>,
                  ]
                : []),
            ])}
          </dd>
        </div>
      ))}
    </dl>
  )
}

/** The actors, in billing order, as a row of round portraits. */
export function CastRail({ credits }: { credits: Credit[] }) {
  const cast = credits.filter((c) => c.kind === "actor")
  if (cast.length === 0) return null
  return (
    <Rail title={tr("people.cast")}>
      {cast.map((person, i) => (
        // The same actor can play two parts.
        <RailItem key={`${i}:${person.name}`} artwork="person">
          <PersonCard
            name={person.name}
            photo={person.photo}
            detail={person.role}
          />
        </RailItem>
      ))}
    </Rail>
  )
}

/**
 * A round portrait, or the person's initials on their tone while it loads
 * or when there's none. `className` sets the size and the initials' type.
 */
export function PersonPortrait({
  name,
  photo,
  eager = false,
  className,
}: {
  name: string
  photo: Artwork | null
  eager?: boolean
  className?: string
}) {
  const source = art(photo)
  return (
    <span
      className={cn(
        "relative grid aspect-square shrink-0 place-items-center overflow-hidden rounded-full border shadow-[inset_0_1px_0_rgb(255_255_255/0.04)]",
        tone(name),
        className,
      )}
    >
      <span
        aria-hidden
        className="text-muted-foreground font-medium tracking-wide"
      >
        {initials(name)}
      </span>
      {/* Headshots are portrait; keep the face, not the chest, in the circle. */}
      {source && (
        <Picture
          sources={[source]}
          eager={eager}
          className="object-[50%_20%]"
        />
      )}
    </span>
  )
}

/** Someone's portrait and name, opening their page. */
export function PersonCard({
  name,
  photo,
  detail,
}: {
  name: string
  photo: Artwork | null
  /** A line under the name, like the character. */
  detail?: string | null
}) {
  return (
    <Link
      to="/people/$name"
      params={{ name }}
      className="group focus-visible:ring-ring focus-visible:ring-offset-background block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
    >
      <figure className="flex flex-col items-center text-center">
        <PersonPortrait
          name={name}
          photo={photo}
          className="group-hover:border-foreground/25 w-full text-xl"
        />
        <figcaption className="mt-2.5 w-full px-1">
          <span className="line-clamp-2 text-sm leading-5 font-medium text-balance">
            {name}
          </span>
          {detail && (
            <span className="text-muted-foreground mt-0.5 line-clamp-2 text-[13px] leading-[1.125rem] text-balance">
              {detail}
            </span>
          )}
        </figcaption>
      </figure>
    </Link>
  )
}
