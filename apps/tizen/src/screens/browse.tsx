import type { Facet, SearchResults, TitleSummary } from "@matinee/contracts"
import { Heart, House, type IconNode, RefreshCw } from "lucide"
import { useEffect, useState } from "preact/hooks"

import { Page, type Start, useBackdrop } from "@/app/page"
import {
  useApp,
  useKept,
  useLoader,
  usePage,
  useRefreshOnResume,
} from "@/app/scope"
import { session } from "@/auth/session"
import { plural, tr } from "@/i18n"
import { Icon, Spinner } from "@/kit/base"
import { Button } from "@/kit/buttons"
import { LandscapeCard, PersonCard, PosterCard, Row } from "@/kit/cards"
import { SearchField } from "@/kit/fields"
import { type FocusedItem, FocusLine } from "@/kit/misc"
import { itemInfo, seasonInfo, titleInfo } from "@/model/focused"
import {
  art,
  creditKind,
  episodeCode,
  itemLabel,
  landscape,
  progressRatio,
  seasonName,
  timeLeft,
} from "@/model/format"

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
      style={{ paddingTop: "40rem", justifyContent: "flex-start" }}
    >
      <div class="t-title" style={{ color: "rgba(var(--fg-rgb), 0.9)" }}>
        {props.headline}
      </div>
      {props.detail && (
        <div class="t-body muted" style={{ marginTop: "6rem" }}>
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
  const [found, setFound] = useState<Found | null>(scope.search)
  const [searching, setSearching] = useState(false)
  const [failed, setFailed] = useState(false)
  const libraries = useLoader("libraries", () => session.api.libraries.list())
  const names = new Map(
    (libraries.value ?? []).map((library) => [library.id, library.name]),
  )
  const [focusedItem, setFocusedItem] = useState<FocusedItem | null>(null)
  useBackdrop(focusedItem?.backdrop ?? [])
  const text = query.trim()

  useEffect(() => {
    setFocusedItem(null)
    if (text === "") {
      setFound(null)
      return
    }
    // The same text's results are there already.
    if (found?.text === text && !failed) return
    let over = false
    const timer = window.setTimeout(() => {
      setSearching(true)
      setFailed(false)
      session.api.search.query({ query: text, limit: SEARCH_LIMIT }).then(
        (results) => {
          if (over) return
          const answer = { text, results }
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
  }, [text])

  const results = found?.results
  const byLibrary = new Map<string, TitleSummary[]>()
  for (const title of results?.titles ?? []) {
    byLibrary.set(title.libraryId, [
      ...(byLibrary.get(title.libraryId) ?? []),
      title,
    ])
  }
  const nothing =
    results !== undefined &&
    results.titles.length === 0 &&
    results.people.length === 0 &&
    results.genres.length === 0 &&
    results.studios.length === 0

  const facetRow = (
    name: string,
    title: string,
    facets: readonly Facet[],
    open: (facet: Facet) => void,
  ) =>
    facets.length > 0 && (
      <Row title={title} name={name} buttons>
        {facets.map((facet) => (
          <Button
            key={facet.name}
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
        ))}
      </Row>
    )

  return (
    <Page class="page fill grid-page" start={() => ["field", "field"]}>
      <div class="search-top" data-fg="field" data-fk="row">
        <div style={{ flex: 1, maxWidth: "640rem" }}>
          <SearchField
            fid="field"
            value={query}
            onChange={setQuery}
            placeholder={tr("searchField")}
            clearLabel={tr("searchClear")}
            height={56}
            large
          />
        </div>
        {searching && results && (
          <span class="t-caption muted" style={{ marginLeft: "20rem" }}>
            {tr("searchSearching")}
          </span>
        )}
      </div>
      {text !== "" && (
        <div class="grid-line" style={{ marginTop: "16rem" }}>
          <FocusLine item={focusedItem} />
        </div>
      )}
      {text === "" ? null : failed ? (
        <Hint headline={tr("searchFailed")} />
      ) : results === undefined ? (
        <div class="center" style={{ paddingTop: "48rem" }}>
          <Spinner size={32} class="muted" />
        </div>
      ) : nothing ? (
        <Hint
          headline={tr("searchNoMatch", text)}
          detail={tr("searchNoMatchHint")}
        />
      ) : (
        <div class="rows-scroll" data-scroll="pin" data-scroll-pivot="48">
          <div class="rows" style={{ paddingTop: "8rem" }}>
            {[...byLibrary].map(([libraryId, titles]) => (
              <Row
                key={libraryId}
                name={`lib-${libraryId}`}
                title={`${names.get(libraryId) ?? tr("searchTitlesHeading")}  ·  ${plural("browseTitleCount", titles.length)}`}
              >
                {titles.map((title) => (
                  <PosterCard
                    key={title.id}
                    fid={title.id}
                    name={title.name}
                    poster={art(title.images.poster)}
                    watched={viewer.isWatched(title)}
                    onPress={() => nav.title(title.id)}
                    onMenu={() => actions.open({ kind: "title", title })}
                    onFocus={() =>
                      setFocusedItem(titleInfo(title, { genres: true }))
                    }
                  />
                ))}
              </Row>
            ))}
            {results.people.length > 0 && (
              <Row title={tr("searchSectionCast")} name="people">
                {results.people.map((person) => (
                  <PersonCard
                    key={person.name}
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
                ))}
              </Row>
            )}
            {facetRow(
              "genres",
              tr("searchSectionGenres"),
              results.genres,
              (facet) => nav.genre(facet.name),
            )}
            {facetRow(
              "studios",
              tr("searchSectionStudios"),
              results.studios,
              (facet) => nav.studio(facet.name),
            )}
          </div>
        </div>
      )}
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
      style={{ paddingTop: "24rem", justifyContent: "flex-start" }}
    >
      {props.glyph && <Icon icon={props.glyph} size={40} class="muted" />}
      <div class="t-headline" style={{ marginTop: props.glyph ? "18rem" : 0 }}>
        {props.headline}
      </div>
      {props.detail && (
        <div
          class="t-body muted"
          style={{ marginTop: "6rem", maxWidth: "560rem" }}
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
  const [focusedItem, setFocusedItem] = useState<FocusedItem | null>(null)
  useBackdrop(focusedItem?.backdrop ?? [])

  // Each list without what was taken off here, so it goes at once, before
  // they're fetched again. The server answers null only for someone who
  // doesn't share them, never for one's own, and that reads as none here.
  const all = loader.state.kind === "ready" ? loader.state.value : undefined
  const lists =
    loader.state.kind === "ready"
      ? {
          shows: (all?.shows ?? []).filter((title) => viewer.isFavorite(title)),
          seasons: (all?.seasons ?? []).filter((entry) =>
            viewer.isSeasonFavorite(entry.title, entry.season),
          ),
          episodes: (all?.episodes ?? []).filter((item) =>
            viewer.isItemFavorite(item),
          ),
          movies: (all?.movies ?? []).filter((title) =>
            viewer.isFavorite(title),
          ),
        }
      : null
  const empty =
    lists !== null &&
    lists.shows.length +
      lists.seasons.length +
      lists.episodes.length +
      lists.movies.length ===
      0

  const failed = loader.state.kind === "failed"
  const start = (): Start | null => {
    if (failed) return ["empty", "empty"]
    if (!lists) return null
    const show = lists.shows[0]
    const season = lists.seasons[0]
    const episode = lists.episodes[0]
    const movie = lists.movies[0]
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
  ) =>
    titles.length > 0 && (
      <Row title={heading} name={name}>
        {titles.map((title) => (
          <PosterCard
            key={title.id}
            fid={title.id}
            name={title.name}
            poster={art(title.images.poster)}
            watched={viewer.isWatched(title)}
            onPress={() => nav.title(title.id)}
            onMenu={() => actions.open({ kind: "title", title })}
            onFocus={() => setFocusedItem(titleInfo(title, { genres: true }))}
          />
        ))}
      </Row>
    )

  return (
    <Page class="page fill grid-page" start={start}>
      <div class="favorites-head">
        <div class="t-headline one-line">{tr("favoritesTitle")}</div>
        <div style={{ marginTop: "14rem", paddingRight: "120rem" }}>
          <FocusLine item={focusedItem} />
        </div>
        {focusedItem?.overview && (
          <div
            class="t-body lines"
            style={{
              marginTop: "6rem",
              maxWidth: "600rem",
              color: "rgba(var(--fg-rgb), 0.75)",
            }}
          >
            {focusedItem.overview}
          </div>
        )}
      </div>
      {loader.state.kind === "failed" ? (
        <Notice
          headline={tr("favoritesLoadFailed")}
          detail={loader.state.message}
          icon={RefreshCw}
          action={tr("commonRetry")}
          onAction={() => loader.reload()}
        />
      ) : lists === null ? (
        <div class="center" style={{ paddingTop: "48rem" }}>
          <Spinner size={32} class="muted" />
        </div>
      ) : empty ? (
        <Notice
          headline={tr("favoritesEmpty")}
          detail={tr("tvFavoritesEmptyHint")}
          icon={House}
          action={tr("tabHome")}
          glyph={Heart}
          onAction={() => nav.home()}
        />
      ) : (
        <div class="rows-scroll" data-scroll="pin" data-scroll-pivot="48">
          <div class="rows" style={{ paddingTop: "8rem" }}>
            {titleRow("shows", tr("favoritesShows"), lists.shows)}
            {lists.seasons.length > 0 && (
              <Row title={tr("favoritesSeasons")} name="seasons">
                {lists.seasons.map(({ title, season }) => (
                  <PosterCard
                    key={`${title.id}/${season.number}`}
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
                    onFocus={() => setFocusedItem(seasonInfo(title, season))}
                  />
                ))}
              </Row>
            )}
            {lists.episodes.length > 0 && (
              <Row title={tr("favoritesEpisodes")} name="episodes">
                {lists.episodes.map((item) => {
                  const label = itemLabel(item)
                  const code = episodeCode(item)
                  const left =
                    item.progress?.completed === false ? timeLeft(item) : null
                  return (
                    <LandscapeCard
                      key={item.id}
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
                })}
              </Row>
            )}
            {titleRow("movies", tr("favoritesMovies"), lists.movies)}
          </div>
        </div>
      )}
    </Page>
  )
}
