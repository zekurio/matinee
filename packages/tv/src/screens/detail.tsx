import type { MediaItem, Season, Title } from "@matinee/contracts"
import type { JSX } from "@solidjs/web"
import {
  AudioLines,
  Captions,
  Check,
  CircleCheck,
  Film,
  Heart,
  type IconNode,
  List,
  Play,
  RotateCcw,
  Tv,
} from "lucide"
import { For, Show, createEffect, createSignal } from "solid-js"

import { useHideClock } from "../app/chrome"
import { Page, type Start, useBackdrop } from "../app/page"
import { useApp, useKept, useLoader, usePage } from "../app/scope"
import { session } from "../auth/session"
import { plural, tr } from "../i18n"
import { cx, Icon, Spinner } from "../kit/base"
import { Button, Chip, IconButton } from "../kit/buttons"
import {
  CaptionedPoster,
  LandscapeCard,
  PersonCard,
  Row,
  TitleLogo,
} from "../kit/cards"
import { Facts } from "../kit/misc"
import {
  art,
  creditKind,
  episodeNumber,
  formatDay,
  formatRuntime,
  frame,
  isResuming,
  itemLabel,
  landscape,
  languageList,
  mediaFlags,
  present,
  progressRatio,
  runtimeMinutes,
  seasonName,
  showsNextUp,
  timeLeft,
  titleFacts,
  videoSummary,
} from "../model/format"
import type { Viewer } from "../model/viewer"
import { Loaded, Message } from "./parts"

/* The title, season, and episode pages. */

const ACTIONS = "actions"
const PLAY = "play"
const WATCHED = "watched"

const NO_SEASON = -1

/**
 * A detail page: `header` first, over the backdrop, with its buttons,
 * then rows below it, reached with Down. While the header has focus the
 * page sits at its top; once a row has it, each row scrolls to the same
 * height as Home's do.
 */
function DetailList(props: { header: JSX.Element; children?: JSX.Element }) {
  const [scrolled, setScrolled] = createSignal(false)
  useHideClock(scrolled)
  return (
    <div
      class={cx("detail-list fill", scrolled() && "scrolled")}
      data-scroll="pin"
      data-scroll-pivot="88"
      onScroll={(event) => setScrolled(event.currentTarget.scrollTop > 4)}
    >
      <div class="detail-rows">
        <div data-scroll-home="">{props.header}</div>
        {props.children}
      </div>
    </div>
  )
}

/** An overview, cut to `lines`. */
function Overview(props: {
  text: string
  lines?: number
  tagline?: string | null
}) {
  return (
    <div class="detail-overview">
      {props.tagline && <div class="t-facts one-line">{props.tagline}</div>}
      <div class="t-body dim78 lines" style={{ "--lines": props.lines ?? 3 }}>
        {props.text}
      </div>
    </div>
  )
}

/**
 * What a file holds, a line each with its icon, set small beside a
 * header's text: the picture, the audio's languages with the main track's
 * layout, and the subtitles' languages. The languages come from the
 * server's track lists, which include subtitle files beside the video;
 * until they load, or if they fail, from what the probe found in the file.
 */
function FileInfo(props: { item: MediaItem }) {
  const api = session.api
  const tracks = useLoader(`tracks-${props.item.id}`, async () => {
    const [audio, subtitles] = await Promise.all([
      api.media.audio({ id: props.item.id }),
      api.media.subtitles({ id: props.item.id }),
    ])
    return {
      audio: audio
        .toSorted((a, b) => Number(b.primary) - Number(a.primary))
        .map((track) => track.language),
      subtitles: subtitles.tracks.map((track) => track.language),
    }
  })
  const lines = () => {
    const item = props.item
    const probe = item.probe
    if (!probe) return null
    const known = tracks().value
    const audio =
      known?.audio ??
      probe.audio
        .toSorted((a, b) => Number(b.default) - Number(a.default))
        .map((stream) => stream.language)
    const subtitles =
      known?.subtitles ?? probe.subtitles.map((stream) => stream.language)
    const main = probe.audio.find((stream) => stream.default) ?? probe.audio[0]
    const video = videoSummary(item)
    // Each language once; a file whose tracks don't say gets their count instead.
    const audioLine = [
      languageList(audio) ??
        (audio.length > 0 ? plural("mediaAudioTracks", audio.length) : null),
      main?.layout,
    ]
      .filter(Boolean)
      .join(" · ")
    const subtitleLine =
      languageList(subtitles) ??
      (subtitles.length > 0 ? plural("mediaSubtitles", subtitles.length) : null)
    return { video, audioLine, subtitleLine }
  }
  const line = (icon: IconNode, label: string, text: string | null) => (
    <Show when={text}>
      <div class="file-line" aria-label={label}>
        <Icon icon={icon} size={16} class="muted" />
        <span class="t-caption lines">{text}</span>
      </div>
    </Show>
  )
  return (
    <Show when={lines()}>
      {(current) => (
        <Show
          when={
            current().video || current().audioLine || current().subtitleLine
          }
        >
          <div class="file-info">
            {line(Film, tr("mediaInfoVideo"), current().video)}
            {line(
              AudioLines,
              tr("mediaInfoAudio"),
              current().audioLine || null,
            )}
            {line(Captions, tr("mediaInfoSubtitles"), current().subtitleLine)}
          </div>
        </Show>
      )}
    </Show>
  )
}

