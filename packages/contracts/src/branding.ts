import { Artwork } from "./artwork"
import { t } from "./schema"
import { ThemeAccents } from "./theme"

/*
 * Branding: how the server looks to everyone on it, signed in or not. The
 * accents of the Matinee theme, and the wall of artwork behind the login
 * screen. Adapted from alloy.
 */

/**
 * What the login backdrop shows: title posters, landscape thumbs (the
 * titles' backdrops), or both, mixed at random.
 */
export const LOGIN_BACKDROP_ARTWORK = ["mixed", "posters", "thumbs"] as const
export const LoginBackdropArtwork = t.enum(LOGIN_BACKDROP_ARTWORK)
export type LoginBackdropArtwork = t.infer<typeof LoginBackdropArtwork>

export const LOGIN_BACKDROP_MAX_BLUR = 48

/**
 * A sloped wall of artwork that drifts behind the login form. It shows
 * only titles from the libraries the built-in group opens, since anyone
 * who opens the login page sees it.
 */
export const LoginBackdrop = t.object({
  enabled: t.boolean(),
  artwork: LoginBackdropArtwork,
  /** Blur over the wall, in CSS pixels. */
  blur: t.number().int().min(0).max(LOGIN_BACKDROP_MAX_BLUR),
  /**
   * How far the wall fades into the page's background, in percent: 0 shows
   * it at full strength, 100 hides it.
   */
  fade: t.number().int().min(0).max(100),
})
export type LoginBackdrop = t.infer<typeof LoginBackdrop>

export const DEFAULT_LOGIN_BACKDROP: Readonly<LoginBackdrop> = Object.freeze({
  enabled: false,
  artwork: "mixed",
  blur: 12,
  fade: 70,
})

export const Branding = t.object({
  /** Accents an admin picked for the Matinee theme on this server. */
  themeAccents: ThemeAccents,
  loginBackdrop: LoginBackdrop,
})
export type Branding = t.infer<typeof Branding>

export const LOGIN_BACKDROP_KINDS = ["poster", "thumb"] as const
export const LoginBackdropKind = t.enum(LOGIN_BACKDROP_KINDS)
export type LoginBackdropKind = t.infer<typeof LoginBackdropKind>

/**
 * One image on the wall: a 2:3 poster or a 16:9 thumb. Load it from
 * `artworkPath()`, which serves these without a session while the
 * backdrop is on.
 */
export const LoginBackdropTile = t.object({
  artwork: Artwork,
  kind: LoginBackdropKind,
})
export type LoginBackdropTile = t.infer<typeof LoginBackdropTile>

/** A fresh random pick on every request, empty while the backdrop is off. */
export const LoginBackdropTiles = t.object({
  tiles: t.array(LoginBackdropTile),
})
export type LoginBackdropTiles = t.infer<typeof LoginBackdropTiles>
