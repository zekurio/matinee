import { orpc } from "./rpc"

// The contract's cap. Twelve posters fit side by side on a wide monitor,
// which left nothing to scroll.
export const SHELF = 24
const HERO_SLIDES = 6

/** Home's queries for what to watch, shared by the page and its prefetch. */
export const homeQueries = {
  resume: () =>
    orpc.home.continueWatching.queryOptions({ input: { limit: 12 } }),
  nextUp: () => orpc.home.nextUp.queryOptions({ input: { limit: 12 } }),
  // New and well-rated titles the user hasn't started, plus shows with a
  // new next episode. What the user is watching has its own rows.
  featured: () =>
    orpc.home.featured.queryOptions({ input: { limit: HERO_SLIDES } }),
}