/** The tick and the heart every detail page has, after its Play. */
function Marks(props: {
  watched: boolean
  onWatched: () => void
  /** Null for what can't be a favorite, as the files without a season number. */
  favorite: boolean | null
  onFavorite: () => void
}) {
  return (
    <>
      <IconButton
        fid={WATCHED}
        icon={props.watched ? CircleCheck : Check}
        label={tr(props.watched ? "mediaMarkUnwatched" : "mediaMarkWatched")}
        tint={props.watched ? "var(--accent)" : undefined}
        onPress={props.onWatched}
      />
      {props.favorite !== null && (
        <IconButton
          fid="favorite"
          icon={Heart}
          filled={props.favorite}
          label={tr(
            props.favorite ? "mediaRemoveFavorite" : "mediaAddFavorite",
          )}
          tint={props.favorite ? "var(--danger)" : undefined}
          onPress={props.onFavorite}
        />
      )}
    </>
  )
}

/** Play, or Resume with the time left. */
function PlayButton(props: { item: MediaItem | null | undefined }) {
  const { nav } = useApp()
  const resume = () => isResuming(props.item)
  return (
    <Button
      fid={PLAY}
      label={tr(resume() ? "titleResume" : "titlePlay")}
      icon={Play}
      minWidth={180}
      detail={resume() && props.item ? timeLeft(props.item) : null}
      disabled={!props.item}
      onPress={() => {
        if (props.item) nav.play(props.item.id)
      }}
    />
  )
}

/**
 * An episode as a 16:9 card in a row: its still, how far in the person
 * is, its name, and its number with the time left or its length. Select
 * opens its page; holding Select offers the rest.
 */
function EpisodeCard(props: {
  item: MediaItem
  detail?: boolean
  onFocus?: () => void
}) {
  const { nav, viewer, actions } = useApp()
  const detail = () => props.detail ?? true
  const label = () => itemLabel(props.item)
  const left = () =>
    props.item.progress?.completed === false ? timeLeft(props.item) : null
  const number = () => episodeNumber(props.item)
  return (
    <LandscapeCard
      fid={props.item.id}
      toneKey={label().showName}
      art={landscape(props.item)}
      caption={
        detail() || number() === null || label().untitled
          ? label().title
          : tr("titleEpisodesCodedName", number() ?? 0, label().title)
      }
      // An episode without a name is called by its number already.
      detail={
        detail()
          ? [
              label().untitled ? null : number(),
              left() ?? formatRuntime(runtimeMinutes(props.item)),
            ]
              .filter(Boolean)
              .join(" · ") || null
          : null
      }
      progress={progressRatio(props.item)}
      watched={viewer.isItemWatched(props.item)}
      onPress={() => nav.item(props.item)}
      onMenu={() => actions.open({ kind: "item", item: props.item })}
      onFocus={props.onFocus}
    />
  )
}

/** A season's files, or with `season` null, the files without a season number. */
function useSeasonItems(titleId: string, season: number | null) {
  return useLoader(`items-${titleId}-${season}`, () =>
    session.api.titles.items({ id: titleId, season }),
  )
}

/**
 * A season's episodes as a row titled `heading`, without `exclude`. The
 * first time focus comes into it, it lands on `start`, like the episode
 * Play starts. Nothing until they load, or if there are none.
 */
