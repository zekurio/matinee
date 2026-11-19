import type {
  LeaderboardBoard,
  LeaderboardEntry,
  MediaItem,
  StatsRange,
  WatchStats,
} from "@matinee/contracts"
import { ChevronRight, Clock, LogOut } from "lucide"
import { useEffect, useRef, useState } from "preact/hooks"

import { useHideClock } from "@/app/chrome"
import { Page } from "@/app/page"
import { useApp, useKept, useLoader, useRefreshOnResume } from "@/app/scope"
import { nameOf, session } from "@/auth/session"
import { locale, plural, tr } from "@/i18n"
import { remoteKey } from "@/input/keys"
import { cx, Icon, Spinner, Tap } from "@/kit/base"
import { Button, Chip } from "@/kit/buttons"
import { ArtCard, Avatar, LandscapeCard, PosterCard, Row } from "@/kit/cards"
import { SidePanel } from "@/kit/panel"
import {
  art,
  episodeCode,
  itemLabel,
  landscape,
  progressRatio,
} from "@/model/format"
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
} from "@/model/stats"

import { GRID, PosterGrid } from "./grid"
import { Message } from "./parts"

/* The signed-in person's pages on a TV, as the Android TV app's `ui/tv/profile`. */

/** "November 2026", the month the person joined. */
function joinedMonth(joined: Date): string | null {
  return Number.isNaN(joined.getTime())
    ? null
    : joined.toLocaleDateString(locale, { month: "long", year: "numeric" })
}

/** A file watched: its still, the show or movie, and the episode, opening the file's page. */
function WatchedCard(props: { item: MediaItem; onFocus?: () => void }) {
  const { nav, viewer, actions } = useApp()
  const { item } = props
  const label = itemLabel(item)
  const code = episodeCode(item)
  return (
    <LandscapeCard
      fid={item.id}
      toneKey={label.showName}
      art={landscape(item)}
      caption={label.showName}
      detail={code ? tr("media_code_title", code, label.title) : label.year}
      progress={progressRatio(item)}
      watched={viewer.isItemWatched(item)}
      onPress={() => nav.item(item)}
      onMenu={() => actions.open({ kind: "item", item })}
      onFocus={props.onFocus}
    />
  )
}

