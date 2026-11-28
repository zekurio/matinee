import type {
  Favorite,
  LeaderboardBoard,
  LeaderboardEntry,
  MediaItem,
  StatsRange,
  WatchStats,
} from "@matinee/contracts"
import {
  ChevronRight,
  Clock,
  Film,
  Heart,
  Play,
  Shield,
  Tv,
  TvMinimalPlay,
} from "lucide"
import { For, Show, createEffect, createSignal } from "solid-js"

import { useHideClock } from "../app/chrome"
import { Page } from "../app/page"
import { useApp, useKept, useLoader, useRefreshOnResume } from "../app/scope"
import { nameOf, session } from "../auth/session"
import { locale, plural, tr } from "../i18n"
import { remoteKey } from "../input/keys"
import { cx, Icon, Spinner, Tap } from "../kit/base"
import { Button, Chip } from "../kit/buttons"
import {
  ArtCard,
  Avatar,
  CaptionedPoster,
  LandscapeCard,
  Picture,
  Row,
  toneOf,
} from "../kit/cards"
import { SidePanel } from "../kit/panel"
import {
  art,
  episodeCode,
  itemLabel,
  landscape,
  present,
  progressRatio,
  seasonName,
} from "../model/format"
import {
  type BoardStanding,
  bucketName,
  formatWatchTime,
  hourName,
  metricName,
  metricValue,
  rangeName,
  rangePhrase,
  RANGES,
  scaleTop,
  standingsOf,
  startsNeighborhood,
  timeZone,
  weekdayName,
} from "../model/stats"
import type { Viewer } from "../model/viewer"
import { GRID, PosterGrid } from "./grid"
import { Message } from "./parts"

/* The signed-in person's pages on a TV. */

/** "November 2026", the month the person joined. */
function joinedMonth(joined: Date): string | null {
  return Number.isNaN(joined.getTime())
    ? null
    : joined.toLocaleDateString(locale, { month: "long", year: "numeric" })
}

/** A file watched: its still, the show or movie, and the episode, opening the file's page. */
function WatchedCard(props: { item: MediaItem; onFocus?: () => void }) {
  const { nav, viewer, actions } = useApp()
  const label = () => itemLabel(props.item)
  const code = () => episodeCode(props.item)
  return (
    <LandscapeCard
      fid={props.item.id}
      toneKey={label().showName}
      art={landscape(props.item)}
      caption={label().showName}
      detail={
        code()
          ? tr("mediaCodeTitle", code() ?? "", label().title)
          : label().year
      }
      progress={progressRatio(props.item)}
      watched={viewer.isItemWatched(props.item)}
      onPress={() => nav.item(props.item)}
      onMenu={() => actions.open({ kind: "item", item: props.item })}
      onFocus={props.onFocus}
    />
  )
}

/** A line, and one under it, where a section has nothing to show. */
function Notice(props: {
  title: string
  detail?: string | null
  /** Under a row's title, a line in the body's size rather than another title. */
  quiet?: boolean
}) {
  return (
    <div
      class="profile-inset"
      style={props.quiet ? { "margin-top": "12rem" } : undefined}
    >
      <div class={props.quiet ? "t-facts" : "t-title"}>{props.title}</div>
      {props.detail && (
        <div class="t-body muted" style={{ "margin-top": "4rem" }}>
          {props.detail}
        </div>
      )}
    </div>
  )
}

function LoadingRow() {
  return (
    <div class="center" style={{ height: "96rem" }}>
      <Spinner size={32} class="muted" />
    </div>
  )
}

/** Whether `favorite` is still one, so a favorite taken off here goes at once. */
function stillFavorite(viewer: Viewer, favorite: Favorite): boolean {
  switch (favorite.kind) {
    case "movie":
    case "show":
      return viewer.isFavorite(favorite.title)
    case "showSeason":
      return viewer.isSeasonFavorite(favorite.title, favorite.season)
    case "episode":
      return viewer.isItemFavorite(favorite.item)
  }
}

