import {
  LEADERBOARD_METRICS,
  type Leaderboard,
  LeaderboardMetric,
  type StatsInput,
  type StatsRange,
  UserRole,
} from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
import { playbackSession, user } from "@matinee/db"
import { type SQL, sql } from "drizzle-orm"

import { db } from "../db"
import { knownZone, rangeFirstDay, sinceStart } from "./range"
import { isPlay } from "./sql"

// Places shown per board. The viewer comes after when they rank lower,
// with the places just above and below them.
const TOP = 10

// The rows of the raw query. Bigints such as `rank` arrive as strings,
// which t.coerce turns back into numbers.
const Rows = t.array(
  t.object({
    metric: LeaderboardMetric,
    value: t.coerce.number(),
    rank: t.coerce.number().int(),
    id: t.uuid(),
    username: t.string(),
    display_name: t.string().nullable(),
    role: UserRole,
    avatar_id: t.string().nullable(),
    created_at: t.coerce.date(),
  }),
)

/**
 * Everyone who shares their statistics, and the viewer, ranked on each
 * metric in one statement. Totals and play days come from index-only scans
 * of `playback_session_user_idx`; streaks are runs of consecutive days.
 */
export async function leaderboard(
  input: StatsInput,
  viewer: { id: string; shareStats: boolean },
): Promise<Leaderboard> {
  const zone = await knownZone(input.timeZone)
  const result = await db.execute(
    leaderboardQuery(input.range, zone, viewer.id),
  )
  const rows = Rows.parse(result.rows)
  return {
    range: input.range,
    sharing: viewer.shareStats,
    boards: LEADERBOARD_METRICS.map((metric) => ({
      metric,
      entries: rows
        .filter((row) => row.metric === metric)
        .map((row) => ({
          rank: row.rank,
          value: row.value,
          self: row.id === viewer.id,
          user: {
            id: row.id,
            username: row.username,
            displayName: row.display_name,
            role: row.role,
            avatarId: row.avatar_id,
            createdAt: row.created_at,
          },
        })),
    })),
  }
}

/**
 * The leaderboard's statement: the top places per metric, and the viewer's
 * place wherever it is, between its neighbors.
 */
export function leaderboardQuery(
  range: StatsRange,
  zone: string,
  viewerId: string,
): SQL {
  const s = playbackSession
  const since = sinceStart(s.startedAt, range, zone)
  const firstDay = rangeFirstDay(range, zone)
  return sql`
    with participants as (
      select ${user.id} as id from ${user}
      where ${user.shareStats} or ${user.id} = ${viewerId}
    ),
    totals as (
      select ${s.userId} as user_id,
        sum(${s.watchedSeconds}) as watch_time,
        count(*) filter (where ${isPlay}) as plays,
        count(distinct ${s.titleId}) filter (where ${s.completed} and ${s.titleKind} = 'movie') as movies,
        count(distinct ${s.mediaItemId}) filter (where ${s.completed} and ${s.titleKind} = 'show') as episodes
      from ${s}
      where ${s.userId} in (select id from participants)
        ${since ? sql`and ${since}` : sql.empty()}
      group by ${s.userId}
    ),
    days as (
      select distinct ${s.userId} as user_id,
        (${s.startedAt} at time zone ${zone})::date as day
      from ${s}
      where ${s.userId} in (select id from participants) and ${isPlay}
    ),
    -- Consecutive days share day - row_number, which names their run.
    runs as (
      select user_id, min(day) as first_day, max(day) as last_day,
        count(*) as length
      from (
        select user_id, day,
          day - (row_number() over (partition by user_id order by day))::int as run
        from days
      ) numbered
      group by user_id, run
    ),
    streaks as (
      select user_id,
        -- A streak is current while it reaches today or yesterday.
        max(length) filter (
          where last_day >= (now() at time zone ${zone})::date - 1
        ) as current_streak,
        -- Only the days inside the range count toward the longest.
        max(last_day - greatest(first_day, ${firstDay}) + 1) filter (
          where last_day >= ${firstDay}
        ) as longest_streak
      from runs
      group by user_id
    ),
    scores as (
      select p.id as user_id, m.metric, m.value
      from participants p
      left join totals t on t.user_id = p.id
      left join streaks k on k.user_id = p.id
      cross join lateral (values
        ('watchTime', coalesce(t.watch_time, 0)::float8),
        ('plays', coalesce(t.plays, 0)::float8),
        ('currentStreak', coalesce(k.current_streak, 0)::float8),
        ('longestStreak', coalesce(k.longest_streak, 0)::float8),
        ('movies', coalesce(t.movies, 0)::float8),
        ('episodes', coalesce(t.episodes, 0)::float8)
      ) as m(metric, value)
      where m.value > 0
    ),
    ranked as (
      select sc.user_id, sc.metric, sc.value,
        rank() over (partition by sc.metric order by sc.value desc) as rank,
        row_number() over (
          partition by sc.metric
          order by sc.value desc, lower(coalesce(u.display_name, u.username))
        ) as position
      from scores sc
      join ${user} u on u.id = sc.user_id
    ),
    viewer as (
      select metric, position from ranked where user_id = ${viewerId}
    )
    select r.metric, r.value, r.rank, u.id, u.username, u.display_name,
      u.role, u.avatar_id, u.created_at
    from ranked r
    join ${user} u on u.id = r.user_id
    left join viewer v on v.metric = r.metric
    where r.position <= ${TOP} or abs(r.position - v.position) <= 1
    order by r.metric, r.position
  `
}
