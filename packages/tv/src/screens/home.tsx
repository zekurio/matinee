import type { FeaturedTitle, Library, MediaItem } from "@matinee/contracts"
import { RefreshCw } from "lucide"
import {
  type Accessor,
  For,
  Match,
  Show,
  Switch,
  createEffect,
  createMemo,
  createSignal,
  onSettled,
} from "solid-js"

import { Page, type Start, useBackdrop } from "../app/page"
import { useApp, useLoader, useRefreshOnResume } from "../app/scope"
import { session } from "../auth/session"
import { tr } from "../i18n"
import { Spinner } from "../kit/base"
import { Button } from "../kit/buttons"
import { LandscapeCard, PosterCard, Row, TitleLogo } from "../kit/cards"
import { Facts, type FocusedItem } from "../kit/misc"
import {
  featuredInfo,
  itemInfo,
  shelfCard,
  shelfInfo,
  titleInfo,
} from "../model/focused"
import {
  art,
  episodeCode,
  itemLabel,
  landscape,
  progressRatio,
  timeLeft,
} from "../model/format"
import type { Loader } from "../model/loader"
import { Message } from "./parts"

const FEATURED = "featured"
const CONTINUE = "continue"
const NEXT_UP = "nextUp"

type OnFocus = (item: FocusedItem) => void
/** Each row's first card, in the rows' order, for focus the first time. */
type Firsts = Map<string, string>

/**
 * The focused card's logo or name, facts, and overview, over the
 * backdrop. It fades from one card to the next rather than jumping. Its
 * height is fixed, so the overview takes what lines the rest leaves.
 */
function Header(props: { item: FocusedItem | null }) {
  return (
    <Show when={props.item}>
      {(item) => (
        <div class="home-header">
          <TitleLogo
            name={item().name}
            logo={item().logo}
            width={360}
            height={70}
            bottom
          >
            <div class="t-display lines">{item().name}</div>
          </TitleLogo>
          {item().subtitle && (
            <div
              class="t-title one-line"
              style={{
                "margin-top": "2rem",
                color: "rgba(var(--fg-rgb), 0.9)",
              }}
            >
              {item().subtitle}
            </div>
          )}
          <Facts
            facts={item().facts}
            contentRating={item().contentRating}
            rating={item().rating}
            style={{ "margin-top": "10rem" }}
          />
          {item().overview && (
            <div
              class="overview t-body lines"
              style={{ "--lines": item().subtitle ? 2 : 3 }}
            >
              {item().overview}
            </div>
          )}
        </div>
      )}
    </Show>
  )
}

/**
 * A row that has no cards to show: its heading and why, with a way to try
 * again where there is one. Without `headline`, a row still loading.
 * `height` is the room under the heading, a library's as tall as its
 * posters, so the rows under it stay put when they come.
 */
