import type {
  LeaderboardBoard,
  LeaderboardEntry,
  MediaItem,
  StatsRange,
  WatchStats,
} from "@matinee/contracts"
import { ChevronRight, Clock, LogOut } from "lucide"
import { For, Show, createEffect, createSignal } from "solid-js"

import { useHideClock } from "../app/chrome"
import { Page } from "../app/page"
import { useApp, useKept, useLoader, useRefreshOnResume } from "../app/scope"
import { nameOf, session } from "../auth/session"
import { locale, plural, tr } from "../i18n"
import { remoteKey } from "../input/keys"
import { cx, Icon, Spinner, Tap } from "../kit/base"
import { Button, Chip } from "../kit/buttons"
import { ArtCard, Avatar, LandscapeCard, PosterCard, Row } from "../kit/cards"
import { SidePanel } from "../kit/panel"
import {
  art,
  episodeCode,
  itemLabel,
  landscape,
  progressRatio,
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
function Notice(props: { title: string; detail?: string | null }) {
  return (
    <div class="profile-inset">
      <div class="t-title">{props.title}</div>
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
  // rather than leave the chart.
  const slot = () => BARS_WIDTH / Math.max(1, buckets().length)
  const gap = () => Math.min(slot() * 0.25, 8)
  const first = () => buckets()[0]
  const last = () => buckets().at(-1)
  return (
    <Tap
      fid="watchTime"
      class="chart profile-inset"
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
      <div class="t-facts muted one-line">
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
                  left: `${picked() * slot()}rem`,
                  width: `${slot()}rem`,
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
                      left: `${index() * slot() + gap() / 2}rem`,
                      width: `${slot() - gap()}rem`,
                      height: `${Math.max(3, (bucket.watchSeconds / top()) * BARS_HEIGHT)}rem`,
                      "border-radius": `${Math.min(4, (slot() - gap()) / 2)}rem`,
                    }}
                  />
                )
              }
            </For>
          </div>
          {/* The scale's figures, each under its line. */}
          <div class="chart-scale t-caption muted">
            <span style={{ top: "4rem" }}>{formatWatchTime(top())}</span>
            <span style={{ top: `${BARS_HEIGHT / 2 + 4}rem` }}>
              {formatWatchTime(top() / 2)}
            </span>
          </div>
        </div>
        <div class="chart-ends t-caption muted">
          <span>{bucketName(first()!.start, props.stats.unit)}</span>
          {buckets().length > 1 && (
            <span>{bucketName(last()!.start, props.stats.unit)}</span>
          )}
        </div>
      </Show>
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
    () => props.stats,
    () => {
      setDay(peak().weekday)
      setHour(peak().hour)
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
      class="chart profile-inset"
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
      <div class="t-title one-line">{tr("statsHeatmapTitle")}</div>
      <div
        class={cx("t-facts one-line", !focused() && "muted")}
        style={{ margin: "4rem 0 16rem" }}
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
      {/* The hours under the squares, every three. */}
      <div class="heat-row heat-hours t-caption muted">
        <span class="heat-day" />
        <For each={HOURS.filter((cell) => cell % 3 === 0)}>
          {(cell) => <span>{hourName(cell)}</span>}
        </For>
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
        size={props.small ? 28 : 36}
      />
      <span class="place-name one-line">
        {props.place.self ? tr("statsNameYou", name()) : name()}
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
  let last: readonly BoardStanding[] = []
  const standings = () => {
    const value = board().value
    if (value) last = standingsOf(value)
    return last
  }
  // The cards are as tall as the one with the most places, so the row reads as one.
  const places = () =>
    Math.max(...standings().map((standing) => standing.places.length))
  return (
    <Show when={standings().length > 0}>
      <Row title={tr("statsStandingTitle")} name="standing">
        <For each={standings()}>
          {(standing) => (
            <Tap
              fid={standing.board.metric}
              class="ctl board"
              onPress={() => props.onOpen(standing.board)}
            >
              <div class="board-head t-label">
                <span class="one-line">
                  {metricName(standing.board.metric)}
                </span>
                <Icon icon={ChevronRight} size={18} />
              </div>
              <div
                style={{ height: `${places() * 40 + (places() - 1) * 4}rem` }}
              >
                <For each={standing.places}>
                  {(place) => (
                    <Place
                      place={place}
                      value={metricValue(standing.board.metric, place.value)}
                      small
                    />
                  )}
                </For>
              </div>
            </Tap>
          )}
        </For>
      </Row>
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

/** Plays and what was finished, as large figures across. The watch time is the chart's, above. */
function Totals(props: { stats: WatchStats }) {
  const figures = (): [number, string][] => [
    [props.stats.totals.plays, tr("statsPlays")],
    [props.stats.totals.movies, tr("statsMoviesFinished")],
    [props.stats.totals.episodes, tr("statsEpisodesFinished")],
    [props.stats.totals.shows, tr("statsShowsWatched")],
  ]
  return (
    <div class="profile-inset totals">
      <For each={figures()}>
        {([value, label]) => (
          <div>
            <div class="t-display one-line">{value.toLocaleString(locale)}</div>
            <div class="t-label muted one-line">{label}</div>
          </div>
        )}
      </For>
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
  const facts = () =>
    [
      user.displayName ? `@${user.username}` : null,
      joined() ? tr("profileJoined", joined() ?? "") : null,
      user.role === "admin" ? tr("profileAdmin") : null,
    ].filter(Boolean)
  const recent = () => profile().value?.recent ?? []
  // The first card they watched, rather than Sign out, once the profile shows whether there is one.
  const first = () => recent()[0]?.item.id
  const loading = () => profile().state.kind === "loading"

  return (
    <Page
      class="page fill"
      start={() => {
        if (loading()) return null
        return first() ? ["recent", first() ?? ""] : ["actions", "signOut"]
      }}
    >
      <div
        class={cx("detail-list fill", scrolled() && "scrolled")}
        data-scroll="pin"
        data-scroll-pivot="96"
        onScroll={(event) => setScrolled(event.currentTarget.scrollTop > 4)}
      >
        <div class="profile-rows">
          <div data-scroll-home="">
            <div class="profile-head">
              <Avatar name={name} url={user.avatarUrl} size={96} />
              <div>
                <div class="t-display one-line">{name}</div>
                {facts().length > 0 && (
                  <div class="t-facts muted" style={{ "margin-top": "6rem" }}>
                    {facts().join("  ·  ")}
                  </div>
                )}
              </div>
            </div>
            {/* Sign out. Settings is in the drawer. */}
            <div class="profile-actions" data-fg="actions" data-fk="row">
              <Button
                fid="signOut"
                label={tr("shellSignOut")}
                icon={LogOut}
                onPress={() => session.signOut()}
              />
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
          <Show when={recent().length > 0}>
            <Row title={tr("profileRecent")} name="recent">
              <For each={recent()}>
                {(entry) => <WatchedCard item={entry.item} />}
              </For>
              <div class="card-landscape">
                <ArtCard
                  fid="seeAll"
                  toneKey="seeAll"
                  aspect="landscape"
                  label={tr("tvProfileSeeAll")}
                  onPress={() => nav.push({ page: "recent" })}
                >
                  <div class="see-all t-label">
                    <Icon icon={Clock} size={28} />
                    {tr("tvProfileSeeAll")}
                  </div>
                </ArtCard>
              </div>
            </Row>
          </Show>
          <div>
            <div class="t-headline profile-inset">
              {tr("profileStatistics")}
            </div>
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
                    title={state.kind === "failed" ? state.message : ""}
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
                    <Notice
                      title={tr("profileNothingWatched", rangePhrase(range()))}
                    />
                  }
                >
                  <WatchTimeChart stats={current()} />
                  <Totals stats={current()} />
                  <Show when={current().titles.length > 0}>
                    <Row title={tr("statsTop")} name="top">
                      <For each={current().titles}>
                        {(entry) => (
                          <div class="card-poster">
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
                        )}
                      </For>
                    </Row>
                  </Show>
                  <Show when={current().genres.length > 0}>
                    <Row title={tr("statsGenres")} name="genres" buttons>
                      <For each={current().genres}>
                        {(genre) => (
                          <Button
                            fid={genre.name}
                            label={genre.name}
                            detail={formatWatchTime(genre.watchSeconds)}
                            onPress={() =>
                              nav.push({ page: "browse", genre: genre.name })
                            }
                          />
                        )}
                      </For>
                    </Row>
                  </Show>
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
                </Show>
              </Show>
            )}
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
