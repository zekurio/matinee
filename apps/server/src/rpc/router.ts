import { account } from "./account"
import { adminAuth } from "./admin-auth"
import { adminUsers } from "./admin-users"
import { auth } from "./auth"
import { pub } from "./base"
import { adminRoutes, libraries, media } from "./libraries"
import { home, playback } from "./playback"
import { metadata, titles } from "./titles"

export const router = pub.router({
  auth,
  account,
  libraries,
  metadata,
  titles,
  media,
  playback,
  home,
  admin: { ...adminRoutes, auth: adminAuth, users: adminUsers },
})
