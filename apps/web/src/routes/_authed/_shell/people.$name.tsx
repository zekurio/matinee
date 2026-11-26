import {
  CREDIT_KINDS,
  type CreditKind,
  type Person,
  type PersonCatalogCredit,
  type PersonCredit,
  TitleKind,
} from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
import { cn } from "@matinee/ui/lib/utils"
import { useQuery } from "@tanstack/solid-query"
import { createFileRoute, Link } from "@tanstack/solid-router"
import { CloudOff } from "lucide"
import { createMemo, createUniqueId, For, Show } from "solid-js"

import { pageGutter } from "@/components/app-shell"
import { kindCounts, KindPicker } from "@/components/browse/kind-picker"
import { CatalogCard } from "@/components/catalog/catalog-card"
import {
  liveEntry,
  refKey,
  useLiveAvailability,
} from "@/components/catalog/catalog-data"
import { creditLabel, PersonPortrait, unitList } from "@/components/credits"
import { useOnScreenCards } from "@/components/discover/discover-live"
import {
  posterGrid,
  PosterGridSkeleton,
} from "@/components/library/library-states"
import { PosterCard } from "@/components/media-item"
import { useDocumentTitle } from "@/components/page-header"
import { PhoneTopBar } from "@/components/phone-nav"
import { HeaderOverview } from "@/components/title/header-overview"
import { tr } from "@/i18n"
import { buttonVariants } from "@/kit/button"
import { Icon } from "@/kit/icon"
import { Skeleton } from "@/kit/skeleton"
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
  const present = new Set(person.credits.map((credit) => credit.kind))
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
    <div class={[pageGutter, "sm:pt-8"]}>
      <PhoneTopBar home />
      <PersonContent />
    </div>
  )
}

function PersonContent() {
  const params = Route.useParams()
  const search = Route.useSearch()
  const person = useQuery(() => personOptions(params().name, search().tmdb))
  useDocumentTitle(() => params().name)

  return (
    <Show when={!person.isPending} fallback={<PersonSkeleton />}>
      <Show
        when={person.isSuccess && person.data}
        fallback={
          <div class="py-24 text-center">
            <h1 class="text-2xl font-semibold tracking-tight">
              {tr("people.loadError", { name: params().name })}
            </h1>
            <p class="text-muted-foreground mt-2 text-sm">
              {errorMessage(person.error)}
            </p>
            <Link
              to="/"
              class={buttonVariants({
                variant: "outline",
                className: "mt-6",
              })}
            >
              {tr("people.backHome")}
            </Link>
          </div>
        }
      >
        {(current) => <PersonDetails person={current()} />}
      </Show>
    </Show>
  )
}

