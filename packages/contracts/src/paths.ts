/** Mount point of the RPC handler. */
export const RPC_PATH = "/api/rpc"

/** Byte-range video stream of one media item. */
export function mediaStreamPath(id: string): string {
  return `/api/media/${encodeURIComponent(id)}/stream`
}

export type ThumbnailSize = "small" | "large"

/**
 * A frame from the video, for cards (`small`, 480px wide) and banners
 * (`large`, 1280px wide). 404 when the server can't extract one.
 */
export function mediaThumbnailPath(
  id: string,
  size: ThumbnailSize = "small",
): string {
  return `/api/media/${encodeURIComponent(id)}/thumbnail?size=${size}`
}

export type ArtworkSize = "small" | "large"

/**
 * Artwork from a metadata provider, cached by the server: `small` is at
 * most 480px wide for cards, `large` at most 1920px for banners. The URL
 * never changes its image, so browsers may cache it for good.
 */
export function artworkPath(id: string, size: ArtworkSize = "small"): string {
  return `/api/artwork/${encodeURIComponent(id)}?size=${size}`
}

export const OIDC_START_PATH = "/api/auth/oidc/start"
export const OIDC_CALLBACK_PATH = "/api/auth/oidc/callback"

/**
 * What the OIDC start route should do with the provider's answer. `sign-in`
 * also creates the first admin during setup; `invite` links the provider to
 * the account of an invite or recovery link.
 */
export type OidcMode = "sign-in" | "link" | "invite"

export function oidcStartPath(
  mode: Exclude<OidcMode, "invite">,
  redirect?: string,
): string {
  const params = new URLSearchParams({ mode })
  if (redirect) params.set("redirect", redirect)
  return `${OIDC_START_PATH}?${params}`
}

/**
 * Use an invite or recovery link by linking the OIDC provider: a form POST
 * with the link's `token`, from the invite page. A POST so the CSRF check
 * stops other sites from starting it.
 */
export const OIDC_INVITE_PATH = "/api/auth/oidc/invite"

/**
 * The web page an invite or recovery link opens. The server builds links
 * from PUBLIC_URL and this path.
 */
export function invitePagePath(token: string): string {
  return `/invite/${encodeURIComponent(token)}`
}

/** Query key the login page reads an OIDC failure from. */
export const AUTH_ERROR_QUERY_KEY = "auth_error"
