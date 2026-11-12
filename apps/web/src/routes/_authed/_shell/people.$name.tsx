import {
  CREDIT_KINDS,
  type CreditKind,
  type Person,
  type PersonCredit,
  TitleKind,
} from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
import { buttonVariants } from "@matinee/ui/components/button"
import { Skeleton } from "@matinee/ui/components/skeleton"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { useId } from "react"

import { kindCounts, KindPicker } from "@/components/browse/kind-picker"
import { creditLabel, PersonPortrait, unitList } from "@/components/credits"
import { PosterGridSkeleton } from "@/components/library/library-states"
import { PosterCard, posterGrid } from "@/components/media-item"
import { useDocumentTitle } from "@/components/page-header"
import { tr } from "@/i18n"
import { errorMessage, orpc } from "@/lib/rpc"

/** Both kinds is the default, so the URL leaves it out. */
const PersonSearch = t.object({
  kind: TitleKind.optional().catch(undefined),
})

export const Route = createFileRoute("/_authed/_shell/people/$name")({
  validateSearch: PersonSearch,
  // Starts the person's fetch while the page's code loads, and on hover.
  loader: ({ context: { queryClient }, params: { name } }) => {
    void queryClient.prefetchQuery(personOptions(name))
  },
  component: PersonPage,
})

function personOptions(name: string) {
  return orpc.people.get.queryOptions({ input: { name } })
}

/** The kinds of credit someone has, what they're known for first. */
function creditKinds(person: Person): CreditKind[] {
  const present = new Set(person.credits.map((c) => c.kind))
  return [
    person.kind,
    ...CREDIT_KINDS.filter((kind) => kind !== person.kind),
  ].filter((kind) => present.has(kind))
}

/**
 * Someone from the cast or crew: their portrait, then what they're in
 * across the libraries, a section for each kind of credit.
 */
function PersonPage() {
  const { name } = Route.useParams()
  const person = useQuery(personOptions(name))
  useDocumentTitle(name)

  if (person.isPending) return <PersonSkeleton />
  if (!person.data) {
    return (
      <div className="py-24 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          {tr("people.loadError", { name })}
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          {errorMessage(person.error)}
        </p>
        <Link
          to="/"
          className={buttonVariants({
            variant: "secondary",
            className: "mt-6",
          })}
        >
          {tr("people.backHome")}
        </Link>
      </div>
    )
  }
  return <PersonDetails person={person.data} />
}

function PersonDetails({ person }: { person: Person }) {
  const { kind } = Route.useSearch()
  const navigate = Route.useNavigate()
  const kinds = creditKinds(person)
  // Each title once, however many kinds of credit it gives them.
  const titles = [
    ...new Map(person.credits.map((c) => [c.title.id, c.title])).values(),
  ]
  const counts = kindCounts(titles)
  // A kind they have nothing of would leave the page empty with no chip
  // to undo it.
  const shownKind = kind && counts[kind] > 0 ? kind : undefined
  const shown = shownKind
    ? person.credits.filter((c) => c.title.kind === shownKind)
    : person.credits

  return (
    <div className="flex flex-col gap-10">
      <header className="flex items-center gap-5 sm:gap-6">
        <PersonPortrait
          name={person.name}
          photo={person.photo}
          eager
          className="size-20 text-2xl shadow-lg shadow-black/40 sm:size-28 sm:text-3xl"
        />
        <div className="min-w-0 flex-1">
          <h1 className="text-[26px] leading-8 font-semibold tracking-tight text-balance break-words md:text-[32px] md:leading-10">
            {person.name}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {unitList().format(kinds.map((k) => creditLabel(k)))} ·{" "}
            {tr("people.titleCount", { count: person.titleCount })}
          </p>
          <KindPicker
            counts={counts}
            value={shownKind}
            onChange={(next) =>
              void navigate({
                search: { kind: next },
                replace: true,
                resetScroll: false,
              })
            }
            className="mt-4"
          />
        </div>
      </header>
      {kinds.map((k) => (
        <CreditSection
          key={k}
          kind={k}
          credits={shown.filter((c) => c.kind === k)}
        />
      ))}
    </div>
  )
}

/** One kind of credit as a poster grid, with the part or job under each. */
function CreditSection({
  kind,
  credits,
}: {
  kind: CreditKind
  credits: PersonCredit[]
}) {
  const id = useId()
  if (credits.length === 0) return null
  return (
    <section aria-labelledby={id}>
      <h2
        id={id}
        className="mb-3 flex items-baseline gap-2 text-xl font-semibold tracking-tight"
      >
        {tr(`people.section.${kind}`)}
        <span className="text-muted-foreground text-sm font-normal">
          {tr("people.titleCount", { count: credits.length })}
        </span>
      </h2>
      <ul className={posterGrid}>
        {credits.map((c) => (
          <li key={c.title.id}>
            <PosterCard
              title={c.title}
              detail={[c.title.year, c.role].filter(Boolean).join(" · ")}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}

function PersonSkeleton() {
  return (
    <div className="flex flex-col gap-10">
      <div className="flex items-center gap-5 sm:gap-6">
        <Skeleton className="size-20 shrink-0 rounded-full sm:size-28" />
        <div className="flex-1">
          <Skeleton className="h-9 w-56" />
          <Skeleton className="mt-3 h-4 w-40" />
        </div>
      </div>
      <PosterGridSkeleton />
    </div>
  )
}
