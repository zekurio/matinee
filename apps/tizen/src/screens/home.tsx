import type { FeaturedTitle, Library, MediaItem } from "@matinee/contracts"
import { RefreshCw } from "lucide"
import { useEffect, useState } from "preact/hooks"

import { Page, type Start, useBackdrop } from "@/app/page"
import { useApp, useLoader, useRefreshOnResume } from "@/app/scope"
import { session } from "@/auth/session"
import { tr } from "@/i18n"
import { Spinner } from "@/kit/base"
import { Button } from "@/kit/buttons"
import { LandscapeCard, PosterCard, Row, TitleLogo } from "@/kit/cards"
import { Facts, type FocusedItem } from "@/kit/misc"
import {
  featuredInfo,
  itemInfo,
  shelfCard,
  shelfInfo,
  titleInfo,
} from "@/model/focused"
import {
  art,
  episodeCode,
  itemLabel,
  landscape,
  progressRatio,
  timeLeft,
} from "@/model/format"
import type { Loader } from "@/model/loader"

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
  const { item } = props
  if (!item) return null
  return (
    <div class="home-header" key={`${item.name} ${item.subtitle ?? ""}`}>
      <TitleLogo
        name={item.name}
        logo={item.logo}
        width={360}
        height={70}
        bottom
      >
        <div class="t-display lines">{item.name}</div>
      </TitleLogo>
      {item.subtitle && (
        <div
          class="t-title one-line"
          style={{ marginTop: "2rem", color: "rgba(var(--fg-rgb), 0.9)" }}
        >
          {item.subtitle}
        </div>
      )}
      <Facts
        facts={item.facts}
        contentRating={item.contentRating}
        rating={item.rating}
        style={{ marginTop: "10rem" }}
      />
      {item.overview && (
        <div
          class="overview t-body lines"
          style={{ "--lines": item.subtitle ? 2 : 3 }}
        >
          {item.overview}
        </div>
      )}
    </div>
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
                  label={tr("common_retry")}
                  icon={RefreshCw}
                  onPress={props.onRetry}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/** The featured titles, the phone's banner, as a row of posters; the header shows the one focused. */
function FeaturedRow(props: {
  slides: readonly FeaturedTitle[]
  onFocus: OnFocus
}) {
  const { nav, viewer, actions } = useApp()
  return (
    <Row title={tr("tv_home_featured")} name={FEATURED}>
      {props.slides.map((slide) => (
        <PosterCard
          key={slide.title.id}
          fid={slide.title.id}
          name={slide.title.name}
          poster={art(slide.title.images.poster)}
          watched={viewer.isWatched(slide.title)}
          onPress={() => nav.title(slide.title.id)}
          onMenu={() => actions.open({ kind: "title", title: slide.title })}
          onFocus={() => props.onFocus(featuredInfo(slide))}
        />
      ))}
    </Row>
  )
}

/** Continue watching or Next up: nothing while loading or empty, as on the phone; a notice when it failed. */
function ItemRow(props: {
  name: string
  title: string
  failed: string
  loader: Loader<MediaItem[]>
  onFocus: OnFocus
}) {
  const { nav, viewer, actions } = useApp()
  const { state } = props.loader
  if (state.kind === "loading") return null
  if (state.kind === "failed") {
    return (
      <RowNotice
        name={props.name}
        title={props.title}
        headline={props.failed}
        message={state.message}
        onRetry={() => props.loader.reload()}
      />
    )
  }
  if (state.value.length === 0) return null
  return (
    <Row title={props.title} name={props.name}>
      {state.value.map((item) => {
        const label = itemLabel(item)
        const code = episodeCode(item)
        const left = item.progress?.completed === false ? timeLeft(item) : null
        const detail = [code, left ?? (code ? null : label.year)]
          .filter(Boolean)
          .join(" · ")
        return (
          <LandscapeCard
            key={item.id}
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
      })}
    </Row>
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
  const { library } = props
  const name = `shelf-${library.id}`
  const shelf = useLoader(name, () =>
    session.api.media.shelf({ libraryId: library.id, limit: 12 }),
  )
  useRefreshOnResume([shelf])
  const title = tr("browse_recently_added", library.name)
  const { state } = shelf
  const first = state.kind === "ready" ? state.value[0]?.title.id : undefined
  if (first) props.firsts.set(name, first)
  else props.firsts.delete(name)
  if (state.kind === "loading") {
    return (
      <RowNotice
        name={name}
        title={title}
        headline={null}
        height={SHELF_HEIGHT}
      />
    )
  }
  if (state.kind === "failed") {
    return (
      <RowNotice
        name={name}
        title={title}
        headline={tr("home_shelf_failed")}
        message={state.message}
        onRetry={() => shelf.reload()}
        height={SHELF_HEIGHT}
      />
    )
  }
  if (state.value.length === 0) {
    return (
      <RowNotice
        name={name}
        title={title}
        headline={tr("browse_empty_shelf")}
        height={SHELF_HEIGHT}
      />
    )
  }
  return (
    <Row title={title} name={name}>
      {state.value.map((entry) => {
        const card = shelfCard(entry)
        return (
          <PosterCard
            key={entry.title.id}
            fid={entry.title.id}
            name={entry.title.name}
            poster={card.poster}
            watched={viewer.isWatched(entry.title)}
            onPress={() => card.open(nav)}
            onMenu={() => actions.open({ kind: "title", title: entry.title })}
            onFocus={() => props.onFocus(shelfInfo(entry, card))}
          />
        )
      })}
    </Row>
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
  useEffect(() => {
    for (const loader of [featured, recommendations]) {
      if (loader.state.kind === "failed") loader.refreshIfStale()
    }
  }, [])

  const [focusedItem, setFocusedItem] = useState<FocusedItem | null>(null)
  useBackdrop(focusedItem?.backdrop ?? [])

  const sections = [resume.state, nextUp.state, featured.state]
  const nothing =
    libraries.state.kind === "failed" &&
    sections.every(
      (state) =>
        state.kind === "failed" ||
        (state.kind === "ready" && state.value.length === 0),
    )
  if (nothing && libraries.state.kind === "failed") {
    return (
      <Message
        title={tr("home_failed")}
        message={libraries.state.message}
        retry={() => {
          for (const loader of [
            libraries,
            resume,
            nextUp,
            featured,
            recommendations,
          ]) {
            loader.reload()
          }
        }}
      />
    )
  }

  const firsts: Firsts = new Map()
  const slides = featured.value ?? []
  if (slides[0]) firsts.set(FEATURED, slides[0].title.id)
  if (resume.value?.[0]) firsts.set(CONTINUE, resume.value[0].id)
  if (nextUp.value?.[0]) firsts.set(NEXT_UP, nextUp.value[0].id)
  const rails = recommendations.value?.rails ?? []
  const libs = libraries.state

  // The rows above the libraries show only once loaded, so focus waits for
  // them: taken sooner, it would sit in a row they then push down.
  const waiting = sections.some((state) => state.kind === "loading")
  const start = (): Start | null => {
    const [first] = firsts
    return !waiting && first ? [first[0], first[1]] : null
  }

  return (
    <Page class="page fill" start={start}>
      <Header item={focusedItem} />
      <div class="home-rows" data-scroll="pin" data-scroll-pivot="52">
        <div class="rows">
          {slides.length > 0 && (
            <FeaturedRow slides={slides} onFocus={setFocusedItem} />
          )}
          <ItemRow
            name={CONTINUE}
            title={tr("browse_continue_watching")}
            failed={tr("home_continue_failed")}
            loader={resume}
            onFocus={setFocusedItem}
          />
          <ItemRow
            name={NEXT_UP}
            title={tr("browse_next_up")}
            failed={tr("home_next_up_failed")}
            loader={nextUp}
            onFocus={setFocusedItem}
          />
          {rails.map((rail) => {
            const name = `recommended-${rail.id}-${rail.seed?.ref.providerId ?? ""}`
            if (rail.items.length === 0) return null
            const first = rail.items[0]
            if (first) firsts.set(name, first.title.id)
            return (
              <Row
                key={name}
                name={name}
                title={
                  rail.id === "becauseWatched"
                    ? tr(
                        "web_discover_rail_becauseWatched",
                        rail.seed?.name ?? "",
                      )
                    : tr("web_discover_rail_forYou")
                }
              >
                {rail.items.map((item) => (
                  <PosterCard
                    key={item.title.id}
                    fid={item.title.id}
                    name={item.title.name}
                    poster={art(item.title.images.poster)}
                    watched={viewer.isWatched(item.title)}
                    onPress={() => nav.title(item.title.id)}
                    onMenu={() =>
                      actions.open({ kind: "title", title: item.title })
                    }
                    onFocus={() => setFocusedItem(titleInfo(item.title))}
                  />
                ))}
              </Row>
            )
          })}
          {libs.kind === "loading" && (
            <div class="center" style={{ height: "96rem" }}>
              <Spinner size={32} class="muted" />
            </div>
          )}
          {libs.kind === "failed" && (
            <RowNotice
              name="libraries"
              title={null}
              headline={tr("home_load_failed")}
              message={libs.message}
              onRetry={() => libraries.reload()}
            />
          )}
          {libs.kind === "ready" && libs.value.length === 0 && (
            <div class="message">
              <div class="t-headline">
                {tr(
                  user.role === "admin"
                    ? "browse_home_no_libraries"
                    : "browse_home_nothing_yet",
                )}
              </div>
              <div class="t-body muted">
                {tr(
                  user.role === "admin"
                    ? "browse_home_no_libraries_admin"
                    : "browse_home_nothing_yet_description",
                )}
              </div>
            </div>
          )}
          {libs.kind === "ready" &&
            libs.value.map((library) => (
              <ShelfRow
                key={library.id}
                library={library}
                firsts={firsts}
                onFocus={setFocusedItem}
              />
            ))}
        </div>
      </div>
    </Page>
  )
}