function PersonDetails(props: { person: Person }) {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const kinds = createMemo(() => creditKinds(props.person))
  const counts = createMemo(() => {
    // Each title once, however many kinds of credit it gives them.
    const titles = new Map(
      props.person.credits.map((credit) => [credit.title.id, credit.title]),
    )
    return kindCounts([
      ...titles.values(),
      ...props.person.catalog.map((credit) => ({ kind: credit.ref.kind })),
    ])
  })
  // A kind they have nothing of would leave the page empty with no chip
  // to undo it.
  const shownKind = () => {
    const kind = search().kind
    return kind && counts()[kind] > 0 ? kind : undefined
  }
  const shown = createMemo(() => {
    const kind = shownKind()
    return kind
      ? props.person.credits.filter((credit) => credit.title.kind === kind)
      : props.person.credits
  })
  const catalog = createMemo(() => {
    const kind = shownKind()
    return kind
      ? props.person.catalog.filter((credit) => credit.ref.kind === kind)
      : props.person.catalog
  })
  const summary = () => {
    const profile = props.person.profile
    if (profile) return profileLine(profile)
    const credited = unitList().format(kinds().map((kind) => creditLabel(kind)))
    return `${credited} · ${tr("people.titleCount", { count: props.person.titleCount })}`
  }
  const biography = () => props.person.profile?.biography ?? null
  // The biography and the picker sit under the name, beside the portrait
  // from sm up.
  const below = () =>
    biography() !== null || (counts().movie > 0 && counts().show > 0)

  return (
    <div class="flex flex-col gap-10">
      <header class="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-5 gap-y-4 sm:gap-x-6">
        <PersonPortrait
          name={props.person.name}
          photo={props.person.photo}
          eager
          class={cn(
            "size-20 text-2xl shadow-lg shadow-black/40 sm:size-28 sm:text-3xl",
            below() && "sm:row-span-2",
            biography() && "sm:self-start",
          )}
        />
        <div class="min-w-0">
          <h1 class="text-26px md:text-32px leading-8 font-semibold tracking-tight text-balance break-words md:leading-10">
            {props.person.name}
          </h1>
          <p class="text-muted-foreground mt-1 text-sm">{summary()}</p>
        </div>
        <Show when={below()}>
          <div class="col-span-2 min-w-0 sm:col-span-1 sm:col-start-2">
            <Show when={biography()}>
              {(text) => <HeaderOverview tagline={null} overview={text()} />}
            </Show>
            <KindPicker
              counts={counts()}
              value={shownKind()}
              onChange={(kind) =>
                void navigate({
                  search: (prev) => ({ ...prev, kind }),
                  replace: true,
                  resetScroll: false,
                })
              }
              class={biography() ? "mt-4" : undefined}
            />
          </div>
        </Show>
      </header>
      <For each={kinds()}>
        {(kind) => (
          <CreditSection
            kind={kind}
            credits={shown().filter((credit) => credit.kind === kind)}
          />
        )}
      </For>
      <CatalogSection credits={catalog()} stale={props.person.stale} />
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
function CatalogSection(props: {
  credits: PersonCatalogCredit[]
  stale: boolean
}) {
  const id = createUniqueId()
  const cards = useOnScreenCards()
  const live = useLiveAvailability(() =>
    props.credits
      .slice(cards.start(), cards.end())
      .map((credit) => ({ ref: credit.ref })),
  )
  return (
    <Show when={props.credits.length > 0}>
      <section aria-labelledby={id}>
        <h2
          id={id}
          class="mb-3 flex items-baseline gap-2 text-xl font-semibold tracking-tight"
        >
          {tr("catalog.notHere")}
          <span class="text-muted-foreground text-sm font-normal">
            {tr("people.titleCount", { count: props.credits.length })}
          </span>
        </h2>
        <Show when={props.stale}>
          <p class="text-muted-foreground mb-4 flex items-center gap-2 text-sm">
            <Icon icon={CloudOff} aria-hidden="true" class="size-4 shrink-0" />
            {tr("discover.stale")}
          </p>
        </Show>
        <ul class={posterGrid}>
          <For each={props.credits} keyed={(credit) => refKey(credit.ref)}>
            {(credit, index) => (
              <li ref={cards.track(index)}>
                <CatalogCard
                  title={credit()}
                  availability={liveEntry(live(), credit().ref)?.availability}
                  detail={[credit().year, credit().role]
                    .filter(Boolean)
                    .join(" · ")}
                />
              </li>
            )}
          </For>
        </ul>
      </section>
    </Show>
  )
}

/** One kind of credit as a poster grid, with the part or job under each. */
function CreditSection(props: { kind: CreditKind; credits: PersonCredit[] }) {
  const id = createUniqueId()
  return (
    <Show when={props.credits.length > 0}>
      <section aria-labelledby={id}>
        <h2
          id={id}
          class="mb-3 flex items-baseline gap-2 text-xl font-semibold tracking-tight"
        >
          {tr(`people.section.${props.kind}`)}
          <span class="text-muted-foreground text-sm font-normal">
            {tr("people.titleCount", { count: props.credits.length })}
          </span>
        </h2>
        <ul class={posterGrid}>
          <For each={props.credits} keyed={(credit) => credit.title.id}>
            {(credit) => (
              <li>
                <PosterCard
                  title={credit().title}
                  detail={[credit().title.year, credit().role]
                    .filter(Boolean)
                    .join(" · ")}
                />
              </li>
            )}
          </For>
        </ul>
      </section>
    </Show>
  )
}

function PersonSkeleton() {
  return (
    <div class="flex flex-col gap-10">
      <div class="flex items-center gap-5 sm:gap-6">
        <Skeleton class="size-20 shrink-0 rounded-full sm:size-28" />
        <div class="flex-1">
          <Skeleton class="h-9 w-56" />
          <Skeleton class="mt-3 h-4 w-40" />
        </div>
      </div>
      <PosterGridSkeleton />
    </div>
  )
}
