import { follow } from "../realtime/follow"
import { leaderboard } from "../stats/leaderboard"
import { libraryStats } from "../stats/library"
import { liveActivity, serverStats } from "../stats/queries"
import { admin, authed } from "./base"

// Sessions drop out of "watching now" when they stop reporting, which no
// event announces, so the stream looks again this often.
const LIVE_REFRESH_MS = 15_000

export const stats = {
  server: admin.stats.server.handler(({ context, input }) =>
    serverStats(input, context.user.id),
  ),
  live: admin.stats.live.handler(({ context, signal }) =>
    follow({
      topics: ["playback"],
      load: () => liveActivity(context.user.id),
      signal,
      refreshMs: LIVE_REFRESH_MS,
    }),
  ),
  library: authed.stats.library.handler(({ input }) => libraryStats(input)),
  leaderboard: authed.stats.leaderboard.handler(({ context, input }) =>
    leaderboard(input, {
      id: context.user.id,
      shareStats: context.user.shareStats,
    }),
  ),
}
