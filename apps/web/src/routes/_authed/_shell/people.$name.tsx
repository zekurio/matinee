import {
  CREDIT_KINDS,
  type CreditKind,
  type Person,
  type PersonCatalogCredit,
  type PersonCredit,
  TitleKind,
} from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
import { buttonVariants } from "@matinee/ui/components/button"
import { Skeleton } from "@matinee/ui/components/skeleton"
import { cn } from "@matinee/ui/lib/utils"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { CloudOffIcon } from "lucide-react"
import { useId } from "react"

import { kindCounts, KindPicker } from "@/components/browse/kind-picker"
import { CatalogCard } from "@/components/catalog/catalog-card"
import {
  liveEntry,
  refKey,
  useLiveAvailability,
} from "@/components/catalog/catalog-data"
import { creditLabel, PersonPortrait, unitList } from "@/components/credits"
import { useOnScreenCards } from "@/components/discover/discover-live"
import { PosterGridSkeleton } from "@/components/library/library-states"
import { PosterCard, posterGrid } from "@/components/media-item"
import { useDocumentTitle } from "@/components/page-header"
import { PhoneTopBar } from "@/components/phone-nav"
import { HeaderOverview } from "@/components/title/header-overview"
import { tr } from "@/i18n"
import { formatDate, parseDay } from "@/lib/format"
import { reloadOnEnter } from "@/lib/route-loading"
import { errorMessage, orpc } from "@/lib/rpc"

/** Both kinds is the default, so the URL leaves it out. */
const PersonSearch = t.object({
  kind: TitleKind.optional().catch(undefined),
  /** The person at TMDB, from a TMDB title's credit. */
  tmdb: t.number().int().min(1).optional().catch(undefined),
})

export const Route = createFileRoute("/_authed/_shell/people/$name")({
  validateSearch: PersonSearch,
  loaderDeps: ({ search: { tmdb } }) => ({ tmdb }),
  // Starts the person's fetch while the page's code loads, and on hover.
  shouldReload: reloadOnEnter,
  loader: ({ context: { queryClient }, params: { name }, deps: { tmdb } }) => {
    void queryClient.prefetchQuery(personOptions(name, tmdb))
  },
  component: PersonPage,
})

function personOptions(name: string, tmdb: number | undefined) {
  return orpc.people.get.queryOptions({
    input: tmdb ? { name, tmdbId: String(tmdb) } : { name },
  })
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
 * Someone from the cast or crew: who they are, then what they're in
 * across the libraries, a section for each kind of credit, then their
 * other titles at TMDB, to request.
 */
function PersonPage() {
  return (
    <>
      <PhoneTopBar home />
      <PersonContent />
    </>
  )
}

function PersonContent() {
  const { name } = Route.useParams()
  const { tmdb } = Route.useSearch()
  const person = useQuery(personOptions(name, tmdb))
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
  const counts = kindCounts([
    ...titles,
    ...person.catalog.map((c) => ({ kind: c.ref.kind })),
  ])
  // A kind they have nothing of would leave the page empty with no chip
  // to undo it.
  const shownKind = kind && counts[kind] > 0 ? kind : undefined
  const shown = shownKind
    ? person.credits.filter((c) => c.title.kind === shownKind)
    : person.credits
  const profile = person.profile
  const biography = profile?.biography ?? null
  // The biography and the picker sit under the name, beside the portrait
  // from sm up.
  const below = biography !== null || (counts.movie > 0 && counts.show > 0)

  return (
    <div className="flex flex-col gap-10">
      <header className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-5 gap-y-4 sm:gap-x-6">
        <PersonPortrait
          name={person.name}
          photo={person.photo}
          eager
          className={cn(
            "size-20 text-2xl shadow-lg shadow-black/40 sm:size-28 sm:text-3xl",
            below && "sm:row-span-2",
            biography && "sm:self-start",
          )}
        />
        <div className="min-w-0">
          <h1 className="text-26px md:text-32px leading-8 font-semibold tracking-tight text-balance break-words md:leading-10">
            {person.name}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {profile
              ? profileLine(profile)
              : `${unitList().format(kinds.map((k) => creditLabel(k)))} · ${tr(
                  "people.titleCount",
                  { count: person.titleCount },
                )}`}
          </p>
        </div>
        {below && (
          <div className="col-span-2 min-w-0 sm:col-span-1 sm:col-start-2">
            {biography && (
              <HeaderOverview
                name={person.name}
                overview={biography}
                fit={false}
              />
            )}
            <KindPicker
              counts={counts}
              value={shownKind}
              onChange={(next) =>
                void navigate({
                  search: (prev) => ({ ...prev, kind: next }),
                  replace: true,
                  resetScroll: false,
                })
              }
              className={biography ? "mt-4" : undefined}
            />
          </div>
        )}
      </header>
      {kinds.map((k) => (
        <CreditSection
          key={k}
          kind={k}
          credits={shown.filter((c) => c.kind === k)}
        />
      ))}
      <CatalogSection
        credits={
          shownKind
            ? person.catalog.filter((c) => c.ref.kind === shownKind)
            : person.catalog
        }
        stale={person.stale}
      />
    </div>
  )
}

/** "Acting · Born Sep 2, 1964", each part TMDB knows. */
function profileLine(profile: NonNullable<Person["profile"]>): string {
  const day = (value: string | null) => {
    const date = value ? parseDay(value) : null
    return date ? formatDate(date) : null
  }
  const born = day(profile.birthday)
  const died = day(profile.deathday)
  return [
    profile.knownFor && tr(`people.department.${profile.knownFor}`),
    born && tr("people.born", { date: born }),
    died && tr("people.died", { date: died }),
  ]
    .filter(Boolean)
    .join(" · ")
}

/**
 * Their titles at TMDB that aren't here, as catalog cards to request,
 * with the part or job under each. The stream follows the cards on
 * screen.
 */
function CatalogSection({
  credits,
  stale,
}: {
  credits: PersonCatalogCredit[]
  stale: boolean
}) {
  const id = useId()
  const { track, start, end } = useOnScreenCards()
  const live = useLiveAvailability(
    credits.slice(start, end).map((c) => ({ ref: c.ref })),
  )
  if (credits.length === 0) return null
  return (
    <section aria-labelledby={id}>
      <h2
        id={id}
        className="mb-3 flex items-baseline gap-2 text-xl font-semibold tracking-tight"
      >
        {tr("catalog.notHere")}
        <span className="text-muted-foreground text-sm font-normal">
          {tr("people.titleCount", { count: credits.length })}
        </span>
      </h2>
      {stale && (
        <p className="text-muted-foreground mb-4 flex items-center gap-2 text-sm">
          <CloudOffIcon aria-hidden className="size-4 shrink-0" />
          {tr("discover.stale")}
        </p>
      )}
      <ul className={posterGrid}>
        {credits.map((c, index) => (
          <li key={refKey(c.ref)} ref={track(index)}>
            <CatalogCard
              title={c}
              availability={liveEntry(live, c.ref)?.availability}
              detail={[c.year, c.role].filter(Boolean).join(" · ")}
            />
          </li>
        ))}
      </ul>
    </section>
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
