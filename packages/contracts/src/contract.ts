import { adminContract } from "./contract-admin"
import { accountContract, authContract } from "./contract-auth"
import {
  librariesContract,
  mediaContract,
  metadataContract,
  peopleContract,
  searchContract,
  titlesContract,
} from "./contract-library"
import {
  favoritesContract,
  homeContract,
  playbackContract,
  profilesContract,
  statsContract,
} from "./contract-watching"

/**
 * The API between the server and every client. The server implements it
 * with `implement(contract)` and serves it twice: as RPC for the TypeScript
 * clients and as REST, described by OpenAPI, for everything else. Byte
 * streams (video) and browser redirects (OIDC) are plain HTTP routes, see
 * `paths.ts`.
 */
export const contract = {
  auth: authContract,
  account: accountContract,
  libraries: librariesContract,
  metadata: metadataContract,
  titles: titlesContract,
  people: peopleContract,
  search: searchContract,
  media: mediaContract,
  playback: playbackContract,
  home: homeContract,
  favorites: favoritesContract,
  profiles: profilesContract,
  stats: statsContract,
  admin: adminContract,
}

export type Contract = typeof contract