function EpisodesRow(props: {
  heading: string
  name: string
  titleId: string
  season: number | null
  exclude?: string
  start?: string
}) {
  const { scope } = usePage()
  const items = useSeasonItems(props.titleId, props.season)
  const list = () =>
    (items().value ?? []).filter((item) => item.id !== props.exclude)
  // Props are read in the compute: `start` is worked out by the parent,
  // and reading one of those while an effect applies stops Solid.
  createEffect(
    () => [list(), props.start, props.name] as const,
    ([current, start, name]) => {
      if (start && current.some((item) => item.id === start)) {
        scope.memory.seed(name, start)
      }
    },
  )
  return (
    <Show when={list().length > 0}>
      <Row title={props.heading} name={props.name}>
        <For each={list()}>{(item) => <EpisodeCard item={item} />}</For>
      </Row>
    </Show>
  )
}

/** What Play starts in a season: the episode in progress, else the first unwatched, else the first. */
function seasonNext(list: readonly MediaItem[] | undefined, viewer: Viewer) {
  return (
    list?.find((item) => isResuming(item)) ??
    list?.find((item) => !viewer.isItemWatched(item)) ??
    list?.[0] ??
    null
  )
}

/** Mark a season watched or not, or with a null number, the files without a season number. */
async function setSeasonWatched(
  viewer: Viewer,
  title: Title,
  season: number | null,
  watched: boolean,
  when?: Parameters<Viewer["setWatched"]>[3],
) {
  if (season === null) {
    // Null in the title-wide operation means every season, not the unnumbered files.
    const loose = await session.api.titles.items({ id: title.id, season: null })
    for (const item of loose) await viewer.setItemWatched(item, watched, when)
  } else {
    await viewer.setWatched(title, watched, season, when)
  }
}

/** A movie's or show's page on a TV. */
export function TitlePage(props: { id: string }) {
  const loader = useLoader(`title-${props.id}`, () =>
    session.api.titles.get({ id: props.id }),
  )
  return (
    <Loaded
      load={loader().state}
      error={tr("titleLoadError")}
      retry={() => loader().reload()}
    >
      {(title) => <TitleView title={title} />}
    </Loaded>
  )
}

/**
 * The title over its backdrop: its name or logo, facts, genres, and
 * overview, with Play and its marks under them, focus on Play. Below, for
 * a show, the episode up next, the episodes of a show with one season,
 * and its seasons; then the cast and crew, and its genres and studios.
 */
