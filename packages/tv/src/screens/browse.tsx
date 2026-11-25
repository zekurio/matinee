import type { Facet, SearchResults, TitleSummary } from "@matinee/contracts"
import { Heart, House, type IconNode, RefreshCw } from "lucide"
import { For, Match, Show, Switch, createEffect, createSignal } from "solid-js"

import { Page, type Start, useBackdrop } from "../app/page"
import {
  useApp,
  useKept,
  useLoader,
  usePage,
  useRefreshOnResume,
} from "../app/scope"
import { session } from "../auth/session"
import { plural, tr } from "../i18n"
import { Icon, Spinner } from "../kit/base"
import { Button } from "../kit/buttons"
import { LandscapeCard, PersonCard, PosterCard, Row } from "../kit/cards"
import { SearchField } from "../kit/fields"
import { type FocusedItem, FocusLine } from "../kit/misc"
import { itemInfo, seasonInfo, titleInfo } from "../model/focused"
import {
  art,
  creditKind,
  episodeCode,
  itemLabel,
  landscape,
  progressRatio,
  seasonName,
  timeLeft,
} from "../model/format"

/* Search and Favorites: rows of results under a line that names the focused one. */

const SEARCH_LIMIT = 40
/** How long typing has to pause before a search goes out. */
const SEARCH_DEBOUNCE_MS = 250

type Found = { text: string; results: SearchResults }

/** A result that names no title: a person, a genre, a studio. */
function plainInfo(name: string, facts: string[]): FocusedItem {
  return {
    name,
    logo: null,
    subtitle: null,
    facts,
    contentRating: null,
    rating: null,
    overview: null,
    backdrop: [],
  }
}

/** In place of the results: why there are none. */
function Hint(props: { headline: string; detail?: string }) {
  return (
    <div
      class="message"
      style={{ "padding-top": "40rem", "justify-content": "flex-start" }}
    >
      <div class="t-title" style={{ color: "rgba(var(--fg-rgb), 0.9)" }}>
        {props.headline}
      </div>
      {props.detail && (
        <div class="t-body muted" style={{ "margin-top": "6rem" }}>
          {props.detail}
        </div>
      )}
    </div>
  )
}

/**
 * Search on a TV: the field at the top, which takes the TV's keyboard on
 * Select, and the phone's results under it as rows, in the phone's order:
 * the titles of each library, cast and crew, genres, and studios. The
 * focused result's name and facts sit between them, its backdrop behind
 * the page. With no query, only the field, as on the phone.
 */