/** A favorite's name in the row, as the web's `favoriteKey`. */
function favoriteKey(favorite: Favorite): string {
  switch (favorite.kind) {
    case "movie":
    case "show":
      return `title/${favorite.title.id}`
    case "showSeason":
      return `season/${favorite.title.id}/${favorite.season.number}`
    case "episode":
      return `episode/${favorite.item.id}`
  }
}

/**
 * A favorite of any kind as a poster, so the row that mixes them lines
 * up, as the web's: a movie or a show with its year, a season on its own
 * poster, or an episode on its show's. An episode filed under no title
 * has no poster to stand on and shows nothing.
 */
function FavoriteCard(props: { favorite: Favorite }) {
  const { nav, viewer, actions } = useApp()
  const card = () => {
    const favorite = props.favorite
    const fid = favoriteKey(favorite)
    switch (favorite.kind) {
      case "movie":
      case "show": {
        const title = favorite.title
        return (
          <CaptionedPoster
            fid={fid}
            name={title.name}
            poster={art(title.images.poster)}
            detail={title.year === null ? null : String(title.year)}
            watched={viewer.isWatched(title)}
            onPress={() => nav.title(title.id)}
            onMenu={() => actions.open({ kind: "title", title })}
          />
        )
      }
      case "showSeason": {
        const { title, season } = favorite
        return (
          <CaptionedPoster
            fid={fid}
            name={title.name}
            poster={art(season.poster ?? title.images.poster)}
            detail={seasonName(season.number)}
            watched={
              season.itemCount > 0 && season.watchedCount >= season.itemCount
            }
            onPress={() => nav.season(title.id, season.number)}
            onMenu={() => actions.open({ kind: "season", title, season })}
          />
        )
      }
      case "episode": {
        const item = favorite.item
        const title = item.title
        if (!title) return null
        const label = itemLabel(item)
        const code = episodeCode(item)
        return (
          <CaptionedPoster
            fid={fid}
            name={label.showName}
            poster={art(title.images.poster)}
            detail={
              code ? tr("mediaCodeTitle", code, label.title) : label.title
            }
            watched={viewer.isItemWatched(item)}
            onPress={() => nav.item(item)}
            onMenu={() => actions.open({ kind: "item", item })}
          />
        )
      }
    }
  }
  return <>{card()}</>
}

/** The card at a row's end that opens the whole list. */
function SeeAll(props: {
  aspect: "poster" | "landscape"
  onPress: () => void
}) {
  return (
    <div class={props.aspect === "poster" ? "card-poster" : "card-landscape"}>
      <ArtCard
        fid="seeAll"
        toneKey="seeAll"
        aspect={props.aspect}
        label={tr("tvProfileSeeAll")}
        onPress={props.onPress}
      >
        <div class="see-all t-label">
          <Icon icon={props.aspect === "poster" ? Heart : Clock} size={28} />
          {tr("tvProfileSeeAll")}
        </div>
      </ArtCard>
    </div>
  )
}

/*
 * The statistics, laid out as the web's profile has them: the watch time
 * as a card beside the totals, then cards for the most watched titles,
 * the genres, where the person stands on the leaderboard, and when they
 * watch, in two columns. The two charts are one focus stop each, so the
 * page passes them with one press. Focused, the arrows move a mark across
 * their bars or squares, and the line above reads out the one marked. The
 * mark is the text color, as a focused control fills with it; an arrow
 * past the chart's edge leaves it.
 */

/** How tall the watch-time bars grow. */
const BARS_HEIGHT = 132
/** About how wide the bars run, which sets the gaps between them. */
const BARS_WIDTH = 400

/** A card's name, over a line across it, as the web's sections have it. */
function CardHead(props: { title: string }) {
  return <div class="stats-head t-facts one-line">{props.title}</div>
}

/**
 * The range's watch time: the total, large, over watch time per day,
 * week, or month as bars. Focused, a bar is marked, the newest first, and
 * the total's place reads that day, week, or month out instead.
 */