function TitleView(props: { title: Title }) {
  const { nav, viewer, actions, toasts } = useApp()
  const next = () => props.title.next
  const show = () => props.title.kind === "show"
  useBackdrop(() =>
    present(
      art(props.title.images.backdrop, "large"),
      next() ? frame(next()?.id ?? "", true) : null,
    ),
  )
  // One season, so no specials either: its episodes go right on the show's page.
  const only = () =>
    props.title.seasons.length === 1 ? props.title.seasons[0] : undefined
  const watched = () => viewer.isWatched(props.title)
  const favorite = () => viewer.isFavorite(props.title)
  const people = () => {
    const cast = props.title.credits.filter((credit) => credit.kind === "actor")
    const crew = (["creator", "director", "writer"] as const).flatMap(
      (kind) => {
        const seen = new Set<string>()
        return props.title.credits
          .filter((credit) => credit.kind === kind)
          .filter((credit) => !seen.has(credit.name) && seen.add(credit.name))
          .map((credit) => ({ ...credit, role: creditKind(kind, 1) }))
      },
    )
    return [...cast, ...crew]
  }
  const flags = () => {
    const item = next()
    return show() || !item ? [] : mediaFlags(item)
  }
  const nextUp = (): MediaItem | null => {
    const item = next()
    return show() && item && showsNextUp(props.title) ? item : null
  }
  const start = (): Start => [ACTIONS, next() ? PLAY : WATCHED]

  const header = (
    <div class="detail-header">
      <TitleLogo
        name={props.title.name}
        logo={props.title.images.logo}
        width={420}
        height={110}
      >
        <div class="t-hero lines" style={{ width: "720rem" }}>
          {props.title.name}
        </div>
      </TitleLogo>
      {props.title.originalName &&
        props.title.originalName !== props.title.name && (
          <div class="t-body muted one-line">{props.title.originalName}</div>
        )}
      <Facts
        facts={titleFacts(props.title)}
        contentRating={props.title.contentRating}
        rating={props.title.rating}
        flags={flags()}
        style={{ "margin-top": "12rem" }}
      />
      {props.title.genres.length > 0 && (
        <div class="t-label muted one-line" style={{ "margin-top": "8rem" }}>
          {props.title.genres.join(", ")}
        </div>
      )}
      <div class="detail-about">
        {props.title.overview ? (
          <Overview text={props.title.overview} tagline={props.title.tagline} />
        ) : (
          <span />
        )}
        {/* A movie's file: its picture, audio, and subtitles. A show's differ by episode. */}
        <Show when={!show() && next()}>
          {(item) => <FileInfo item={item()} />}
        </Show>
      </div>
      <div class="detail-actions" data-fg={ACTIONS} data-fk="row">
        <PlayButton item={next()} />
        {!show() && next() && isResuming(next()) && (
          <IconButton
            fid="restart"
            icon={RotateCcw}
            label={tr("actionsPlayFromStart")}
            onPress={() => {
              const item = next()
              if (item) nav.play(item.id, 0)
            }}
          />
        )}
        <Marks
          watched={watched()}
          onWatched={() => {
            if (watched()) {
              void toasts.showing(tr("mediaMarkUnwatchedFailed"), () =>
                viewer.setWatched(props.title, false),
              )
            } else {
              actions.askWatched(props.title.name, (when) =>
                viewer.setWatched(props.title, true, undefined, when),
              )
            }
          }}
          favorite={favorite()}
          onFavorite={() =>
            void toasts.showing(tr("mediaFavoriteFailed"), () =>
              viewer.setFavorite(props.title, !favorite()),
            )
          }
        />
      </div>
    </div>
  )

  return (
    <Page class="page fill" start={start}>
      <DetailList header={header}>
        <Show when={nextUp()}>{(item) => <NextUpRow item={item()} />}</Show>
        <Show when={show() && only()}>
          {(season) => (
            <EpisodesRow
              heading={tr("titleEpisodes")}
              name="episodes"
              titleId={props.title.id}
              season={season().number}
              start={next()?.id}
            />
          )}
        </Show>
        <Show when={show() && props.title.seasons.length > 0}>
          <Row title={tr("titleSeasons")} name="seasons">
            <For each={props.title.seasons}>
              {(season) => {
                const left = season.itemCount - season.watchedCount
                return (
                  <CaptionedPoster
                    fid={String(season.number ?? NO_SEASON)}
                    name={seasonName(season.number)}
                    poster={art(season.poster ?? props.title.images.poster)}
                    detail={plural("mediaEpisodeCount", season.itemCount)}
                    watched={left === 0}
                    badge={String(left)}
                    onPress={() => nav.season(props.title.id, season.number)}
                    onMenu={() =>
                      actions.open({
                        kind: "season",
                        title: props.title,
                        season,
                      })
                    }
                  />
                )
              }}
            </For>
          </Row>
        </Show>
        <Show when={people().length > 0}>
          <Row title={tr("tvDetailPeople")} name="people">
            <For each={people()}>
              {(person) => (
                <PersonCard
                  fid={`${person.name}-${person.role}`}
                  name={person.name}
                  detail={person.role}
                  photo={art(person.photo, "thumb")}
                  onPress={() =>
                    nav.person(person.name, person.tmdbId ?? undefined)
                  }
                />
              )}
            </For>
          </Row>
        </Show>
        <Show
          when={props.title.genres.length > 0 || props.title.studios.length > 0}
        >
          <Row title={tr("tvDetailLinks")} name="links" buttons>
            <For each={props.title.genres}>
              {(genre) => (
                <Chip
                  fid={`genre-${genre}`}
                  label={genre}
                  onPress={() => nav.genre(genre)}
                />
              )}
            </For>
            <For each={props.title.studios}>
              {(studio) => (
                <Chip
                  fid={`studio-${studio}`}
                  label={studio}
                  onPress={() => nav.studio(studio)}
                />
              )}
            </For>
          </Row>
        </Show>
      </DetailList>
    </Page>
  )
}