export function SearchPage() {
  const { nav, viewer, actions } = useApp()
  const { scope } = usePage()
  const [query, setQuery] = useKept("query", "")
  // The results are kept while the page is on the stack, so they're there when it comes back.
  const [found, setFound] = createSignal<Found | null>(scope.search)
  const [searching, setSearching] = createSignal(false)
  const [failed, setFailed] = createSignal(false)
  const libraries = useLoader("libraries", () => session.api.libraries.list())
  const names = () =>
    new Map(
      (libraries().value ?? []).map((library) => [library.id, library.name]),
    )
  const [focusedItem, setFocusedItem] = createSignal<FocusedItem | null>(null)
  useBackdrop(() => focusedItem()?.backdrop ?? [])
  const text = () => query().trim()

  createEffect(
    () => text(),
    (current) => {
      setFocusedItem(null)
      if (current === "") {
        setFound(null)
        return
      }
      // The same text's results are there already.
      const known = found()
      if (known?.text === current && !failed()) return
      let over = false
      const timer = window.setTimeout(() => {
        setSearching(true)
        setFailed(false)
        session.api.search.query({ query: current, limit: SEARCH_LIMIT }).then(
          (results) => {
            if (over) return
            const answer = { text: current, results }
            scope.search = answer
            setFound(answer)
            setSearching(false)
          },
          () => {
            if (over) return
            setFailed(true)
            setSearching(false)
          },
        )
      }, SEARCH_DEBOUNCE_MS)
      return () => {
        over = true
        window.clearTimeout(timer)
      }
    },
  )

  const results = () => found()?.results
  const byLibrary = () => {
    const grouped = new Map<string, TitleSummary[]>()
    for (const title of results()?.titles ?? []) {
      grouped.set(title.libraryId, [
        ...(grouped.get(title.libraryId) ?? []),
        title,
      ])
    }
    return grouped
  }
  const nothing = () => {
    const answer = results()
    return (
      answer !== undefined &&
      answer.titles.length === 0 &&
      answer.people.length === 0 &&
      answer.genres.length === 0 &&
      answer.studios.length === 0
    )
  }

  const facetRow = (
    name: string,
    title: string,
    facets: readonly Facet[],
    open: (facet: Facet) => void,
  ) => (
    <Show when={facets.length > 0}>
      <Row title={title} name={name} buttons>
        <For each={facets}>
          {(facet) => (
            <Button
              fid={facet.name}
              label={facet.name}
              onPress={() => open(facet)}
              onFocus={() =>
                setFocusedItem(
                  plainInfo(facet.name, [
                    plural("browseTitleCount", facet.titleCount),
                  ]),
                )
              }
            />
          )}
        </For>
      </Row>
    </Show>
  )

  return (
    <Page class="page fill grid-page" start={() => ["field", "field"]}>
      <div class="search-top" data-fg="field" data-fk="row">
        <div style={{ flex: 1, "max-width": "640rem" }}>
          <SearchField
            fid="field"
            value={query()}
            onChange={setQuery}
            placeholder={tr("searchField")}
            clearLabel={tr("searchClear")}
            height={56}
            large
          />
        </div>
        {searching() && results() && (
          <span class="t-caption muted" style={{ "margin-left": "20rem" }}>
            {tr("searchSearching")}
          </span>
        )}
      </div>
      {text() !== "" && (
        <div class="grid-line" style={{ "margin-top": "16rem" }}>
          <FocusLine item={focusedItem()} />
        </div>
      )}
      <Show when={text() !== ""}>
        <Switch>
          <Match when={failed()}>
            <Hint headline={tr("searchFailed")} />
          </Match>
          <Match when={results() === undefined}>
            <div class="center" style={{ "padding-top": "48rem" }}>
              <Spinner size={32} class="muted" />
            </div>
          </Match>
          <Match when={nothing()}>
            <Hint
              headline={tr("searchNoMatch", text())}
              detail={tr("searchNoMatchHint")}
            />
          </Match>
          <Match when={results()}>
            {(answer) => (
              <div class="rows-scroll" data-scroll="pin" data-scroll-pivot="48">
                <div class="rows" style={{ "padding-top": "8rem" }}>
                  <For each={[...byLibrary()]}>
                    {([libraryId, titles]) => (
                      <Row
                        name={`lib-${libraryId}`}
                        title={`${names().get(libraryId) ?? tr("searchTitlesHeading")}  ·  ${plural("browseTitleCount", titles.length)}`}
                      >
                        <For each={titles}>
                          {(title) => (
                            <PosterCard
                              fid={title.id}
                              name={title.name}
                              poster={art(title.images.poster)}
                              watched={viewer.isWatched(title)}
                              onPress={() => nav.title(title.id)}
                              onMenu={() =>
                                actions.open({ kind: "title", title })
                              }
                              onFocus={() =>
                                setFocusedItem(
                                  titleInfo(title, { genres: true }),
                                )
                              }
                            />
                          )}
                        </For>
                      </Row>
                    )}
                  </For>
                  <Show when={answer().people.length > 0}>
                    <Row title={tr("searchSectionCast")} name="people">
                      <For each={answer().people}>
                        {(person) => (
                          <PersonCard
                            fid={person.name}
                            name={person.name}
                            detail={null}
                            photo={art(person.photo, "thumb")}
                            onPress={() => nav.person(person.name)}
                            onFocus={() =>
                              setFocusedItem(
                                plainInfo(person.name, [
                                  creditKind(person.kind, 1),
                                  plural("browseTitleCount", person.titleCount),
                                ]),
                              )
                            }
                          />
                        )}
                      </For>
                    </Row>
                  </Show>
                  {facetRow(
                    "genres",
                    tr("searchSectionGenres"),
                    answer().genres,
                    (facet) => nav.genre(facet.name),
                  )}
                  {facetRow(
                    "studios",
                    tr("searchSectionStudios"),
                    answer().studios,
                    (facet) => nav.studio(facet.name),
                  )}
                </div>
              </div>
            )}
          </Match>
        </Switch>
      </Show>
    </Page>
  )
}