function WatchTimeChart(props: { stats: WatchStats }) {
  const [focused, setFocused] = createSignal(false)
  const [picked, setPicked] = createSignal(props.stats.buckets.length - 1)
  // Another range's buckets: the mark starts on the newest again.
  createEffect(
    () => props.stats,
    (stats) => {
      setPicked(stats.buckets.length - 1)
    },
  )
  const buckets = () => props.stats.buckets
  const shown = () =>
    focused()
      ? buckets()[Math.max(0, Math.min(picked(), buckets().length - 1))]
      : undefined
  const top = () =>
    scaleTop(Math.max(0, ...buckets().map((bucket) => bucket.watchSeconds)))
  // All time can hold hundreds of months, so the bars thin out to lines
  // rather than leave the chart. Each takes its share of the width.
  const count = () => Math.max(1, buckets().length)
  const share = () => 100 / count()
  const gap = () => Math.min((BARS_WIDTH / count()) * 0.25, 8)
  const first = () => buckets()[0]
  const last = () => buckets().at(-1)
  return (
    <Tap
      fid="watchTime"
      class="chart stats-card stats-watch"
      role="group"
      label={tr("statsWatchTime")}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onKeyDown={(event) => {
        const key = remoteKey(event)
        const next =
          key === "left" ? picked() - 1 : key === "right" ? picked() + 1 : null
        if (next === null || next < 0 || next >= buckets().length) return
        event.preventDefault()
        setPicked(next)
      }}
    >
      <div class="t-label muted one-line">
        {shown()
          ? `${bucketName(shown()!.start, props.stats.unit)}  ·  ${plural("statsPlayCount", shown()!.plays)}`
          : `${tr("statsWatchTime")}  ·  ${rangeName(props.stats.range)}`}
      </div>
      <div class="t-display one-line">
        {formatWatchTime(
          shown()?.watchSeconds ?? props.stats.totals.watchSeconds,
        )}
      </div>
      <Show when={first() && last()}>
        <div class="chart-row">
          <div class="chart-bars" style={{ height: `${BARS_HEIGHT}rem` }}>
            {/* The marked slot shows even where nothing was watched. */}
            {shown() && (
              <i
                class="chart-slot"
                style={{
                  left: `${picked() * share()}%`,
                  width: `${share()}%`,
                }}
              />
            )}
            <For each={buckets()}>
              {(bucket, index) =>
                bucket.watchSeconds <= 0 ? null : (
                  <i
                    class={cx(
                      "chart-bar",
                      shown() && (index() === picked() ? "marked" : "dimmed"),
                    )}
                    style={{
                      left: `calc(${index() * share()}% + ${gap() / 2}rem)`,
                      width: `calc(${share()}% - ${gap()}rem)`,
                      height: `${Math.max(3, (bucket.watchSeconds / top()) * BARS_HEIGHT)}rem`,
                      "border-radius": `${Math.max(0, Math.min(4, (BARS_WIDTH / count() - gap()) / 2))}rem`,
                    }}
                  />
                )
              }
            </For>
          </div>
          {/* The scale's figures, each under its line. The column takes
              the longer one's width, which some languages spell long. */}
          <div class="chart-scale t-caption muted">
            <span style={{ "margin-top": "4rem" }}>
              {formatWatchTime(top())}
            </span>
            <span style={{ "margin-top": `${BARS_HEIGHT / 2 + 4}rem` }}>
              {formatWatchTime(top() / 2)}
            </span>
          </div>
          <div class="chart-ends t-caption muted">
            <span>{bucketName(first()!.start, props.stats.unit)}</span>
            {buckets().length > 1 && (
              <span>{bucketName(last()!.start, props.stats.unit)}</span>
            )}
          </div>
        </div>
      </Show>
    </Tap>
  )
}

/**
 * Plays and what was finished as a card of rows beside the watch time,
 * as the web lists them: an icon, what the figure counts, and the figure.
 */