/** The episode up next on a show's page, in a row of its own, as the phone's page leads with it. */
function NextUpRow(props: { item: MediaItem }) {
  const { nav, viewer, actions } = useApp()
  const label = () => itemLabel(props.item)
  const number = () => episodeNumber(props.item)
  return (
    <Row
      title={tr(
        props.item.progress ? "titleNextUpContinue" : "titleNextUpNext",
      )}
      name="nextUp"
    >
      <LandscapeCard
        fid={props.item.id}
        toneKey={label().showName}
        art={landscape(props.item)}
        caption={
          number() !== null && !label().untitled
            ? tr("titleEpisodesCodedName", number() ?? 0, label().title)
            : label().title
        }
        detail={
          [
            formatDay(props.item.episode?.airDate),
            props.item.progress?.completed === false
              ? timeLeft(props.item)
              : formatRuntime(runtimeMinutes(props.item)),
          ]
            .filter(Boolean)
            .join(" · ") || null
        }
        progress={progressRatio(props.item)}
        watched={viewer.isItemWatched(props.item)}
        onPress={() => nav.episode(props.item.id)}
        onMenu={() => actions.open({ kind: "item", item: props.item })}
      />
    </Row>
  )
}

/**
 * An episode's facts: its air date, then its runtime. With `left`, the
 * time left in it instead while it's in progress; an episode's page
 * leaves that out, since its Resume button says it.
 */
function episodeFacts(item: MediaItem, viewer: Viewer, left = false): string[] {
  const resuming = left && isResuming(item) && !viewer.isItemWatched(item)
  return [
    formatDay(item.episode?.airDate),
    resuming ? timeLeft(item) : formatRuntime(runtimeMinutes(item)),
  ].filter((fact): fact is string => Boolean(fact))
}

/** A season's page on a TV. `season` null is the files without a season number. */
export function SeasonPage(props: { titleId: string; season: number | null }) {
  const loader = useLoader(`title-${props.titleId}`, () =>
    session.api.titles.get({ id: props.titleId }),
  )
  // The season on screen, which the tabs change without leaving the page.
  const [shown, setShown] = useKept("season", String(props.season ?? NO_SEASON))
  return (
    <Loaded
      load={loader().state}
      error={tr("titleSeasonShowError")}
      retry={() => loader().reload()}
    >
      {(title) => {
        const matches = (season: Season) =>
          String(season.number ?? NO_SEASON) === shown()
        // Hidden specials still open from a link.
        const current = () =>
          title.seasons.find(matches) ??
          (title.specials && matches(title.specials)
            ? title.specials
            : undefined)
        return (
          <Show
            when={current()}
            fallback={<Message title={tr("titleSeasonMissing", title.name)} />}
            keyed
          >
            {(season) => (
              <SeasonView
                title={title}
                season={season}
                onSeason={(picked) =>
                  setShown(String(picked.number ?? NO_SEASON))
                }
              />
            )}
          </Show>
        )
      }}
    </Loaded>
  )
}

/**
 * The season over its show's backdrop: the show's name, the season, or
 * tabs for every season of a show with more than one, how many episodes
 * it has and are watched, and Play with the marks. Below, its episodes in
 * a row, with what the focused one is about above them. Focus starts on
 * the episode Play would start.
 */
