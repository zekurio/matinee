import type {
  Person,
  PersonCredit,
  TitleFilters,
  TitleKind,
  TitleSort,
  TitleSummary,
} from "@matinee/contracts"
import {
  ArrowUpDown,
  ChevronDown,
  Film,
  type IconNode,
  LibraryBig,
  ListFilter,
  RefreshCw,
  Tv,
} from "lucide"
import type { ComponentChildren } from "preact"
import { useEffect, useRef, useState } from "preact/hooks"

import { Page, type Start, useBackdrop } from "@/app/page"
import { useApp, useKept, useLoader, useTitlePages } from "@/app/scope"
import { session } from "@/auth/session"
import { plural, type StringKey, tr } from "@/i18n"
import { focused } from "@/input/focus"
import { reveal, scrollToStart } from "@/input/scroll"
import { cx, Spinner } from "@/kit/base"
import { Button } from "@/kit/buttons"
import { CaptionedPoster, Picture, PosterCard } from "@/kit/cards"
import { SearchField } from "@/kit/fields"
import { type FocusedItem, FocusLine } from "@/kit/misc"
import { OptionsPanel } from "@/kit/panel"
import { titleInfo } from "@/model/focused"
import { art, creditKind, initials } from "@/model/format"
import type { TitlePages } from "@/model/pages"

import { Loaded } from "./parts"

/* The pages that are a grid of posters, as the Android TV app's PosterGrid and `ui/tv/browse`. */

/** The key a grid's cards have in the page's focus memory. */
export const GRID = "grid"
/** The key a grid page's controls have in it. */
const CONTROLS = "controls"

/**
 * Cards in columns across a TV page, under the page's `header`. Left from
 * the first column goes to the drawer.
 *
 * The header shows while focus is in the first row or above it, and
 * collapses when focus goes below, so the grid has the screen to itself;
 * it comes back when focus returns to the first row. Wholphin does the
 * same. `line` stays: it's the line that names the focused card, for
 * grids whose cards have no caption.
 *
 * A focused card that's already in full view doesn't move the grid. One
 * that isn't scrolls the grid by whole rows, so no row is ever left cut
 * off at the top. `onNearEnd` runs while focus is in the last few rows,
 * to load the next page. `scrollKey` changing, as when the sort does,
 * scrolls back to the top. `footer` goes after the cards, for a spinner
 * or a notice.
 */
export function PosterGrid<T>(props: {
  items: readonly T[]
  keyOf: (item: T) => string
  columns?: number
  header?: ComponentChildren
  line?: ComponentChildren
  onNearEnd?: () => void
  scrollKey?: string
  footer?: ComponentChildren
  renderCard: (item: T, onFocus: () => void) => ComponentChildren
}) {
  const columns = props.columns ?? 7
  const scroller = useRef<HTMLDivElement>(null)
  // The row of the card that had focus last; -1 while the header has it.
  const [focusRow, setFocusRow] = useState(0)
  const shown = focusRow < 1
  const { items, onNearEnd, scrollKey } = props

  const first = useRef(true)
  useEffect(() => {
    if (first.current) first.current = false
    else scrollToStart(scroller.current)
  }, [scrollKey])

  const onCardFocus = (index: number) => {
    setFocusRow(Math.floor(index / columns))
    if (index >= items.length - columns * 3) onNearEnd?.()
  }
  // A short list never brings focus near its end, so it asks as it's drawn.
  useEffect(() => {
    if (items.length > 0 && items.length <= columns * 3) onNearEnd?.()
  }, [items.length])

  return (
    <>
      <div
        class={cx("grid-header", !shown && "away")}
        data-foff={shown ? undefined : ""}
        onFocusIn={() => setFocusRow(-1)}
        onTransitionEnd={(event) => {
          // The grid has more room, or less: put the focused card back in its place.
          const leaf = focused()
          if (event.target === event.currentTarget && leaf) reveal(leaf, false)
        }}
      >
        {props.header}
      </div>
      {/* Without the header, the line has the top to itself, clear of the clock. */}
      <div class={cx("grid-line", !shown && "alone")}>{props.line}</div>
      <div
        ref={scroller}
        class="grid-scroll"
        data-scroll="grid"
        data-scroll-start="20"
      >
        <div
          class="grid-cells"
          data-fg={GRID}
          data-fk="grid"
          style={{ "--columns": columns }}
        >
          {items.map((item, index) => (
            <div key={props.keyOf(item)} class="grid-cell">
              {props.renderCard(item, () => onCardFocus(index))}
            </div>
          ))}
        </div>
        {props.footer}
      </div>
    </>
  )
}