function Figures(props: { stats: WatchStats }) {
  const figures = () => [
    { icon: Play, label: tr("statsPlays"), value: props.stats.totals.plays },
    {
      icon: Film,
      label: tr("statsMoviesFinished"),
      value: props.stats.totals.movies,
    },
    {
      icon: Tv,
      label: tr("statsEpisodesFinished"),
      value: props.stats.totals.episodes,
    },
    {
      icon: TvMinimalPlay,
      label: tr("statsShowsWatched"),
      value: props.stats.totals.shows,
    },
  ]
  return (
    <div class="stats-card stats-figures">
      <For each={figures()}>
        {(figure) => (
          <div class="stats-figure">
            <Icon icon={figure.icon} size={20} class="lead" />
            <span class="t-facts one-line grow">{figure.label}</span>
            <span class="t-facts strong">
              {figure.value.toLocaleString(locale)}
            </span>
          </div>
        )}
      </For>
    </div>
  )
}

/**
 * The most watched titles, ranked, each with a small poster, how often it
 * was played, and its watch time at the end. Select opens the title.
 */
function TopTitles(props: { stats: WatchStats }) {
  const { nav, actions } = useApp()
  return (
    <div class="stats-card">
      <CardHead title={tr("statsTop")} />
      <div data-fg="top" data-fk="col">
        <For each={props.stats.titles}>
          {(entry, index) => (
            <Tap
              fid={entry.title.id}
              class="ctl item quiet stat-row"
              label={entry.title.name}
              onPress={() => nav.title(entry.title.id)}
              onMenu={() => actions.open({ kind: "title", title: entry.title })}
            >
              {/* The first three stand out, as on the web. */}
              <span class={cx("stat-rank t-label", index() >= 3 && "dim")}>
                {index() + 1}
              </span>
              <span
                class="stat-thumb"
                style={{ background: toneOf(entry.title.name) }}
              >
                <Picture sources={present(art(entry.title.images.poster))} />
              </span>
              <div class="words">
                <div class="t-facts one-line">{entry.title.name}</div>
                <div class="sub t-caption one-line">
                  {plural("statsPlayCount", entry.plays)}
                </div>
              </div>
              <span class="t-facts strong">
                {formatWatchTime(entry.watchSeconds)}
              </span>
            </Tap>
          )}
        </For>
      </div>
    </div>
  )
}

/**
 * Watch time per genre, a row each. A title can have several genres, so
 * their times add up to more than the whole. Select browses the genre.
 */
function Genres(props: { stats: WatchStats }) {
  const { nav } = useApp()
  return (
    <div class="stats-card">
      <CardHead title={tr("statsGenres")} />
      <div data-fg="genres" data-fk="col">
        <For each={props.stats.genres}>
          {(genre) => (
            <Tap
              fid={genre.name}
              class="ctl item quiet stat-row"
              onPress={() => nav.push({ page: "browse", genre: genre.name })}
            >
              <div class="words t-facts one-line">{genre.name}</div>
              <span class="t-facts strong">
                {formatWatchTime(genre.watchSeconds)}
              </span>
            </Tap>
          )}
        </For>
      </div>
    </div>
  )
}

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7]
const HOURS = [...Array(24).keys()]

/**
 * When in the week watching starts: a square per hour of each weekday,
 * deeper for more. Under the title the busiest time; focused, a square is
 * marked, the busiest first, and the line reads that hour and its watch
 * time out instead.
 */