function RowNotice(props: {
  title: string | null
  headline: string | null
  message?: string | null
  onRetry?: (() => void) | null
  height?: number
  name: string
}) {
  return (
    <div>
      {props.title !== null && (
        <div class="row-title t-title one-line">{props.title}</div>
      )}
      <div class="row-notice" style={{ height: `${props.height ?? 96}rem` }}>
        {props.headline === null ? (
          <Spinner size={28} class="muted" />
        ) : (
          <>
            <div>
              <div class="t-body dim85">{props.headline}</div>
              {props.message && (
                <div class="t-caption muted">{props.message}</div>
              )}
            </div>
            {props.onRetry && (
              <div data-fg={props.name} data-fk="row">
                <Button
                  fid="retry"
                  label={tr("commonRetry")}
                  icon={RefreshCw}
                  onPress={() => props.onRetry?.()}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/** The featured titles, Home's cards, as a row of posters; the header shows the one focused. */
function FeaturedRow(props: {
  slides: readonly FeaturedTitle[]
  onFocus: OnFocus
}) {
  const { nav, viewer, actions } = useApp()
  return (
    <Row title={tr("tvHomeFeatured")} name={FEATURED}>
      <For each={props.slides}>
        {(slide) => (
          <PosterCard
            fid={slide.title.id}
            name={slide.title.name}
            poster={art(slide.title.images.poster)}
            watched={viewer.isWatched(slide.title)}
            onPress={() => nav.title(slide.title.id)}
            onMenu={() => actions.open({ kind: "title", title: slide.title })}
            onFocus={() => props.onFocus(featuredInfo(slide))}
          />
        )}
      </For>
    </Row>
  )
}

/** Continue watching or Next up: nothing while loading or empty, as on the phone; a notice when it failed. */
function ItemRow(props: {
  name: string
  title: string
  failed: string
  loader: Accessor<Loader<MediaItem[]>>
  onFocus: OnFocus
}) {
  const { nav, viewer, actions } = useApp()
  const items = () => {
    const state = props.loader().state
    return state.kind === "ready" ? state.value : []
  }
  const failure = () => {
    const state = props.loader().state
    return state.kind === "failed" ? state : null
  }
  return (
    <>
      <Show when={failure()} keyed>
        {(state) => (
          <RowNotice
            name={props.name}
            title={props.title}
            headline={props.failed}
            message={state.message}
            onRetry={() => props.loader().reload()}
          />
        )}
      </Show>
      <Show when={items().length > 0}>
        <Row title={props.title} name={props.name}>
          <For each={items()}>
            {(item) => {
              const label = itemLabel(item)
              const code = episodeCode(item)
              const left =
                item.progress?.completed === false ? timeLeft(item) : null
              const detail = [code, left ?? (code ? null : label.year)]
                .filter(Boolean)
                .join(" · ")
              return (
                <LandscapeCard
                  fid={item.id}
                  toneKey={label.showName}
                  art={landscape(item)}
                  caption={label.showName}
                  detail={detail || null}
                  progress={progressRatio(item)}
                  watched={viewer.isItemWatched(item)}
                  onPress={() => nav.item(item)}
                  onMenu={() => actions.open({ kind: "item", item })}
                  onFocus={() => props.onFocus(itemInfo(item))}
                />
              )
            }}
          </For>
        </Row>
      </Show>
    </>
  )
}

/** A row of posters under its heading: the posters and the room a row leaves below them. */
const SHELF_HEIGHT = 124 * 1.5 + 4

/** A library's newest titles as posters. */
function ShelfRow(props: {
  library: Library
  firsts: Firsts
  onFocus: OnFocus
}) {
  const { nav, viewer, actions } = useApp()
  const name = `shelf-${props.library.id}`
  const shelf = useLoader(name, () =>
    session.api.media.shelf({ libraryId: props.library.id, limit: 12 }),
  )
  useRefreshOnResume([shelf])
  const title = () => tr("browseRecentlyAdded", props.library.name)
  const state = () => shelf().state
  const entries = () => {
    const current = state()
    return current.kind === "ready" ? current.value : []
  }
  const first = () => entries()[0]?.title.id
  const failed = () => {
    const current = state()
    return current.kind === "failed" ? current : null
  }
  createEffect(
    () => first(),
    (value) => {
      if (value) props.firsts.set(name, value)
      else props.firsts.delete(name)
    },
  )
  return (
    <Switch>
      <Match when={state().kind === "loading"}>
        <RowNotice
          name={name}
          title={title()}
          headline={null}
          height={SHELF_HEIGHT}
        />
      </Match>
      <Match when={failed()} keyed>
        {(failed) => (
          <RowNotice
            name={name}
            title={title()}
            headline={tr("homeShelfFailed")}
            message={failed.message}
            onRetry={() => shelf().reload()}
            height={SHELF_HEIGHT}
          />
        )}
      </Match>
      <Match when={state().kind === "ready" && entries().length === 0}>
        <RowNotice
          name={name}
          title={title()}
          headline={tr("browseEmptyShelf")}
          height={SHELF_HEIGHT}
        />
      </Match>
      <Match when={entries().length > 0}>
        <Row title={title()} name={name}>
          <For each={entries()}>
            {(entry) => {
              const card = shelfCard(entry)
              return (
                <PosterCard
                  fid={entry.title.id}
                  name={entry.title.name}
                  poster={card.poster}
                  watched={viewer.isWatched(entry.title)}
                  onPress={() => card.open(nav)}
                  onMenu={() =>
                    actions.open({ kind: "title", title: entry.title })
                  }
                  onFocus={() => props.onFocus(shelfInfo(entry, card))}
                />
              )
            }}
          </For>
        </Row>
      </Match>
    </Switch>
  )
}

/**
 * Home on a TV, as Wholphin's: the focused card's backdrop behind the
 * page, its name, facts, and overview in a header at the top, and Home's
 * rows under it, the phone's rows in the phone's order from the same
 * loads. The focused row scrolls to the same place under the header.
 */
export function Home() {
  const { user, nav, viewer, actions } = useApp()
  const api = session.api
  const libraries = useLoader("libraries", () => api.libraries.list())
  const resume = useLoader("continue", () =>
    api.home.continueWatching({ limit: 20 }),
  )
  const nextUp = useLoader("nextUp", async () =>
    (await api.home.nextUp({ limit: 20 })).map((entry) => entry.item),
  )
  // Picked at random, so fetching it again would swap it under the person.
  const featured = useLoader("featured", () => api.home.featured({}), {
    pinned: true,
  })
  const recommendations = useLoader("recommendations", () =>
    api.recommendations.home(),
  )
  // Back on Home, what's in progress may have moved on, here or on another device.
  useRefreshOnResume([libraries, resume, nextUp])
  useRefreshOnResume([recommendations], 10 * 60_000)
  // What failed is left out, so it tries again on return, whichever it is.
  onSettled(() => {
    for (const loader of [featured, recommendations]) {
      if (loader().state.kind === "failed") loader().refreshIfStale()
    }
  })

  const [focusedItem, setFocusedItem] = createSignal<FocusedItem | null>(null)
  useBackdrop(() => focusedItem()?.backdrop ?? [])

  const libs = () => libraries().state
  const libsFailed = () => {
    const current = libs()
    return current.kind === "failed" ? current : null
  }
  const librariesValue = () => {
    const current = libs()
    return current.kind === "ready" ? current.value : []
  }
  const slides = () => featured().value ?? []
  const rails = () => recommendations().value?.rails ?? []
  const sections = () => [resume().state, nextUp().state, featured().state]
  const nothing = () =>
    libs().kind === "failed" &&
    sections().every(
      (state) =>
        state.kind === "failed" ||
        (state.kind === "ready" && state.value.length === 0),
    )

  const firsts: Firsts = new Map()
  createMemo(() => {
    const slides = featured().value ?? []
    if (slides[0]) firsts.set(FEATURED, slides[0].title.id)
    else firsts.delete(FEATURED)
    const resumeFirst = resume().value?.[0]
    if (resumeFirst) firsts.set(CONTINUE, resumeFirst.id)
    else firsts.delete(CONTINUE)
    const nextUpFirst = nextUp().value?.[0]
    if (nextUpFirst) firsts.set(NEXT_UP, nextUpFirst.id)
    else firsts.delete(NEXT_UP)
  })
  // The rows above the libraries show only once loaded, so focus waits for
  // them: taken sooner, it would sit in a row they then push down.
  const waiting = () => sections().some((state) => state.kind === "loading")
  const start = (): Start | null => {
    for (const [group, leaf] of firsts) {
      if (!waiting()) return [group, leaf]
      break
    }
    return null
  }
  const reloadAll = () => {
    for (const loader of [
      libraries,
      resume,
      nextUp,
      featured,
      recommendations,
    ]) {
      loader().reload()
    }
  }

  return (
    <Show
      when={!nothing()}
      fallback={
        <Message
          title={tr("homeFailed")}
          message={libsFailed()?.message ?? null}
          retry={reloadAll}
        />
      }
    >
      <Page class="page fill" start={start}>
        <Header item={focusedItem()} />
        <div class="home-rows" data-scroll="pin" data-scroll-pivot="52">
          <div class="rows">
            <Show when={slides().length > 0}>
              <FeaturedRow slides={slides()} onFocus={setFocusedItem} />
            </Show>
            <ItemRow
              name={CONTINUE}
              title={tr("browseContinueWatching")}
              failed={tr("homeContinueFailed")}
              loader={resume}
              onFocus={setFocusedItem}
            />
            <ItemRow
              name={NEXT_UP}
              title={tr("browseNextUp")}
              failed={tr("homeNextUpFailed")}
              loader={nextUp}
              onFocus={setFocusedItem}
            />
            <For each={rails()}>
              {(rail) => {
                const name = `recommended-${rail.id}-${rail.seed?.ref.providerId ?? ""}`
                return (
                  <Show when={rail.items.length > 0}>
                    <Row
                      name={name}
                      title={
                        rail.id === "becauseWatched"
                          ? tr(
                              "webDiscoverRailBecauseWatched",
                              rail.seed?.name ?? "",
                            )
                          : tr("webDiscoverRailForYou")
                      }
                    >
                      <For each={rail.items}>
                        {(item) => (
                          <PosterCard
                            fid={item.title.id}
                            name={item.title.name}
                            poster={art(item.title.images.poster)}
                            watched={viewer.isWatched(item.title)}
                            onPress={() => nav.title(item.title.id)}
                            onMenu={() =>
                              actions.open({
                                kind: "title",
                                title: item.title,
                              })
                            }
                            onFocus={() =>
                              setFocusedItem(titleInfo(item.title))
                            }
                          />
                        )}
                      </For>
                    </Row>
                  </Show>
                )
              }}
            </For>
            <Show when={libs().kind === "loading"}>
              <div class="center" style={{ height: "96rem" }}>
                <Spinner size={32} class="muted" />
              </div>
            </Show>
            <Show when={libsFailed()} keyed>
              {(failed) => (
                <RowNotice
                  name="libraries"
                  title={null}
                  headline={tr("homeLoadFailed")}
                  message={failed.message}
                  onRetry={() => libraries().reload()}
                />
              )}
            </Show>
            <Show
              when={libs().kind === "ready" && librariesValue().length === 0}
            >
              <div class="message">
                <div class="t-headline">
                  {tr(
                    user.role === "admin"
                      ? "browseHomeNoLibraries"
                      : "browseHomeNothingYet",
                  )}
                </div>
                <div class="t-body muted">
                  {tr(
                    user.role === "admin"
                      ? "browseHomeNoLibrariesAdmin"
                      : "browseHomeNothingYetDescription",
                  )}
                </div>
              </div>
            </Show>
            <For each={librariesValue()}>
              {(library) => (
                <ShelfRow
                  library={library}
                  firsts={firsts}
                  onFocus={setFocusedItem}
                />
              )}
            </For>
          </div>
        </div>
      </Page>
    </Show>
  )
}