/** In the grid, spanning it: why it's empty, with a way to try again where there is one. */
function GridNotice(props: {
  headline: string
  message?: string | null
  onRetry?: () => void
  top: number
}) {
  return (
    <div style={{ paddingTop: `${props.top}rem` }}>
      <div class="t-title" style={{ color: "rgba(var(--fg-rgb), 0.9)" }}>
        {props.headline}
      </div>
      {props.message && (
        <div class="t-body muted" style={{ marginTop: "6rem" }}>
          {props.message}
        </div>
      )}
      {props.onRetry && (
        <div
          data-fg="notice"
          data-fk="row"
          style={{ display: "flex", marginTop: "20rem" }}
        >
          <Button
            fid="retry"
            label={tr("common_retry")}
            icon={RefreshCw}
            onPress={props.onRetry}
          />
        </div>
      )}
    </div>
  )
}

/**
 * A list of titles as a `PosterGrid` of posters under `header`, with the
 * focused poster's name and facts on the line between, loading the next
 * page as focus nears the end. While the first page loads it shows a
 * spinner; when that fails, why, with a way to try again; with no titles,
 * `empty`. Selecting a poster opens its title.
 */
function TitleGrid(props: {
  pages: TitlePages
  empty: string
  focusedItem: FocusedItem | null
  onFocus: (title: TitleSummary) => void
  header: ComponentChildren
  scrollKey?: string
}) {
  const { nav, viewer, actions } = useApp()
  const { pages } = props
  const none = pages.items.length === 0
  const footer = pages.error ? (
    <GridNotice
      headline={tr(none ? "tv_grid_failed" : "tv_grid_more_failed")}
      message={pages.error}
      onRetry={() => pages.more()}
      top={none ? 28 : 8}
    />
  ) : none && pages.done ? (
    <GridNotice headline={props.empty} top={28} />
  ) : none || pages.loading ? (
    <div class="center" style={{ padding: none ? "76rem 0 16rem" : "16rem 0" }}>
      <Spinner size={none ? 32 : 28} class="muted" />
    </div>
  ) : null
  return (
    <PosterGrid
      items={pages.items}
      keyOf={(title) => title.id}
      header={props.header}
      line={<FocusLine item={props.focusedItem} />}
      onNearEnd={() => pages.more()}
      scrollKey={props.scrollKey}
      footer={footer}
      renderCard={(title, onFocus) => (
        <PosterCard
          fid={title.id}
          name={title.name}
          poster={art(title.images.poster)}
          watched={viewer.isWatched(title)}
          onPress={() => nav.title(title.id)}
          onMenu={() => actions.open({ kind: "title", title })}
          onFocus={() => {
            onFocus()
            props.onFocus(title)
          }}
        />
      )}
    />
  )
}

/**
 * The top of a grid page: its `title` with `detail` after it, like a
 * count, and a row of controls under them.
 */
function GridHeader(props: {
  title: string
  detail: string | null
  children: ComponentChildren
}) {
  return (
    <div class="grid-head">
      <div class="grid-head-title">
        <span class="t-headline one-line">{props.title}</span>
        {props.detail && <span class="t-facts muted">{props.detail}</span>}
      </div>
      <div class="grid-controls" data-fg={CONTROLS} data-fk="row">
        {props.children}
      </div>
    </div>
  )
}

/** A library's orders, in the order the sort offers them, each with its name. */
const SORTS: readonly (readonly [TitleSort, StringKey])[] = [
  ["name", "library_sort_name"],
  ["recent", "library_sort_recent"],
  ["year", "library_sort_year"],
]

/** How long typing has to pause before a grid's search asks the server. */
const SEARCH_DEBOUNCE_MS = 250

/** Every filter off, but for the genres given. */
function genreFilters(genres: string[], studios: string[] = []): TitleFilters {
  return {
    genres,
    studios,
    yearFrom: null,
    yearTo: null,
    scoreMin: null,
    scoreMax: null,
    movieRating: null,
    showRating: null,
    language: null,
    runtimeMin: null,
    runtimeMax: null,
    watched: null,
  }
}

/** What a grid page starts focus on: its first title, or its controls when it has none. */
function gridStart(pages: TitlePages, control: string): Start | null {
  const first = pages.items[0]
  if (first) return [GRID, first.id]
  // Nothing to show: the controls, so the drawer and the filters are still in reach.
  return pages.done || pages.error !== null ? [CONTROLS, control] : null
}