function ViewingTimes(props: { stats: WatchStats }) {
  const [focused, setFocused] = createSignal(false)
  const peak = () =>
    props.stats.activity.reduce(
      (most, cell) => (cell.watchSeconds > most.watchSeconds ? cell : most),
      props.stats.activity[0] ?? { weekday: 1, hour: 0, watchSeconds: 0 },
    )
  // Weekdays count 1 to 7 from Monday, hours 0 to 23, as the server sends them.
  const [day, setDay] = createSignal(peak().weekday)
  const [hour, setHour] = createSignal(peak().hour)
  createEffect(
    () => peak(),
    (cell) => {
      setDay(cell.weekday)
      setHour(cell.hour)
    },
  )
  const seconds = () =>
    new Map(
      props.stats.activity.map((cell) => [
        cell.weekday * 24 + cell.hour,
        cell.watchSeconds,
      ]),
    )
  const most = () => Math.max(1, peak().watchSeconds)
  return (
    <Tap
      fid="viewingTimes"
      class="chart stats-card"
      role="group"
      label={tr("statsHeatmapTitle")}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onKeyDown={(event) => {
        const key = remoteKey(event)
        const toHour =
          key === "left" ? hour() - 1 : key === "right" ? hour() + 1 : hour()
        const toDay =
          key === "up" ? day() - 1 : key === "down" ? day() + 1 : day()
        if (toHour === hour() && toDay === day()) return
        if (toHour < 0 || toHour > 23 || toDay < 1 || toDay > 7) return
        event.preventDefault()
        setHour(toHour)
        setDay(toDay)
      }}
    >
      <CardHead title={tr("statsHeatmapTitle")} />
      <div
        class={cx("t-label one-line", !focused() && "muted")}
        style={{ margin: "0 0 12rem" }}
      >
        {focused()
          ? `${tr(
              "tvStatsHeatmapCell",
              weekdayName(day()),
              hourName(hour()),
              hourName((hour() + 1) % 24),
            )}  ·  ${formatWatchTime(seconds().get(day() * 24 + hour()) ?? 0)}`
          : tr(
              "statsHeatmapPeak",
              weekdayName(peak().weekday),
              hourName(peak().hour),
            )}
      </div>
      <For each={WEEKDAYS}>
        {(weekday) => (
          <div class="heat-row">
            <span
              class={cx(
                "heat-day t-caption",
                !(focused() && weekday === day()) && "muted",
              )}
            >
              {weekdayName(weekday, true)}
            </span>
            <For each={HOURS}>
              {(cell) => {
                const value = () => seconds().get(weekday * 24 + cell) ?? 0
                const marked = () =>
                  focused() && weekday === day() && cell === hour()
                return (
                  <i
                    class={cx("heat-cell", marked() && "marked")}
                    style={
                      value() > 0 && !marked()
                        ? {
                            background: `rgba(var(--accent-rgb), ${0.3 + (0.7 * value()) / most()})`,
                          }
                        : undefined
                    }
                  />
                )
              }}
            </For>
          </div>
        )}
      </For>
      {/* The hours under the squares, every six, as the web marks them. */}
      <div class="heat-row heat-hours t-caption muted">
        <span class="heat-day" />
        <For each={HOURS.filter((cell) => cell % 6 === 0)}>
          {(cell) => <span>{hourName(cell)}</span>}
        </For>
      </div>
    </Tap>
  )
}

/**
 * A place: the rank, the podium's in the accent, the person, and the
 * value. `small` is a board's in the standing, where the user's own place
 * is lit.
 */
function Place(props: {
  place: LeaderboardEntry
  value: string
  small?: boolean
}) {
  const name = () => nameOf(props.place.user)
  return (
    <div
      class={cx(
        "place",
        props.small ? "t-label small" : "t-facts",
        props.place.self && props.small && "self",
      )}
    >
      <span
        class={cx(
          "place-rank t-caption",
          props.place.rank <= 3 && `rank-${props.place.rank}`,
        )}
      >
        {props.place.rank}
      </span>
      <Avatar
        name={name()}
        url={props.place.user.avatarUrl}
        size={props.small ? 26 : 36}
      />
      <span class="place-name one-line">
        {props.place.self ? tr("statsNameYou", name()) : name()}
      </span>
      <span>{props.value}</span>
    </div>
  )
}

/**
 * Where the user stands on each board, as a card of boards, each with
 * their place between the people just above and below them. Select opens
 * the board whole in a panel. The last range's boards stay while the next
 * one's load, so the card doesn't drop out from under focus.
 */