function SeasonView(props: {
  title: Title
  season: Season
  onSeason: (season: Season) => void
}) {
  const { nav, viewer, actions, toasts } = useApp()
  const items = useSeasonItems(props.title.id, props.season.number)
  const list = () => items().value
  const next = () => seasonNext(list(), viewer)
  const row = `episodes-${props.season.number ?? NO_SEASON}`
  useBackdrop(() => present(art(props.title.images.backdrop, "large")))
  const [focusedItem, setFocusedItem] = createSignal<MediaItem | null>(null)
  // Hidden specials, opened from a link, get a tab while they're on screen.
  const tabs = () =>
    props.season === props.title.specials
      ? [props.season, ...props.title.seasons]
      : props.title.seasons
  const watched = () => {
    const current = list()
    return (
      current !== undefined &&
      current.length > 0 &&
      current.every((item) => viewer.isItemWatched(item))
    )
  }
  const favorite = () =>
    props.season.number === null
      ? null
      : viewer.isSeasonFavorite(props.title, props.season)
  const name = `${props.title.name} · ${seasonName(props.season.number)}`
  // What the focused episode is about; with focus above, the one Play starts.
  const about = () => focusedItem() ?? next()
  // Read here, with the list: by the time focus asks, the load may have
  // moved on from what this draw shows.
  const loading = () => items().state.kind === "loading"
  const start = (): Start | null => {
    if (loading()) return null
    return next() ? [row, next()?.id ?? ""] : [ACTIONS, WATCHED]
  }
  return (
    <Page class="page fill season" start={start}>
      <div class="season-header">
        <div
          class="t-title one-line"
          style={{ color: "rgba(var(--fg-rgb), 0.9)" }}
        >
          {props.title.name}
        </div>
        {tabs().length > 1 ? (
          <div class="season-tabs" data-fg="tabs" data-fk="row">
            <For each={tabs()}>
              {(tab) => (
                <Chip
                  fid={String(tab.number ?? NO_SEASON)}
                  label={seasonName(tab.number)}
                  selected={tab.number === props.season.number}
                  role="tab"
                  onPress={() => props.onSeason(tab)}
                />
              )}
            </For>
          </div>
        ) : (
          <div class="t-hero one-line" style={{ "margin-top": "2rem" }}>
            {seasonName(props.season.number)}
          </div>
        )}
        <div class="t-facts dim85" style={{ "margin-top": "6rem" }}>
          {[
            plural("mediaEpisodeCount", props.season.itemCount),
            plural("titleSeasonWatchedCount", props.season.watchedCount),
          ].join("  ·  ")}
        </div>
        <div
          class="detail-actions"
          style={{ "margin-top": "18rem" }}
          data-fg={ACTIONS}
          data-fk="row"
        >
          <PlayButton item={next()} />
          <Marks
            watched={watched()}
            onWatched={() => {
              if (watched()) {
                void toasts.showing(tr("mediaMarkUnwatchedFailed"), () =>
                  setSeasonWatched(
                    viewer,
                    props.title,
                    props.season.number,
                    false,
                  ),
                )
              } else {
                actions.askWatched(name, (when) =>
                  setSeasonWatched(
                    viewer,
                    props.title,
                    props.season.number,
                    true,
                    when,
                  ),
                )
              }
            }}
            favorite={favorite()}
            onFavorite={() =>
              void toasts.showing(tr("mediaFavoriteFailed"), () =>
                viewer.setSeasonFavorite(
                  props.title,
                  props.season,
                  !favorite(),
                ),
              )
            }
          />
          <IconButton
            fid="show"
            icon={Tv}
            label={tr("actionsGoToShow", props.title.name)}
            onPress={() => nav.titleUp(props.title.id)}
          />
        </div>
      </div>
      <div class="season-space" />
      <div class="season-about">
        <Show when={about()}>
          {(item) => (
            <>
              <div class="t-title one-line">
                {(() => {
                  const label = itemLabel(item())
                  const number = episodeNumber(item())
                  return number !== null && !label.untitled
                    ? tr("titleEpisodesCodedName", number, label.title)
                    : label.title
                })()}
              </div>
              {/* The time left in the episode Play resumes is on the button, so not here. */}
              <div class="t-caption muted one-line">
                {episodeFacts(item(), viewer, item().id !== next()?.id).join(
                  "  ·  ",
                )}
              </div>
              {item().episode?.overview && (
                <div class="t-body dim78 lines season-overview">
                  {item().episode?.overview}
                </div>
              )}
            </>
          )}
        </Show>
      </div>
      <Show when={items().state.kind === "loading"}>
        <div class="season-row center">
          <Spinner size={32} class="muted" />
        </div>
      </Show>
      <Show when={items().state.kind === "failed" ? items().state : null} keyed>
        {(state) => (
          <div
            class="season-row t-body muted"
            style={{ padding: "24rem 32rem 0 80rem" }}
          >
            {tr(
              "titleEpisodesError",
              state.kind === "failed" ? state.message : "",
            )}
          </div>
        )}
      </Show>
      <Show when={list()}>
        {(episodes) => (
          <div class="season-row">
            <Row title={null} name={row}>
              <For each={episodes()}>
                {(item) => (
                  <EpisodeCard
                    item={item}
                    detail={false}
                    onFocus={() => setFocusedItem(item)}
                  />
                )}
              </For>
            </Row>
          </div>
        )}
      </Show>
    </Page>
  )
}