/** In place of the rows: what's wrong or missing, and one thing to do about it. */
function Notice(props: {
  headline: string
  detail?: string | null
  icon: IconNode
  action: string
  glyph?: IconNode
  onAction: () => void
}) {
  return (
    <div
      class="message"
      style={{ "padding-top": "24rem", "justify-content": "flex-start" }}
    >
      {props.glyph && <Icon icon={props.glyph} size={40} class="muted" />}
      <div
        class="t-headline"
        style={{ "margin-top": props.glyph ? "18rem" : 0 }}
      >
        {props.headline}
      </div>
      {props.detail && (
        <div
          class="t-body muted"
          style={{ "margin-top": "6rem", "max-width": "560rem" }}
        >
          {props.detail}
        </div>
      )}
      <div data-fg="empty" data-fk="row">
        <Button
          fid="empty"
          label={props.action}
          icon={props.icon}
          onPress={props.onAction}
        />
      </div>
    </div>
  )
}

/**
 * The person's favorites on a TV, a row for each kind as the phone has
 * them: shows, seasons, and movies as posters, episodes as stills, each
 * row only when it has any. The focused one's name, facts, and overview
 * show at the top, and its backdrop behind the page.
 */
export function FavoritesPage() {
  const { user, nav, viewer, actions } = useApp()
  const loader = useLoader(`favorites-${user.username}`, () =>
    session.api.profiles.favorites({ username: user.username, limit: 200 }),
  )
  // Back from a title that was taken off, or from another device's changes.
  useRefreshOnResume([loader])
  const [focusedItem, setFocusedItem] = createSignal<FocusedItem | null>(null)
  useBackdrop(() => focusedItem()?.backdrop ?? [])

  // Each list without what was taken off here, so it goes at once, before
  // they're fetched again. The server answers null only for someone who
  // doesn't share them, never for one's own, and that reads as none here.
  const lists = () => {
    const state = loader().state
    if (state.kind !== "ready") return null
    const all = state.value
    return {
      shows: (all?.shows ?? []).filter((title) => viewer.isFavorite(title)),
      seasons: (all?.seasons ?? []).filter((entry) =>
        viewer.isSeasonFavorite(entry.title, entry.season),
      ),
      episodes: (all?.episodes ?? []).filter((item) =>
        viewer.isItemFavorite(item),
      ),
      movies: (all?.movies ?? []).filter((title) => viewer.isFavorite(title)),
    }
  }
  const empty = () => {
    const current = lists()
    return (
      current !== null &&
      current.shows.length +
        current.seasons.length +
        current.episodes.length +
        current.movies.length ===
        0
    )
  }

  const failed = () => loader().state.kind === "failed"
  const start = (): Start | null => {
    if (failed()) return ["empty", "empty"]
    const current = lists()
    if (!current) return null
    const show = current.shows[0]
    const season = current.seasons[0]
    const episode = current.episodes[0]
    const movie = current.movies[0]
    if (show) return ["shows", show.id]
    if (season) return ["seasons", `${season.title.id}/${season.season.number}`]
    if (episode) return ["episodes", episode.id]
    if (movie) return ["movies", movie.id]
    return ["empty", "empty"]
  }

  const titleRow = (
    name: string,
    heading: string,
    titles: readonly TitleSummary[],
  ) => (
    <Show when={titles.length > 0}>
      <Row title={heading} name={name}>
        <For each={titles}>
          {(title) => (
            <PosterCard
              fid={title.id}
              name={title.name}
              poster={art(title.images.poster)}
              watched={viewer.isWatched(title)}
              onPress={() => nav.title(title.id)}
              onMenu={() => actions.open({ kind: "title", title })}
              onFocus={() => setFocusedItem(titleInfo(title, { genres: true }))}
            />
          )}
        </For>
      </Row>
    </Show>
  )

  return (
    <Page class="page fill grid-page" start={start}>
      <div class="favorites-head">
        <div class="t-headline one-line">{tr("favoritesTitle")}</div>
        <div style={{ "margin-top": "14rem", "padding-right": "120rem" }}>
          <FocusLine item={focusedItem()} />
        </div>
        {focusedItem()?.overview && (
          <div
            class="t-body lines"
            style={{
              "margin-top": "6rem",
              "max-width": "600rem",
              color: "rgba(var(--fg-rgb), 0.75)",
            }}
          >
            {focusedItem()?.overview}
          </div>
        )}
      </div>
      <Switch>
        <Match when={failed() ? loader().state : null} keyed>
          {(state) => (
            <Notice
              headline={tr("favoritesLoadFailed")}
              detail={state.kind === "failed" ? state.message : null}
              icon={RefreshCw}
              action={tr("commonRetry")}
              onAction={() => loader().reload()}
            />
          )}
        </Match>
        <Match when={lists() === null}>
          <div class="center" style={{ "padding-top": "48rem" }}>
            <Spinner size={32} class="muted" />
          </div>
        </Match>
        <Match when={empty()}>
          <Notice
            headline={tr("favoritesEmpty")}
            detail={tr("tvFavoritesEmptyHint")}
            icon={House}
            action={tr("tabHome")}
            glyph={Heart}
            onAction={() => nav.home()}
          />
        </Match>
        <Match when={lists()}>
          {(current) => (
            <div class="rows-scroll" data-scroll="pin" data-scroll-pivot="48">
              <div class="rows" style={{ "padding-top": "8rem" }}>
                {titleRow("shows", tr("favoritesShows"), current().shows)}
                <Show when={current().seasons.length > 0}>
                  <Row title={tr("favoritesSeasons")} name="seasons">
                    <For each={current().seasons}>
                      {({ title, season }) => (
                        <PosterCard
                          fid={`${title.id}/${season.number}`}
                          name={tr(
                            "titleSeasonOf",
                            title.name,
                            seasonName(season.number),
                          )}
                          poster={art(season.poster ?? title.images.poster)}
                          watched={
                            season.itemCount > 0 &&
                            season.watchedCount >= season.itemCount
                          }
                          onPress={() => nav.season(title.id, season.number)}
                          onMenu={() =>
                            actions.open({ kind: "season", title, season })
                          }
                          onFocus={() =>
                            setFocusedItem(seasonInfo(title, season))
                          }
                        />
                      )}
                    </For>
                  </Row>
                </Show>
                <Show when={current().episodes.length > 0}>
                  <Row title={tr("favoritesEpisodes")} name="episodes">
                    <For each={current().episodes}>
                      {(item) => {
                        const label = itemLabel(item)
                        const code = episodeCode(item)
                        const left =
                          item.progress?.completed === false
                            ? timeLeft(item)
                            : null
                        return (
                          <LandscapeCard
                            fid={item.id}
                            toneKey={label.showName}
                            art={landscape(item)}
                            caption={label.showName}
                            detail={
                              [code, left ?? (code ? null : label.year)]
                                .filter(Boolean)
                                .join(" · ") || null
                            }
                            progress={progressRatio(item)}
                            watched={viewer.isItemWatched(item)}
                            onPress={() => nav.item(item)}
                            onMenu={() => actions.open({ kind: "item", item })}
                            onFocus={() => setFocusedItem(itemInfo(item))}
                          />
                        )
                      }}
                    </For>
                  </Row>
                </Show>
                {titleRow("movies", tr("favoritesMovies"), current().movies)}
              </div>
            </div>
          )}
        </Match>
      </Switch>
    </Page>
  )
}