function Standing(props: {
  range: StatsRange
  onOpen: (board: LeaderboardBoard) => void
}) {
  const board = useLoader(`leaderboard-${props.range}`, () =>
    session.api.stats.leaderboard({ range: props.range, timeZone: timeZone() }),
  )
  let last: readonly BoardStanding[] = []
  const standings = () => {
    const value = board().value
    if (value) last = standingsOf(value)
    return last
  }
  return (
    <Show when={standings().length > 0}>
      <div class="stats-card">
        <CardHead title={tr("statsStandingTitle")} />
        <div data-fg="standing" data-fk="col">
          <For each={standings()}>
            {(standing) => (
              <Tap
                fid={standing.board.metric}
                class="ctl board"
                label={metricName(standing.board.metric)}
                onPress={() => props.onOpen(standing.board)}
              >
                <div class="board-head t-label">
                  <span class="one-line">
                    {metricName(standing.board.metric)}
                  </span>
                  <Icon icon={ChevronRight} size={16} />
                </div>
                <For each={standing.places}>
                  {(place) => (
                    <Place
                      place={place}
                      value={metricValue(standing.board.metric, place.value)}
                      small
                    />
                  )}
                </For>
              </Tap>
            )}
          </For>
        </div>
      </div>
    </Show>
  )
}

/**
 * A whole board in the right-edge panel: the top places, then the user's
 * neighbourhood, set off. Each place takes focus so a long board scrolls;
 * focus starts on the user's own.
 */
function BoardPanel(props: {
  open: boolean
  board: LeaderboardBoard | null
  range: StatsRange
  onClose: () => void
}) {
  const self = () => props.board?.entries.find((entry) => entry.self)
  return (
    <SidePanel
      open={props.open}
      title={props.board ? metricName(props.board.metric) : null}
      description={rangeName(props.range)}
      initial={self()?.user.id}
      focusKey={props.board?.metric}
      onBack={props.onClose}
    >
      <For each={props.board?.entries ?? []}>
        {(place, index) => (
          <Tap
            fid={place.user.id}
            class={cx("ctl item quiet place-row", place.self && "self")}
            style={
              props.board && startsNeighborhood(props.board, index())
                ? { "margin-top": "16rem" }
                : undefined
            }
            role="listitem"
          >
            <Place
              place={place}
              value={
                props.board ? metricValue(props.board.metric, place.value) : ""
              }
            />
          </Tap>
        )}
      </For>
    </SidePanel>
  )
}

/**
 * The signed-in person on a TV, from the drawer's top entry, laid out as
 * the web's profile: who they are, their favorites as a
 * row of posters, their statistics for a range, and what they watched
 * last as a row of stills. A leaderboard board opens whole in the
 * right-edge panel. The web's requests row has no place here, since the
 * TV can't ask for titles.
 */
