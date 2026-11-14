import { catalogContract } from "./catalog"
import { adminContract } from "./contract-admin"
import { accountContract, authContract } from "./contract-auth"
import {
  downloadsContract,
  librariesContract,
  mediaContract,
  metadataContract,
  peopleContract,
  searchContract,
  titlesContract,
} from "./contract-library"
import { partyContract } from "./contract-party"
import {
  favoritesContract,
  homeContract,
  playbackContract,
  profilesContract,
  statsContract,
} from "./contract-watching"
import { discoverContract } from "./discover"
import { adminFulfilmentContract } from "./fulfilment"
import { notificationsContract } from "./notifications"
import { requestsContract, adminRequestsContract } from "./requests"

/**
 * The API between the server and every client. The server implements it
 * with `implement(contract)` and serves it twice: as RPC for the TypeScript
 * clients and as REST, described by OpenAPI, for everything else. Byte
 * streams (video) and browser redirects (OIDC) are plain HTTP routes, see
 * `paths.ts`.
 */
export const contract = {
  catalog: catalogContract,
  discover: discoverContract,
  requests: requestsContract,
  notifications: notificationsContract,
  auth: authContract,
  account: accountContract,
  libraries: librariesContract,
  metadata: metadataContract,
  titles: titlesContract,
  people: peopleContract,
  search: searchContract,
  media: mediaContract,
  downloads: downloadsContract,
  playback: playbackContract,
  party: partyContract,
  home: homeContract,
  favorites: favoritesContract,
  profiles: profilesContract,
  stats: statsContract,
  admin: {
    ...adminContract,
    requests: adminRequestsContract,
    fulfilment: adminFulfilmentContract,
  },
}

export type Contract = typeof contract