/**
 * Every movie or every show on a TV, from all libraries together: the
 * drawer's Movies and Shows. The name and count, the sort, the genre
 * filter, and a search sit in a row at the top, which steps aside while
 * focus is below the first row of posters, the focused title's name and
 * facts under them, and the titles as a grid of posters, the focused
 * one's backdrop behind the page. The sort and the genre open a panel at
 * the right; the server sorts, filters, and searches.
 */
export function KindPage(props: { kind: TitleKind }) {
  const { kind } = props
  const api = session.api
  const shows = kind === "show"
  const [sort, setSort] = useKept("sort", "name")
  const [genre, setGenre] = useKept("genre", "")
  const [query, setQuery] = useKept("query", "")
  // Waits for a pause in typing before asking the server.
  const [settled, setSettled] = useKept("settled", "")
  useEffect(() => {
    const timer = window.setTimeout(
      () => setSettled(query.trim()),
      SEARCH_DEBOUNCE_MS,
    )
    return () => window.clearTimeout(timer)
  }, [query])
  const order = SORTS.find(([value]) => value === sort) ?? SORTS[0]
  const pages = useTitlePages(
    `kind-${kind}-${sort}-${genre}-${settled}`,
    (offset, limit) =>
      api.titles.browse({
        kind,
        sort: order?.[0] ?? "name",
        query: settled || undefined,
        filters: genreFilters(genre ? [genre] : []),
        limit,
        offset,
      }),
  )
  const genres = useLoader(
    `genres-kind-${kind}`,
    async () => (await api.titles.facets({ kind })).genres,
  )
  const [focusedItem, setFocusedItem] = useState<FocusedItem | null>(null)
  const [panel, setPanel] = useState<"sort" | "genre" | null>(null)
  useBackdrop(focusedItem?.backdrop ?? [])
  // Another order or filter: the line named a title that may have moved or gone.
  const listKey = `${sort}-${genre}-${settled}`
  useEffect(() => setFocusedItem(null), [listKey])

  const empty = settled
    ? tr(shows ? "library_no_match_shows" : "library_no_match_movies", settled)
    : genre
      ? tr(
          shows
            ? "library_no_filter_match_shows"
            : "library_no_filter_match_movies",
        )
      : tr(shows ? "library_none_shows" : "library_none_movies")

  return (
    <Page class="page fill grid-page" start={() => gridStart(pages, "sort")}>
      <TitleGrid
        pages={pages}
        empty={empty}
        focusedItem={focusedItem}
        onFocus={(title) => setFocusedItem(titleInfo(title, { genres: true }))}
        scrollKey={listKey}
        header={
          <GridHeader
            title={tr(shows ? "browse_kind_show" : "browse_kind_movie")}
            detail={
              pages.total === null
                ? null
                : plural("browse_title_count", pages.total)
            }
          >
            <Button
              fid="sort"
              label={tr(order?.[1] ?? "library_sort_name")}
              icon={ArrowUpDown}
              trailing={ChevronDown}
              onPress={() => setPanel("sort")}
            />
            <Button
              fid="genre"
              label={genre || tr("library_any_genre")}
              icon={ListFilter}
              trailing={ChevronDown}
              active={genre !== ""}
              onPress={() => setPanel("genre")}
            />
            <div style={{ width: "300rem" }}>
              <SearchField
                fid="search"
                value={query}
                onChange={setQuery}
                placeholder={tr(
                  shows ? "library_search_shows" : "library_search_movies",
                )}
                clearLabel={tr("library_clear_search")}
              />
            </div>
          </GridHeader>
        }
      />
      <OptionsPanel
        open={panel === "sort"}
        title={tr("library_sort")}
        options={SORTS.map(([value, label]) => ({
          key: value,
          label: tr(label),
        }))}
        current={sort}
        onPick={(picked) => {
          setSort(picked)
          setPanel(null)
        }}
        onClose={() => setPanel(null)}
      />
      <OptionsPanel
        open={panel === "genre"}
        title={tr("library_genre")}
        options={[
          { key: "", label: tr("library_any_genre") },
          ...(genres.value ?? []).map((facet) => ({
            key: facet.name,
            label: facet.name,
            detail: String(facet.titleCount),
          })),
        ]}
        current={genre}
        onPick={(picked) => {
          setGenre(picked)
          setPanel(null)
        }}
        onClose={() => setPanel(null)}
        loading={genres.state.kind === "loading"}
      />
    </Page>
  )
}

/** A genre's or a studio's page's choice of kind: movies, shows, or both. */
const BROWSE_KINDS: readonly (readonly [string, StringKey, IconNode])[] = [
  ["all", "browse_kind_all", LibraryBig],
  ["movie", "browse_kind_movie", Film],
  ["show", "browse_kind_show", Tv],
]

