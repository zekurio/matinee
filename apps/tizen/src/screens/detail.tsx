import type { MediaItem, Season, Title } from "@matinee/contracts"
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
import type { ComponentChildren } from "preact"
import { useState } from "preact/hooks"

import { useHideClock } from "@/app/chrome"
import { Page, type Start, useBackdrop } from "@/app/page"
import { useApp, useKept, useLoader, usePage } from "@/app/scope"
import { session } from "@/auth/session"
import { plural, tr } from "@/i18n"
import { cx, Icon, Spinner } from "@/kit/base"
import { Button, Chip, IconButton } from "@/kit/buttons"
import {
  CaptionedPoster,
  LandscapeCard,
  PersonCard,
  Row,
  TitleLogo,
} from "@/kit/cards"
import { Facts } from "@/kit/misc"
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
} from "@/model/format"
import type { Viewer } from "@/model/viewer"

import { Loaded, Message } from "./parts"

/* The title, season, and episode pages, as the Android TV app's `ui/tv/detail`. */

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
function DetailList(props: {
  header: ComponentChildren
  children?: ComponentChildren
}) {
  const [scrolled, setScrolled] = useState(false)
  useHideClock(scrolled)
  return (
    <div
      class={cx("detail-list fill", scrolled && "scrolled")}
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
  const { item } = props
  const api = session.api
  const tracks = useLoader(`tracks-${item.id}`, async () => {
    const [audio, subtitles] = await Promise.all([
      api.media.audio({ id: item.id }),
      api.media.subtitles({ id: item.id }),
    ])
    return {
      audio: audio
        .toSorted((a, b) => Number(b.primary) - Number(a.primary))
        .map((track) => track.language),
      subtitles: subtitles.tracks.map((track) => track.language),
    }
  })
  const probe = item.probe
  if (!probe) return null
  const audio =
    tracks.value?.audio ??
    probe.audio
      .toSorted((a, b) => Number(b.default) - Number(a.default))
      .map((stream) => stream.language)
  const subtitles =
    tracks.value?.subtitles ?? probe.subtitles.map((stream) => stream.language)
  const main = probe.audio.find((stream) => stream.default) ?? probe.audio[0]
  const video = videoSummary(item)
  // Each language once; a file whose tracks don't say gets their count instead.
  const audioLine = [
    languageList(audio) ??
      (audio.length > 0 ? plural("media_audio_tracks", audio.length) : null),
    main?.layout,
  ]
    .filter(Boolean)
    .join(" · ")
  const subtitleLine =
    languageList(subtitles) ??
    (subtitles.length > 0 ? plural("media_subtitles", subtitles.length) : null)
  const line = (icon: IconNode, label: string, text: string | null) =>
    text && (
      <div class="file-line" aria-label={label}>
        <Icon icon={icon} size={16} class="muted" />
        <span class="t-caption lines">{text}</span>
      </div>
    )
  if (!video && !audioLine && !subtitleLine) return null
  return (
    <div class="file-info">
      {line(Film, tr("media_info_video"), video)}
      {line(AudioLines, tr("media_info_audio"), audioLine || null)}
      {line(Captions, tr("media_info_subtitles"), subtitleLine)}
    </div>
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
        label={tr(
          props.watched ? "media_mark_unwatched" : "media_mark_watched",
        )}
        tint={props.watched ? "var(--accent)" : undefined}
        onPress={props.onWatched}
      />
      {props.favorite !== null && (
        <IconButton
          fid="favorite"
          icon={Heart}
          filled={props.favorite}
          label={tr(
            props.favorite ? "media_remove_favorite" : "media_add_favorite",
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
  const { item } = props
  const resume = isResuming(item)
  return (
    <Button
      fid={PLAY}
      label={tr(resume ? "title_resume" : "title_play")}
      icon={Play}
      minWidth={180}
      detail={resume && item ? timeLeft(item) : null}
      disabled={!item}
      onPress={() => {
        if (item) nav.play(item.id)
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
  const { item } = props
  const detail = props.detail ?? true
  const label = itemLabel(item)
  const left = item.progress?.completed === false ? timeLeft(item) : null
  const number = episodeNumber(item)
  return (
    <LandscapeCard
      fid={item.id}
      toneKey={label.showName}
      art={landscape(item)}
      caption={
        detail || number === null || label.untitled
          ? label.title
          : tr("title_episodes_coded_name", number, label.title)
      }
      // An episode without a name is called by its number already.
      detail={
        detail
          ? [
              label.untitled ? null : number,
              left ?? formatRuntime(runtimeMinutes(item)),
            ]
              .filter(Boolean)
              .join(" · ") || null
          : null
      }
      progress={progressRatio(item)}
      watched={viewer.isItemWatched(item)}
      onPress={() => nav.item(item)}
      onMenu={() => actions.open({ kind: "item", item })}
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
  const list = (items.value ?? []).filter((item) => item.id !== props.exclude)
  if (list.length === 0) return null
  if (props.start && list.some((item) => item.id === props.start)) {
    scope.memory.seed(props.name, props.start)
  }
  return (
    <Row title={props.heading} name={props.name}>
      {list.map((item) => (
        <EpisodeCard key={item.id} item={item} />
      ))}
    </Row>
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
      load={loader.state}
      error={tr("title_load_error")}
      retry={() => loader.reload()}
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
  const { title } = props
  const { nav, viewer, actions, toasts } = useApp()
  const next = title.next
  const show = title.kind === "show"
  useBackdrop(
    present(
      art(title.images.backdrop, "large"),
      next ? frame(next.id, true) : null,
    ),
  )
  // One season, so no specials either: its episodes go right on the show's page.
  const only = title.seasons.length === 1 ? title.seasons[0] : undefined
  const watched = viewer.isWatched(title)
  const favorite = viewer.isFavorite(title)
  const cast = title.credits.filter((credit) => credit.kind === "actor")
  const crew = (["creator", "director", "writer"] as const).flatMap((kind) => {
    const seen = new Set<string>()
    return title.credits
      .filter((credit) => credit.kind === kind)
      .filter((credit) => !seen.has(credit.name) && seen.add(credit.name))
      .map((credit) => ({ ...credit, role: creditKind(kind, 1) }))
  })
  const people = [...cast, ...crew]
  const start = (): Start => [ACTIONS, next ? PLAY : WATCHED]

  const header = (
    <div class="detail-header">
      <TitleLogo
        name={title.name}
        logo={title.images.logo}
        width={420}
        height={110}
      >
        <div class="t-hero lines" style={{ width: "720rem" }}>
          {title.name}
        </div>
      </TitleLogo>
      {title.originalName && title.originalName !== title.name && (
        <div class="t-body muted one-line">{title.originalName}</div>
      )}
      <Facts
        facts={titleFacts(title)}
        contentRating={title.contentRating}
        rating={title.rating}
        flags={show || !next ? [] : mediaFlags(next)}
        style={{ marginTop: "12rem" }}
      />
      {title.genres.length > 0 && (
        <div class="t-label muted one-line" style={{ marginTop: "8rem" }}>
          {title.genres.join(", ")}
        </div>
      )}
      <div class="detail-about">
        {title.overview ? (
          <Overview text={title.overview} tagline={title.tagline} />
        ) : (
          <span />
        )}
        {/* A movie's file: its picture, audio, and subtitles. A show's differ by episode. */}
        {!show && next && <FileInfo item={next} />}
      </div>
      <div class="detail-actions" data-fg={ACTIONS} data-fk="row">
        <PlayButton item={next} />
        {!show && next && isResuming(next) && (
          <IconButton
            fid="restart"
            icon={RotateCcw}
            label={tr("actions_play_from_start")}
            onPress={() => nav.play(next.id, 0)}
          />
        )}
        <Marks
          watched={watched}
          onWatched={() => {
            if (watched) {
              void toasts.showing(tr("media_mark_unwatched_failed"), () =>
                viewer.setWatched(title, false),
              )
            } else {
              actions.askWatched(title.name, (when) =>
                viewer.setWatched(title, true, undefined, when),
              )
            }
          }}
          favorite={favorite}
          onFavorite={() =>
            void toasts.showing(tr("media_favorite_failed"), () =>
              viewer.setFavorite(title, !favorite),
            )
          }
        />
      </div>
    </div>
  )

  return (
    <Page class="page fill" start={start}>
      <DetailList header={header}>
        {show && next && showsNextUp(title) && <NextUpRow item={next} />}
        {show && only && (
          <EpisodesRow
            heading={tr("title_episodes")}
            name="episodes"
            titleId={title.id}
            season={only.number}
            start={next?.id}
          />
        )}
        {show && title.seasons.length > 0 && (
          <Row title={tr("title_seasons")} name="seasons">
            {title.seasons.map((season) => {
              const left = season.itemCount - season.watchedCount
              return (
                <CaptionedPoster
                  key={season.number ?? NO_SEASON}
                  fid={String(season.number ?? NO_SEASON)}
                  name={seasonName(season.number)}
                  poster={art(season.poster ?? title.images.poster)}
                  detail={plural("media_episode_count", season.itemCount)}
                  watched={left === 0}
                  badge={String(left)}
                  onPress={() => nav.season(title.id, season.number)}
                  onMenu={() => actions.open({ kind: "season", title, season })}
                />
              )
            })}
          </Row>
        )}
        {people.length > 0 && (
          <Row title={tr("tv_detail_people")} name="people">
            {people.map((person) => (
              <PersonCard
                key={`${person.name}-${person.role}`}
                fid={`${person.name}-${person.role}`}
                name={person.name}
                detail={person.role}
                photo={art(person.photo, "thumb")}
                onPress={() =>
                  nav.person(person.name, person.tmdbId ?? undefined)
                }
              />
            ))}
          </Row>
        )}
        {(title.genres.length > 0 || title.studios.length > 0) && (
          <Row title={tr("tv_detail_links")} name="links" buttons>
            {title.genres.map((genre) => (
              <Chip
                key={`genre-${genre}`}
                fid={`genre-${genre}`}
                label={genre}
                onPress={() => nav.genre(genre)}
              />
            ))}
            {title.studios.map((studio) => (
              <Chip
                key={`studio-${studio}`}
                fid={`studio-${studio}`}
                label={studio}
                onPress={() => nav.studio(studio)}
              />
            ))}
          </Row>
        )}
      </DetailList>
    </Page>
  )
}

/** The episode up next on a show's page, in a row of its own, as the phone's page leads with it. */
function NextUpRow(props: { item: MediaItem }) {
  const { nav, viewer, actions } = useApp()
  const { item } = props
  const label = itemLabel(item)
  const number = episodeNumber(item)
  return (
    <Row
      title={tr(
        item.progress ? "title_next_up_continue" : "title_next_up_next",
      )}
      name="nextUp"
    >
      <LandscapeCard
        fid={item.id}
        toneKey={label.showName}
        art={landscape(item)}
        caption={
          number !== null && !label.untitled
            ? tr("title_episodes_coded_name", number, label.title)
            : label.title
        }
        detail={
          [
            formatDay(item.episode?.airDate),
            item.progress?.completed === false
              ? timeLeft(item)
              : formatRuntime(runtimeMinutes(item)),
          ]
            .filter(Boolean)
            .join(" · ") || null
        }
        progress={progressRatio(item)}
        watched={viewer.isItemWatched(item)}
        onPress={() => nav.episode(item.id)}
        onMenu={() => actions.open({ kind: "item", item })}
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
      load={loader.state}
      error={tr("title_season_show_error")}
      retry={() => loader.reload()}
    >
      {(title) => {
        const matches = (season: Season) =>
          String(season.number ?? NO_SEASON) === shown
        // Hidden specials still open from a link.
        const current =
          title.seasons.find(matches) ??
          (title.specials && matches(title.specials)
            ? title.specials
            : undefined)
        if (!current) {
          return <Message title={tr("title_season_missing", title.name)} />
        }
        return (
          <SeasonView
            key={shown}
            title={title}
            season={current}
            onSeason={(season) => setShown(String(season.number ?? NO_SEASON))}
          />
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
  const { title, season } = props
  const { nav, viewer, actions, toasts } = useApp()
  const items = useSeasonItems(title.id, season.number)
  const list = items.value
  const next = seasonNext(list, viewer)
  const row = `episodes-${season.number ?? NO_SEASON}`
  useBackdrop(present(art(title.images.backdrop, "large")))
  const [focusedItem, setFocusedItem] = useState<MediaItem | null>(null)
  // Hidden specials, opened from a link, get a tab while they're on screen.
  const tabs =
    season === title.specials ? [season, ...title.seasons] : title.seasons
  const watched =
    list !== undefined &&
    list.length > 0 &&
    list.every((item) => viewer.isItemWatched(item))
  const favorite =
    season.number === null ? null : viewer.isSeasonFavorite(title, season)
  const name = `${title.name} · ${seasonName(season.number)}`
  // What the focused episode is about; with focus above, the one Play starts.
  const about = focusedItem ?? next
  // Read here, with the list: by the time focus asks, the load may have
  // moved on from what this draw shows.
  const loading = items.state.kind === "loading"
  const start = (): Start | null => {
    if (loading) return null
    return next ? [row, next.id] : [ACTIONS, WATCHED]
  }
  return (
    <Page class="page fill season" start={start}>
      <div class="season-header">
        <div
          class="t-title one-line"
          style={{ color: "rgba(var(--fg-rgb), 0.9)" }}
        >
          {title.name}
        </div>
        {tabs.length > 1 ? (
          <div class="season-tabs" data-fg="tabs" data-fk="row">
            {tabs.map((tab) => (
              <Chip
                key={tab.number ?? NO_SEASON}
                fid={String(tab.number ?? NO_SEASON)}
                label={seasonName(tab.number)}
                selected={tab.number === season.number}
                role="tab"
                onPress={() => props.onSeason(tab)}
              />
            ))}
          </div>
        ) : (
          <div class="t-hero one-line" style={{ marginTop: "2rem" }}>
            {seasonName(season.number)}
          </div>
        )}
        <div class="t-facts dim85" style={{ marginTop: "6rem" }}>
          {[
            plural("media_episode_count", season.itemCount),
            plural("title_season_watched_count", season.watchedCount),
          ].join("  ·  ")}
        </div>
        <div
          class="detail-actions"
          style={{ marginTop: "18rem" }}
          data-fg={ACTIONS}
          data-fk="row"
        >
          <PlayButton item={next} />
          <Marks
            watched={watched}
            onWatched={() => {
              if (watched) {
                void toasts.showing(tr("media_mark_unwatched_failed"), () =>
                  setSeasonWatched(viewer, title, season.number, false),
                )
              } else {
                actions.askWatched(name, (when) =>
                  setSeasonWatched(viewer, title, season.number, true, when),
                )
              }
            }}
            favorite={favorite}
            onFavorite={() =>
              void toasts.showing(tr("media_favorite_failed"), () =>
                viewer.setSeasonFavorite(title, season, !favorite),
              )
            }
          />
          <IconButton
            fid="show"
            icon={Tv}
            label={tr("actions_go_to_show", title.name)}
            onPress={() => nav.titleUp(title.id)}
          />
        </div>
      </div>
      <div class="season-space" />
      <div class="season-about">
        {about && (
          <>
            <div class="t-title one-line">
              {(() => {
                const label = itemLabel(about)
                const number = episodeNumber(about)
                return number !== null && !label.untitled
                  ? tr("title_episodes_coded_name", number, label.title)
                  : label.title
              })()}
            </div>
            {/* The time left in the episode Play resumes is on the button, so not here. */}
            <div class="t-caption muted one-line">
              {episodeFacts(about, viewer, about.id !== next?.id).join("  ·  ")}
            </div>
            {about.episode?.overview && (
              <div class="t-body dim78 lines season-overview">
                {about.episode.overview}
              </div>
            )}
          </>
        )}
      </div>
      {items.state.kind === "loading" && (
        <div class="season-row center">
          <Spinner size={32} class="muted" />
        </div>
      )}
      {items.state.kind === "failed" && (
        <div
          class="season-row t-body muted"
          style={{ padding: "24rem 32rem 0 80rem" }}
        >
          {tr("title_episodes_error", items.state.message)}
        </div>
      )}
      {list && (
        <div class="season-row">
          <Row title={null} name={row}>
            {list.map((item) => (
              <EpisodeCard
                key={item.id}
                item={item}
                detail={false}
                onFocus={() => setFocusedItem(item)}
              />
            ))}
          </Row>
        </div>
      )}
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
      load={loader.state}
      error={tr("title_episode_load_error")}
      retry={() => loader.reload()}
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
  const { item } = props
  const { nav, viewer, actions, toasts } = useApp()
  const { title, seasonNumber: season } = item
  const label = itemLabel(item)
  useBackdrop(
    present(
      art(item.episode?.still, "large"),
      art(title?.images.backdrop, "large"),
      frame(item.id, true),
    ),
  )
  const resume = isResuming(item)
  const watched = viewer.isItemWatched(item)
  const favorite = viewer.isItemFavorite(item)
  const where = [
    season === null
      ? null
      : season === 0
        ? tr("title_episode_specials")
        : tr("title_episode_season", season),
    item.episodeNumber === null
      ? null
      : tr("title_episode_number", item.episodeNumber),
  ]
    .filter(Boolean)
    .join("  ·  ")
  const header = (
    <div class="detail-header">
      <div
        class="t-title one-line"
        style={{ color: "rgba(var(--fg-rgb), 0.9)" }}
      >
        {label.showName}
      </div>
      {where && (
        <div class="t-facts muted" style={{ marginTop: "2rem" }}>
          {where}
        </div>
      )}
      <div class="t-hero lines" style={{ marginTop: "6rem", width: "720rem" }}>
        {label.title}
      </div>
      <Facts
        facts={episodeFacts(item, viewer)}
        contentRating={title?.contentRating}
        style={{ marginTop: "12rem" }}
      />
      <div class="detail-about">
        {item.episode?.overview ? (
          <Overview text={item.episode.overview} lines={4} />
        ) : (
          <span />
        )}
        <FileInfo item={item} />
      </div>
      <div class="detail-actions" data-fg={ACTIONS} data-fk="row">
        <PlayButton item={item} />
        {resume && (
          <IconButton
            fid="restart"
            icon={RotateCcw}
            label={tr("actions_play_from_start")}
            onPress={() => nav.play(item.id, 0)}
          />
        )}
        <Marks
          watched={watched}
          onWatched={() => {
            if (watched) {
              void toasts.showing(tr("media_mark_unwatched_failed"), () =>
                viewer.setItemWatched(item, false),
              )
            } else {
              actions.askWatched(label.title, (when) =>
                viewer.setItemWatched(item, true, when),
              )
            }
          }}
          favorite={favorite}
          onFavorite={() =>
            void toasts.showing(tr("media_favorite_failed"), () =>
              viewer.setItemFavorite(item, !favorite),
            )
          }
        />
        {title && season !== null && (
          <IconButton
            fid="season"
            icon={List}
            label={tr("actions_go_to_show", seasonName(season))}
            onPress={() => nav.seasonUp(title.id, season)}
          />
        )}
        {title && (
          <IconButton
            fid="show"
            icon={Tv}
            label={tr("actions_go_to_show", title.name)}
            onPress={() => nav.titleUp(title.id)}
          />
        )}
      </div>
    </div>
  )
  return (
    <Page class="page fill" start={() => [ACTIONS, PLAY]}>
      <DetailList header={header}>
        {title && (
          <EpisodesRow
            heading={tr("title_episode_more_from", seasonName(season))}
            name="more"
            titleId={title.id}
            season={season}
            exclude={item.id}
          />
        )}
      </DetailList>
    </Page>
  )
}