export function ProfilePage() {
  const { user, nav, viewer } = useApp()
  const api = session.api
  const profile = useLoader("profile", () =>
    api.profiles.get({ username: user.username }),
  )
  const [kept, setKept] = useKept("range", "all")
  const range = () => RANGES.find((candidate) => candidate === kept()) ?? "all"
  const stats = useLoader(`profile-stats-${range()}`, () =>
    api.profiles.stats({
      username: user.username,
      range: range(),
      timeZone: timeZone(),
    }),
  )
  useRefreshOnResume([profile, stats])
  // The last range's figures stay up while the next one loads, so the page doesn't jump.
  let last: WatchStats | null = null
  const shown = () => {
    const value = stats().value
    if (value) last = value
    return value ?? last
  }
  // With nothing ever watched, picking a period changes nothing.
  const neverWatched = () => {
    const value = shown()
    return value !== null && range() === "all" && value.totals.plays === 0
  }

  const [scrolled, setScrolled] = createSignal(false)
  useHideClock(scrolled)
  const [board, setBoard] = createSignal<LeaderboardBoard | null>(null)
  const [boardOpen, setBoardOpen] = createSignal(false)

  const name = nameOf(user)
  const joined = () => {
    const loaded = profile().value
    return loaded ? joinedMonth(loaded.user.createdAt) : null
  }
  const loaded = () => profile().value
  const favorites = () =>
    (loaded()?.favorites ?? []).filter((favorite) =>
      stillFavorite(viewer, favorite),
    )
  const recent = () => loaded()?.recent ?? []
  const loading = () => profile().state.kind === "loading"

  return (
    <Page
      class="page fill"
      start={() => {
        if (loading()) return null
        const favorite = favorites()[0]
        if (favorite) return ["favorites", favoriteKey(favorite)]
        // Without favorites, the first thing the statistics show, once they do.
        return shown() === null && stats().state.kind === "loading"
          ? null
          : undefined
      }}
    >
      <div
        class={cx("detail-list fill", scrolled() && "scrolled")}
        data-scroll="near"
        data-scroll-start="64"
        data-scroll-end="48"
        onScroll={(event) => setScrolled(event.currentTarget.scrollTop > 4)}
      >
        <div class="profile-rows">
          <div>
            <div class="profile-head">
              <Avatar name={name} url={user.avatarUrl} size={96} />
              <div class="profile-who">
                <div class="t-display one-line">{name}</div>
                {/* The username under a display name, the role, and when
                    they joined, as the web lists them. */}
                <div class="profile-facts t-facts muted">
                  {user.displayName && <span>@{user.username}</span>}
                  {user.role === "admin" && (
                    <span class="profile-fact">
                      <Icon icon={Shield} size={16} />
                      {tr("profileAdmin")}
                    </span>
                  )}
                  <Show when={joined()}>
                    {(month) => <span>{tr("profileJoined", month())}</span>}
                  </Show>
                </div>
              </div>
            </div>
          </div>
          <Show when={loading()}>
            <LoadingRow />
          </Show>
          <Show
            when={profile().state.kind === "failed" ? profile().state : null}
            keyed
          >
            {(state) => (
              <Notice
                title={tr("profileLoadFailed")}
                detail={state.kind === "failed" ? state.message : null}
              />
            )}
          </Show>
          {/* The header takes no focus, so the row under it takes the page
              back to the top, the header with it. */}
          <Show when={loaded()}>
            <Show
              when={favorites().length > 0}
              fallback={
                <div>
                  <div class="row-title t-title one-line">
                    {tr("favoritesTitle")}
                  </div>
                  <Notice
                    title={tr("favoritesEmpty")}
                    detail={tr("tvFavoritesEmptyHint")}
                    quiet
                  />
                </div>
              }
            >
              <div data-scroll-home="">
                <Row title={tr("favoritesTitle")} name="favorites">
                  <For each={favorites()}>
                    {(favorite) => <FavoriteCard favorite={favorite} />}
                  </For>
                  <SeeAll
                    aspect="poster"
                    onPress={() => nav.push({ page: "favorites" })}
                  />
                </Row>
              </div>
            </Show>
          </Show>
          <div>
            {/* The ranges bring the whole section in, not just their row. */}
            <div
              class="stats-heading"
              data-scroll-head=""
              data-scroll-home={favorites().length > 0 ? undefined : ""}
            >
              <div class="t-title one-line">{tr("profileStatistics")}</div>
              {/* The ranges as pills, the one picked marked; Select picks another. */}
              {!neverWatched() && (
                <div class="profile-ranges" data-fg="ranges" data-fk="row">
                  <For each={RANGES}>
                    {(candidate) => (
                      <Chip
                        fid={candidate}
                        label={rangeName(candidate)}
                        selected={candidate === range()}
                        onPress={() => setKept(candidate)}
                      />
                    )}
                  </For>
                </div>
              )}
            </div>
            <Show
              when={shown()}
              fallback={
                <Show
                  when={stats().state.kind === "failed" ? stats().state : null}
                  keyed
                  fallback={<LoadingRow />}
                >
                  {(state) => (
                    <Notice
                      title={tr("profileStatsFailed")}
                      detail={state.kind === "failed" ? state.message : null}
                    />
                  )}
                </Show>
              }
            >
              {(current) => (
                <Show
                  when={!neverWatched()}
                  fallback={
                    <Notice
                      title={tr("profileSelfEmpty")}
                      detail={tr("profileSelfEmptyHint")}
                    />
                  }
                >
                  <Show
                    when={current().totals.plays > 0}
                    fallback={
                      <div>
                        <Notice
                          title={tr(
                            "profileNothingWatched",
                            rangePhrase(range()),
                          )}
                        />
                        <div
                          class="profile-actions"
                          data-fg="allTime"
                          data-fk="row"
                          style={{ "margin-top": "16rem" }}
                        >
                          <Button
                            fid="allTime"
                            label={tr("profileShowAllTime")}
                            onPress={() => setKept("all")}
                          />
                        </div>
                      </div>
                    }
                  >
                    <div class="stats-body">
                      <div class="stats-overview">
                        <WatchTimeChart stats={current()} />
                        <Figures stats={current()} />
                      </div>
                      <div class="stats-columns">
                        <div class="stats-column">
                          <Show when={current().titles.length > 0}>
                            <TopTitles stats={current()} />
                          </Show>
                          <Show when={current().genres.length > 0}>
                            <Genres stats={current()} />
                          </Show>
                        </div>
                        <div class="stats-column">
                          <Standing
                            range={range()}
                            onOpen={(picked) => {
                              setBoard(picked)
                              setBoardOpen(true)
                            }}
                          />
                          <Show when={current().activity.length > 0}>
                            <ViewingTimes stats={current()} />
                          </Show>
                        </div>
                      </div>
                    </div>
                  </Show>
                </Show>
              )}
            </Show>
          </div>
          <Show when={recent().length > 0}>
            <Row title={tr("profileRecent")} name="recent">
              <For each={recent()}>
                {(entry) => <WatchedCard item={entry.item} />}
              </For>
              <SeeAll
                aspect="landscape"
                onPress={() => nav.push({ page: "recent" })}
              />
            </Row>
          </Show>
        </div>
      </div>
      <BoardPanel
        open={boardOpen()}
        board={board()}
        range={range()}
        onClose={() => setBoardOpen(false)}
      />
    </Page>
  )
}