/**
 * A genre's or a studio's titles from every library on a TV: its name,
 * the phone's choice of movies, shows, or both as buttons, and the titles
 * as a grid of posters.
 */
export function BrowsePage(props: { genre?: string; studio?: string }) {
  const { genre, studio } = props
  const api = session.api
  const [kind, setKind] = useKept("kind", "all")
  const picked: TitleKind | undefined =
    kind === "movie" ? "movie" : kind === "show" ? "show" : undefined
  const pages = useTitlePages(
    `browse-${genre}-${studio}-${kind}`,
    (offset, limit) =>
      api.titles.browse({
        kind: picked,
        filters: genreFilters(genre ? [genre] : [], studio ? [studio] : []),
        limit,
        offset,
      }),
  )
  const [focusedItem, setFocusedItem] = useState<FocusedItem | null>(null)
  useBackdrop(focusedItem?.backdrop ?? [])
  useEffect(() => setFocusedItem(null), [kind])
  const detail = [
    tr(genre ? "browse_genre" : "browse_studio"),
    pages.total === null ? null : plural("browse_title_count", pages.total),
  ]
    .filter(Boolean)
    .join("  ·  ")
  return (
    <Page class="page fill grid-page" start={() => gridStart(pages, kind)}>
      <TitleGrid
        pages={pages}
        empty={tr(genre ? "browse_genre_empty" : "browse_studio_empty")}
        focusedItem={focusedItem}
        onFocus={(title) =>
          setFocusedItem(
            titleInfo(title, { kind: picked === undefined, genres: true }),
          )
        }
        scrollKey={kind}
        header={
          <GridHeader title={genre ?? studio ?? ""} detail={detail}>
            {BROWSE_KINDS.map(([value, label, icon]) => (
              <Button
                key={value}
                fid={value}
                label={tr(label)}
                icon={icon}
                active={kind === value}
                onPress={() => setKind(value)}
              />
            ))}
          </GridHeader>
        }
      />
    </Page>
  )
}

/** Someone in the cast or crew on a TV, and everything they're in. */
export function PersonPage(props: { name: string; tmdbId?: string }) {
  const person = useLoader(`person-${props.name}`, () =>
    session.api.people.get({ name: props.name, tmdbId: props.tmdbId }),
  )
  return (
    <Loaded
      load={person.state}
      error={tr("person_load_failed")}
      retry={() => person.reload()}
    >
      {(loaded) => <PersonView person={loaded} />}
    </Loaded>
  )
}

const creditKey = (credit: PersonCredit) => `${credit.title.id}-${credit.kind}`

/**
 * The person's photo, name, job, and how many titles they're in, then
 * those titles as a grid of posters, each with their role in it. The
 * header steps aside while focus is below the first row. The focused
 * title's backdrop goes behind the page.
 */
function PersonView(props: { person: Person }) {
  const { person } = props
  const { nav, viewer, actions } = useApp()
  const [focusedCredit, setFocusedCredit] = useState<PersonCredit | null>(null)
  const backdrop = art(focusedCredit?.title.images.backdrop, "large")
  useBackdrop(backdrop ? [backdrop] : [])
  const photo = art(person.photo, "small")
  const first = person.credits[0]
  return (
    <Page
      class="page fill grid-page"
      start={() => (first ? [GRID, creditKey(first)] : undefined)}
    >
      <PosterGrid
        items={person.credits}
        keyOf={creditKey}
        columns={6}
        header={
          <div class="person-head">
            <span
              class="avatar center t-headline"
              style={{ width: "120rem", height: "120rem" }}
            >
              {initials(person.name)}
              {photo && <Picture sources={[photo]} />}
            </span>
            <div>
              <div class="t-hero one-line">{person.name}</div>
              <div class="t-facts dim85" style={{ marginTop: "6rem" }}>
                {[
                  creditKind(person.kind, 1),
                  plural("browse_title_count", person.titleCount),
                ].join("  ·  ")}
              </div>
            </div>
          </div>
        }
        renderCard={(credit, onFocus) => (
          <CaptionedPoster
            fid={creditKey(credit)}
            name={credit.title.name}
            poster={art(credit.title.images.poster)}
            detail={
              credit.role ??
              (credit.title.year === null
                ? creditKind(credit.kind, 1)
                : String(credit.title.year))
            }
            watched={viewer.isWatched(credit.title)}
            onPress={() => nav.title(credit.title.id)}
            onMenu={() => actions.open({ kind: "title", title: credit.title })}
            onFocus={() => {
              onFocus()
              setFocusedCredit(credit)
            }}
          />
        )}
      />
    </Page>
  )
}
