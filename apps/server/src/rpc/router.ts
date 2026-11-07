import { account } from "./account"
import { adminAppearance } from "./admin-appearance"
import { adminAuth } from "./admin-auth"
import { adminJobs } from "./admin-jobs"
import { adminTranscoding } from "./admin-transcoding"
import { adminTrickplay } from "./admin-trickplay"
import { adminUsers } from "./admin-users"
import { auth } from "./auth"
import { pub } from "./base"
import { adminRoutes, libraries, media } from "./libraries"
import { people } from "./people"
import { home, playback } from "./playback"
import { favorites, profiles } from "./profiles"
import { search } from "./search"
import { stats } from "./stats"
import { metadata, titles } from "./titles"

/**
 * The implemented procedures. `router` is what the handlers serve; it tells
 * oRPC to read routes from the contract, which knows nothing of middleware.
 * The OpenAPI generator takes these instead, to see the security `authed`
 * adds.
 */
export const procedures = {
  auth,
  account,
  libraries,
  metadata,
  titles,
  people,
  search,
  media,
  playback,
  home,
  favorites,
  profiles,
  stats,
  admin: {
    ...adminRoutes,
    appearance: adminAppearance,
    auth: adminAuth,
    jobs: adminJobs,
    transcoding: adminTranscoding,
    trickplay: adminTrickplay,
    users: adminUsers,
  },
}

export const router = pub.router(procedures)
