import { avatarPath } from "@matinee/contracts/paths"

/**
 * Where clients load the user's picture: the upload this server keeps, or
 * the provider's picture the user follows, at the provider's own URL. That
 * URL stays the same when the picture changes there, and the provider's
 * cache headers decide when clients see the new one.
 */
export function avatarUrl(row: {
  avatarId: string | null
  avatarUrl: string | null
}): string | null {
  return row.avatarId ? avatarPath(row.avatarId) : row.avatarUrl
}