/** A line, and one under it, where a section has nothing to show. */
function Notice(props: { title: string; detail?: string | null }) {
  return (
    <div class="profile-inset">
      <div class="t-title">{props.title}</div>
      {props.detail && (
        <div class="t-body muted" style={{ marginTop: "4rem" }}>
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

/*
 * The profile's two charts. Each is one focus stop, so the page scrolls
 * to it and passes it with one press. Focused, the arrows move a mark
 * across its bars or squares, and the line above the chart reads out the
 * one marked. The mark is the text color, as a focused control fills with
 * it; an arrow past the chart's edge leaves it.
 */

/** How tall the watch-time bars can grow, and how wide their part of the page is. */
const BARS_HEIGHT = 180
const BARS_WIDTH = 760

/**
 * The range's watch time: the total, large, over watch time per day,
 * week, or month as bars. Focused, a bar is marked, the newest first, and
 * the total's place reads that day, week, or month out instead.
 */
function WatchTimeChart(props: { stats: WatchStats }) {
  const { stats } = props
  const { buckets } = stats
  const [focused, setFocused] = useState(false)
  const [picked, setPicked] = useState(buckets.length - 1)
  // Another range's buckets: the mark starts on the newest again.
  useEffect(() => setPicked(buckets.length - 1), [stats])
  const shown = focused ? buckets[picked] : undefined
  const top = scaleTop(
    Math.max(0, ...buckets.map((bucket) => bucket.watchSeconds)),
  )
  // All time can hold hundreds of months, so the bars thin out to lines
  // rather than leave the chart.
  const slot = BARS_WIDTH / Math.max(1, buckets.length)
  const gap = Math.min(slot * 0.25, 8)
  const first = buckets[0]
  const last = buckets.at(-1)
  return (
    <Tap
      fid="watchTime"
      class="chart profile-inset"
      role="group"
      label={tr("stats_watch_time")}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onKeyDown={(event) => {
        const key = remoteKey(event)
        const next =
          key === "left" ? picked - 1 : key === "right" ? picked + 1 : null
        if (next === null || next < 0 || next >= buckets.length) return
        event.preventDefault()
        setPicked(next)
      }}
    >
      <div class="t-facts muted one-line">
        {shown
          ? `${bucketName(shown.start, stats.unit)}  ·  ${plural("stats_play_count", shown.plays)}`
          : `${tr("stats_watch_time")}  ·  ${rangeName(stats.range)}`}
      </div>
      <div class="t-display one-line">
        {formatWatchTime(shown?.watchSeconds ?? stats.totals.watchSeconds)}
      </div>
      {first && last && (
        <>
          <div class="chart-row">
            <div class="chart-bars" style={{ height: `${BARS_HEIGHT}rem` }}>
              {/* The marked slot shows even where nothing was watched. */}
              {shown && (
                <i
                  class="chart-slot"
                  style={{ left: `${picked * slot}rem`, width: `${slot}rem` }}
                />
              )}
              {buckets.map((bucket, index) =>
                bucket.watchSeconds <= 0 ? null : (
                  <i
                    key={bucket.start}
                    class={cx(
                      "chart-bar",
                      shown && (index === picked ? "marked" : "dimmed"),
                    )}
                    style={{
                      left: `${index * slot + gap / 2}rem`,
                      width: `${slot - gap}rem`,
                      height: `${Math.max(3, (bucket.watchSeconds / top) * BARS_HEIGHT)}rem`,
                      borderRadius: `${Math.min(4, (slot - gap) / 2)}rem`,
                    }}
                  />
                ),
              )}
            </div>
            {/* The scale's figures, each under its line. */}
            <div class="chart-scale t-caption muted">
              <span style={{ top: "4rem" }}>{formatWatchTime(top)}</span>
              <span style={{ top: `${BARS_HEIGHT / 2 + 4}rem` }}>
                {formatWatchTime(top / 2)}
              </span>
            </div>
          </div>
          <div class="chart-ends t-caption muted">
            <span>{bucketName(first.start, stats.unit)}</span>
            {buckets.length > 1 && (
              <span>{bucketName(last.start, stats.unit)}</span>
            )}
          </div>
        </>
      )}
    </Tap>
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
  const { activity } = props.stats
  const [focused, setFocused] = useState(false)
  const peak = activity.reduce(
    (most, cell) => (cell.watchSeconds > most.watchSeconds ? cell : most),
    activity[0] ?? { weekday: 1, hour: 0, watchSeconds: 0 },
  )
  // Weekdays count 1 to 7 from Monday, hours 0 to 23, as the server sends them.
  const [day, setDay] = useState(peak.weekday)
  const [hour, setHour] = useState(peak.hour)
  useEffect(() => {
    setDay(peak.weekday)
    setHour(peak.hour)
  }, [props.stats])
  const seconds = new Map(
    activity.map((cell) => [cell.weekday * 24 + cell.hour, cell.watchSeconds]),
  )
  const most = Math.max(1, peak.watchSeconds)
  return (
    <Tap
      fid="viewingTimes"
      class="chart profile-inset"
      role="group"
      label={tr("stats_heatmap_title")}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onKeyDown={(event) => {
        const key = remoteKey(event)
        const toHour =
          key === "left" ? hour - 1 : key === "right" ? hour + 1 : hour
        const toDay = key === "up" ? day - 1 : key === "down" ? day + 1 : day
        if (toHour === hour && toDay === day) return
        if (toHour < 0 || toHour > 23 || toDay < 1 || toDay > 7) return
        event.preventDefault()
        setHour(toHour)
        setDay(toDay)
      }}
    >
      <div class="t-title one-line">{tr("stats_heatmap_title")}</div>
      <div
        class={cx("t-facts one-line", !focused && "muted")}
        style={{ margin: "4rem 0 16rem" }}
      >
        {focused
          ? `${tr(
              "tv_stats_heatmap_cell",
              weekdayName(day),
              hourName(hour),
              hourName((hour + 1) % 24),
            )}  ·  ${formatWatchTime(seconds.get(day * 24 + hour) ?? 0)}`
          : tr(
              "stats_heatmap_peak",
              weekdayName(peak.weekday),
              hourName(peak.hour),
            )}
      </div>
      {WEEKDAYS.map((weekday) => (
        <div key={weekday} class="heat-row">
          <span
            class={cx(
              "heat-day t-caption",
              !(focused && weekday === day) && "muted",
            )}
          >
            {weekdayName(weekday, true)}
          </span>
          {HOURS.map((cell) => {
            const value = seconds.get(weekday * 24 + cell) ?? 0
            const marked = focused && weekday === day && cell === hour
            return (
              <i
                key={cell}
                class={cx("heat-cell", marked && "marked")}
                style={
                  value > 0 && !marked
                    ? {
                        background: `rgba(var(--accent-rgb), ${0.3 + (0.7 * value) / most})`,
                      }
                    : undefined
                }
              />
            )
          })}
        </div>
      ))}
      {/* The hours under the squares, every three. */}
      <div class="heat-row heat-hours t-caption muted">
        <span class="heat-day" />
        {HOURS.filter((cell) => cell % 3 === 0).map((cell) => (
          <span key={cell}>{hourName(cell)}</span>
        ))}
      </div>
    </Tap>
  )
}

/**
 * A place: the rank, the podium's in the accent, the person, and the
 * value. `small` is a board's card, where the user's own place is lit.
 */
function Place(props: {
  place: LeaderboardEntry
  value: string
  small?: boolean
}) {
  const { place } = props
  const name = nameOf(place.user)
  return (
    <div
      class={cx(
        "place",
        props.small ? "t-label small" : "t-facts",
        place.self && props.small && "self",
      )}
    >
      <span
        class={cx(
          "place-rank t-caption",
          place.rank <= 3 && `rank-${place.rank}`,
        )}
      >
        {place.rank}
      </span>
      <Avatar
        name={name}
        avatarId={place.user.avatarId}
        size={props.small ? 28 : 36}
      />
      <span class="place-name one-line">
        {place.self ? tr("stats_name_you", name) : name}
      </span>
      <span>{props.value}</span>
    </div>
  )
}

/**
 * Where the user stands on each board, a card per board with their place
 * between the people just above and below them. Select opens the board
 * whole in a panel. The last range's boards stay while the next one's
 * load, so the row doesn't drop out from under focus.
 */
function Standing(props: {
  range: StatsRange
  onOpen: (board: LeaderboardBoard) => void
}) {
  const board = useLoader(`leaderboard-${props.range}`, () =>
    session.api.stats.leaderboard({ range: props.range, timeZone: timeZone() }),
  )
  const last = useRef<readonly BoardStanding[]>([])
  if (board.value) last.current = standingsOf(board.value)
  const standings = last.current
  if (standings.length === 0) return null
  // The cards are as tall as the one with the most places, so the row reads as one.
  const places = Math.max(
    ...standings.map((standing) => standing.places.length),
  )
  return (
    <Row title={tr("stats_standing_title")} name="standing">
      {standings.map((standing) => (
        <Tap
          key={standing.board.metric}
          fid={standing.board.metric}
          class="ctl board"
          onPress={() => props.onOpen(standing.board)}
        >
          <div class="board-head t-label">
            <span class="one-line">{metricName(standing.board.metric)}</span>
            <Icon icon={ChevronRight} size={18} />
          </div>
          <div style={{ height: `${places * 40 + (places - 1) * 4}rem` }}>
            {standing.places.map((place) => (
              <Place
                key={place.user.id}
                place={place}
                value={metricValue(standing.board.metric, place.value)}
                small
              />
            ))}
          </div>
        </Tap>
      ))}
    </Row>
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
  const { board } = props
  const self = board?.entries.find((entry) => entry.self)
  return (
    <SidePanel
      open={props.open}
      title={board ? metricName(board.metric) : null}
      description={rangeName(props.range)}
      initial={self?.user.id}
      focusKey={board?.metric}
      onBack={props.onClose}
    >
      {board?.entries.map((place, index) => (
        <Tap
          key={place.user.id}
          fid={place.user.id}
          class={cx("ctl item quiet place-row", place.self && "self")}
          style={
            startsNeighborhood(board, index)
              ? { marginTop: "16rem" }
              : undefined
          }
          role="listitem"
        >
          <Place place={place} value={metricValue(board.metric, place.value)} />
        </Tap>
      ))}
    </SidePanel>
  )
}

/** Plays and what was finished, as large figures across. The watch time is the chart's, above. */
function Totals(props: { stats: WatchStats }) {
  const { totals } = props.stats
  const figures: [number, string][] = [
    [totals.plays, tr("stats_plays")],
    [totals.movies, tr("stats_movies_finished")],
    [totals.episodes, tr("stats_episodes_finished")],
    [totals.shows, tr("stats_shows_watched")],
  ]
  return (
    <div class="profile-inset totals">
      {figures.map(([value, label]) => (
        <div key={label}>
          <div class="t-display one-line">{value.toLocaleString(locale)}</div>
          <div class="t-label muted one-line">{label}</div>
        </div>
      ))}
    </div>
  )
}

/**
 * The signed-in person on a TV, from the drawer's top entry: who they
 * are, Sign out, what they watched last as a row of cards, then their
 * statistics for a range: watch time over the range as bars, the other
 * totals as large figures, their most watched titles, their genres, where
 * they stand on the leaderboard, and when in the week they watch. A
 * leaderboard board opens whole in the right-edge panel.
 */
export function ProfilePage() {
  const { user, nav } = useApp()
  const api = session.api
  const profile = useLoader("profile", () =>
    api.profiles.get({ username: user.username }),
  )
  const [kept, setKept] = useKept("range", "all")
  const range = RANGES.find((candidate) => candidate === kept) ?? "all"
  const stats = useLoader(`profile-stats-${range}`, () =>
    api.profiles.stats({
      username: user.username,
      range,
      timeZone: timeZone(),
    }),
  )
  useRefreshOnResume([profile, stats])
  // The last range's figures stay up while the next one loads, so the page doesn't jump.
  const last = useRef<WatchStats | null>(null)
  if (stats.value) last.current = stats.value
  const shown = stats.value ?? last.current
  // With nothing ever watched, picking a period changes nothing.
  const neverWatched =
    shown !== null && range === "all" && shown.totals.plays === 0

  const [scrolled, setScrolled] = useState(false)
  useHideClock(scrolled)
  const [board, setBoard] = useState<LeaderboardBoard | null>(null)
  const [boardOpen, setBoardOpen] = useState(false)

  const name = nameOf(user)
  const loaded = profile.value
  const joined = loaded ? joinedMonth(loaded.user.createdAt) : null
  const facts = [
    user.displayName ? `@${user.username}` : null,
    joined ? tr("profile_joined", joined) : null,
    user.role === "admin" ? tr("profile_admin") : null,
  ].filter(Boolean)
  const recent = loaded?.recent ?? []
  // The first card they watched, rather than Sign out, once the profile shows whether there is one.
  const first = recent[0]?.item.id
  const loading = profile.state.kind === "loading"

  return (
    <Page
      class="page fill"
      start={() => {
        if (loading) return null
        return first ? ["recent", first] : ["actions", "signOut"]
      }}
    >
      <div
        class={cx("detail-list fill", scrolled && "scrolled")}
        data-scroll="pin"
        data-scroll-pivot="96"
        onScroll={(event) => setScrolled(event.currentTarget.scrollTop > 4)}
      >
        <div class="profile-rows">
          <div data-scroll-home="">
            <div class="profile-head">
              <Avatar name={name} avatarId={user.avatarId} size={96} />
              <div>
                <div class="t-display one-line">{name}</div>
                {facts.length > 0 && (
                  <div class="t-facts muted" style={{ marginTop: "6rem" }}>
                    {facts.join("  ·  ")}
                  </div>
                )}
              </div>
            </div>
            {/* Sign out. Settings is in the drawer. */}
            <div class="profile-actions" data-fg="actions" data-fk="row">
              <Button
                fid="signOut"
                label={tr("shell_sign_out")}
                icon={LogOut}
                onPress={() => session.signOut()}
              />
            </div>
          </div>
          {profile.state.kind === "loading" && <LoadingRow />}
          {profile.state.kind === "failed" && (
            <Notice
              title={tr("profile_load_failed")}
              detail={profile.state.message}
            />
          )}
          {recent.length > 0 && (
            <Row title={tr("profile_recent")} name="recent">
              {recent.map((entry) => (
                <WatchedCard key={entry.item.id} item={entry.item} />
              ))}
              <div class="card-landscape">
                <ArtCard
                  fid="seeAll"
                  toneKey="seeAll"
                  aspect="landscape"
                  label={tr("tv_profile_see_all")}
                  onPress={() => nav.push({ page: "recent" })}
                >
                  <div class="see-all t-label">
                    <Icon icon={Clock} size={28} />
                    {tr("tv_profile_see_all")}
                  </div>
                </ArtCard>
              </div>
            </Row>
          )}
          <div>
            <div class="t-headline profile-inset">
              {tr("profile_statistics")}
            </div>
            {/* The ranges as pills, the one picked marked; Select picks another. */}
            {!neverWatched && (
              <div class="profile-ranges" data-fg="ranges" data-fk="row">
                {RANGES.map((candidate) => (
                  <Chip
                    key={candidate}
                    fid={candidate}
                    label={rangeName(candidate)}
                    selected={candidate === range}
                    onPress={() => setKept(candidate)}
                  />
                ))}
              </div>
            )}
          </div>
          {stats.state.kind === "failed" && shown === null ? (
            <Notice title={stats.state.message} />
          ) : shown === null ? (
            <LoadingRow />
          ) : neverWatched ? (
            <Notice
              title={tr("profile_self_empty")}
              detail={tr("profile_self_empty_hint")}
            />
          ) : shown.totals.plays === 0 ? (
            <Notice title={tr("profile_nothing_watched", rangePhrase(range))} />
          ) : (
            <>
              <WatchTimeChart stats={shown} />
              <Totals stats={shown} />
              {shown.titles.length > 0 && (
                <Row title={tr("stats_top")} name="top">
                  {shown.titles.map((entry) => (
                    <div key={entry.title.id} class="card-poster">
                      <PosterCard
                        fid={entry.title.id}
                        name={entry.title.name}
                        poster={art(entry.title.images.poster)}
                        onPress={() => nav.title(entry.title.id)}
                      />
                      <div class="card-caption t-label one-line">
                        {entry.title.name}
                      </div>
                      <div class="t-caption muted one-line">
                        {formatWatchTime(entry.watchSeconds)}
                      </div>
                    </div>
                  ))}
                </Row>
              )}
              {shown.genres.length > 0 && (
                <Row title={tr("stats_genres")} name="genres" buttons>
                  {shown.genres.map((genre) => (
                    <Button
                      key={genre.name}
                      fid={genre.name}
                      label={genre.name}
                      detail={formatWatchTime(genre.watchSeconds)}
                      onPress={() =>
                        nav.push({ page: "browse", genre: genre.name })
                      }
                    />
                  ))}
                </Row>
              )}
              <Standing
                range={range}
                onOpen={(picked) => {
                  setBoard(picked)
                  setBoardOpen(true)
                }}
              />
              {shown.activity.length > 0 && <ViewingTimes stats={shown} />}
            </>
          )}
        </div>
      </div>
      <BoardPanel
        open={boardOpen}
        board={board}
        range={range}
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
  const { state } = recent
  const heading = <div class="t-headline grid-head">{tr("profile_recent")}</div>
  if (state.kind === "failed") {
    return (
      <Message
        title={tr("profile_recent_load_failed")}
        message={state.message}
        retry={() => recent.reload()}
      />
    )
  }
  const entries = state.kind === "ready" ? (state.value ?? []) : []
  const first = entries[0]?.item.id
  return (
    <Page
      class="page fill grid-page recent"
      start={() => (first ? [GRID, first] : undefined)}
    >
      {state.kind === "loading" ? (
        <>
          <div style={{ paddingTop: "33rem" }}>{heading}</div>
          <div class="center" style={{ height: "60%" }}>
            <Spinner size={32} class="muted" />
          </div>
        </>
      ) : entries.length === 0 ? (
        <div style={{ paddingTop: "33rem" }}>
          {heading}
          <div class="t-title muted grid-head" style={{ marginTop: "24rem" }}>
            {tr("profile_recent_empty")}
          </div>
        </div>
      ) : (
        <PosterGrid
          items={entries}
          keyOf={(entry) => entry.item.id}
          columns={4}
          header={heading}
          renderCard={(entry, onFocus) => (
            <WatchedCard item={entry.item} onFocus={onFocus} />
          )}
        />
      )}
    </Page>
  )
}
