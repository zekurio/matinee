import { account } from "./account"
import { adminAuth } from "./admin-auth"
import { adminBranding } from "./admin-branding"
import { adminFulfilment } from "./admin-fulfilment"
import { adminGroups } from "./admin-groups"
import { adminInvites } from "./admin-invites"
import { adminJobs } from "./admin-jobs"
import { adminNetwork } from "./admin-network"
import { adminRequests } from "./admin-requests"
import { adminSetup } from "./admin-setup"
import { adminTranscoding } from "./admin-transcoding"
import { adminTrickplay } from "./admin-trickplay"
import { adminUsers } from "./admin-users"
import { auth } from "./auth"
import { pub } from "./base"
import { catalog } from "./catalog"
import { discover } from "./discover"
import { downloads } from "./downloads"
import { titleImages } from "./images"
import { adminRoutes, libraries, media } from "./libraries"
import { notifications } from "./notifications"
import { party } from "./party"
import { people } from "./people"
import { home, playback } from "./playback"
import { favorites, profiles } from "./profiles"
import { requests } from "./requests"
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
  catalog,
  discover,
  requests,
  notifications,
  auth,
  account,
  libraries,
  metadata,
  titles: { ...titles, ...titleImages },
  people,
  search,
  media,
  downloads,
  playback,
  party,
  home,
  favorites,
  profiles,
  stats,
  admin: {
    requests: adminRequests,
    fulfilment: adminFulfilment,
    ...adminRoutes,
    auth: adminAuth,
    branding: adminBranding,
    groups: adminGroups,
    invites: adminInvites,
    jobs: adminJobs,
    network: adminNetwork,
    setup: adminSetup,
    transcoding: adminTranscoding,
    trickplay: adminTrickplay,
    users: adminUsers,
  },
}

export const router = pub.router(procedures)