/** An episode's page on a TV, or a loose file's. */
export function EpisodePage(props: { itemId: string }) {
  const loader = useLoader(`media-${props.itemId}`, () =>
    session.api.media.get({ id: props.itemId }),
  )
  return (
    <Loaded
      load={loader().state}
      error={tr("titleEpisodeLoadError")}
      retry={() => loader().reload()}
    >
      {(item) => <EpisodeView item={item} />}
    </Loaded>
  )
}

/**
 * The episode over its still, or its show's art: the show, season and
 * number, name, facts, overview, and file, with Play and its marks and
 * the ways to its season and show. Below, the rest of its season.
 */
function EpisodeView(props: { item: MediaItem }) {
  const { nav, viewer, actions, toasts } = useApp()
  const label = () => itemLabel(props.item)
  const title = () => props.item.title
  useBackdrop(() =>
    present(
      art(props.item.episode?.still, "large"),
      art(title()?.images.backdrop, "large"),
      frame(props.item.id, true),
    ),
  )
  const resume = () => isResuming(props.item)
  const watched = () => viewer.isItemWatched(props.item)
  const favorite = () => viewer.isItemFavorite(props.item)
  const where = () => {
    const season = props.item.seasonNumber
    return [
      season === null
        ? null
        : season === 0
          ? tr("titleEpisodeSpecials")
          : tr("titleEpisodeSeason", season),
      props.item.episodeNumber === null
        ? null
        : tr("titleEpisodeNumber", props.item.episodeNumber),
    ]
      .filter(Boolean)
      .join("  ·  ")
  }
  const header = (
    <div class="detail-header">
      <div
        class="t-title one-line"
        style={{ color: "rgba(var(--fg-rgb), 0.9)" }}
      >
        {label().showName}
      </div>
      {where() && (
        <div class="t-facts muted" style={{ "margin-top": "2rem" }}>
          {where()}
        </div>
      )}
      <div
        class="t-hero lines"
        style={{ "margin-top": "6rem", width: "720rem" }}
      >
        {label().title}
      </div>
      <Facts
        facts={episodeFacts(props.item, viewer)}
        contentRating={title()?.contentRating}
        style={{ "margin-top": "12rem" }}
      />
      <div class="detail-about">
        {props.item.episode?.overview ? (
          <Overview text={props.item.episode.overview} lines={4} />
        ) : (
          <span />
        )}
        <FileInfo item={props.item} />
      </div>
      <div class="detail-actions" data-fg={ACTIONS} data-fk="row">
        <PlayButton item={props.item} />
        {resume() && (
          <IconButton
            fid="restart"
            icon={RotateCcw}
            label={tr("actionsPlayFromStart")}
            onPress={() => nav.play(props.item.id, 0)}
          />
        )}
        <Marks
          watched={watched()}
          onWatched={() => {
            if (watched()) {
              void toasts.showing(tr("mediaMarkUnwatchedFailed"), () =>
                viewer.setItemWatched(props.item, false),
              )
            } else {
              actions.askWatched(label().title, (when) =>
                viewer.setItemWatched(props.item, true, when),
              )
            }
          }}
          favorite={favorite()}
          onFavorite={() =>
            void toasts.showing(tr("mediaFavoriteFailed"), () =>
              viewer.setItemFavorite(props.item, !favorite()),
            )
          }
        />
        {title() && props.item.seasonNumber !== null && (
          <IconButton
            fid="season"
            icon={List}
            label={tr("actionsGoToShow", seasonName(props.item.seasonNumber))}
            onPress={() =>
              nav.seasonUp(title()?.id ?? "", props.item.seasonNumber ?? null)
            }
          />
        )}
        {title() && (
          <IconButton
            fid="show"
            icon={Tv}
            label={tr("actionsGoToShow", title()?.name ?? "")}
            onPress={() => nav.titleUp(title()?.id ?? "")}
          />
        )}
      </div>
    </div>
  )
  return (
    <Page class="page fill" start={() => [ACTIONS, PLAY]}>
      <DetailList header={header}>
        <Show when={title()}>
          {(show) => (
            <EpisodesRow
              heading={tr(
                "titleEpisodeMoreFrom",
                seasonName(props.item.seasonNumber),
              )}
              name="more"
              titleId={show().id}
              season={props.item.seasonNumber}
              exclude={props.item.id}
            />
          )}
        </Show>
      </DetailList>
    </Page>
  )
}