/** How many titles the list goes back, as on the phone. */
const RECENT_LIMIT = 100

/**
 * Everything the person watched last, a file per title, newest first, as
 * a grid of cards behind the profile's row. The heading steps aside while
 * focus is below the first row.
 */
export function RecentPage() {
  const { user } = useApp()
  const recent = useLoader("recent", () =>
    session.api.profiles.recent({
      username: user.username,
      limit: RECENT_LIMIT,
    }),
  )
  useRefreshOnResume([recent])
  const state = () => recent().state
  const heading = <div class="t-headline grid-head">{tr("profileRecent")}</div>
  const entries = () => {
    const current = state()
    return current.kind === "ready" ? (current.value ?? []) : []
  }
  return (
    <Show
      when={state().kind === "failed" ? null : state()}
      fallback={
        <Show when={state().kind === "failed" ? state() : null} keyed>
          {(failed) => (
            <Message
              title={tr("profileRecentLoadFailed")}
              message={failed.kind === "failed" ? failed.message : null}
              retry={() => recent().reload()}
            />
          )}
        </Show>
      }
    >
      <Page
        class="page fill grid-page recent"
        start={() => {
          const first = entries()[0]?.item.id
          return first ? [GRID, first] : undefined
        }}
      >
        <Show
          when={state().kind === "loading" ? null : entries()}
          fallback={
            <>
              <div style={{ "padding-top": "33rem" }}>{heading}</div>
              <div class="center" style={{ height: "60%" }}>
                <Spinner size={32} class="muted" />
              </div>
            </>
          }
        >
          {(list) => (
            <Show
              when={list().length > 0}
              fallback={
                <div style={{ "padding-top": "33rem" }}>
                  {heading}
                  <div
                    class="t-title muted grid-head"
                    style={{ "margin-top": "24rem" }}
                  >
                    {tr("profileRecentEmpty")}
                  </div>
                </div>
              }
            >
              <PosterGrid
                items={list()}
                keyOf={(entry) => entry.item.id}
                columns={4}
                header={heading}
                renderCard={(entry, onFocus) => (
                  <WatchedCard item={entry.item} onFocus={onFocus} />
                )}
              />
            </Show>
          )}
        </Show>
      </Page>
    </Show>
  )
}
