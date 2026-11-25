import type { MediaItem, Season, TitleSummary } from "@matinee/contracts"

import { session } from "../auth/session"
import { Observable } from "../lib/observable"

/*
 * Watched and favorite marks the person changed in this run of the app,
 * over what the server sent with each page, so a mark made on one page
 * shows on every other at once. `version` moves when something changed
 * that the marks can't say, like a whole show marked watched or a video
 * played, and pages fetch again then.
 */

/** When a file was watched, as the contract's `WatchedAt`; undefined is now. */
export type WatchedWhen = "released" | "unknown" | Date | undefined

/**
 * Values shown ahead of the server's answer, by id. A request that fails
 * puts back what the server last answered here, or the page's own value,
 * but only while it's still the newest request for that id, so answers
 * that come back out of order don't undo a later press.
 */
class Marks {
  private readonly values = new Map<string, boolean>()
  private readonly confirmed = new Map<string, boolean>()
  private readonly newest = new Map<string, number>()
  private tickets = 0

  constructor(
    private readonly redraw: () => void,
    private readonly reconcile: () => void,
  ) {}

  get(id: string): boolean | undefined {
    return this.values.get(id)
  }

  async send(id: string, value: boolean, request: () => Promise<void>) {
    const ticket = this.take(id)
    this.values.set(id, value)
    this.redraw()
    try {
      await request()
    } catch (cause) {
      if (this.newest.get(id) === ticket) {
        const known = this.confirmed.get(id)
        if (known === undefined) this.values.delete(id)
        else this.values.set(id, known)
        this.redraw()
      } else this.reconcile()
      throw cause
    }
    if (this.newest.get(id) === ticket) this.confirmed.set(id, value)
    else this.reconcile()
  }

  /** The server holds `value` for `id` now, by an answer to another request. */
  confirm(id: string, value: boolean) {
    this.take(id)
    this.values.set(id, value)
    this.confirmed.set(id, value)
  }

  /** Show the page's own value for `id` again. */
  forget(id: string) {
    this.take(id)
    this.values.delete(id)
    this.confirmed.delete(id)
  }

  private take(id: string): number {
    this.tickets += 1
    this.newest.set(id, this.tickets)
    return this.tickets
  }
}

export class Viewer extends Observable {
  /** Moves when pages should fetch again. */
  version = 0

  private readonly redraw = () => this.changed()
  private readonly bump = () => this.touch()
  private readonly titleFavorites = new Marks(this.redraw, this.bump)
  private readonly itemFavorites = new Marks(this.redraw, this.bump)
  private readonly seasonFavorites = new Marks(this.redraw, this.bump)
  private readonly itemWatched = new Marks(this.redraw, this.bump)
  private readonly titleWatched = new Marks(this.redraw, this.bump)
  /** The title and season of each file marked here, for a mark over a whole title or season. */
  private readonly places = new Map<
    string,
    { title: string; season: number | null }
  >()

  /** Something changed that the marks can't say: pages fetch again. */
  touch() {
    this.version += 1
    this.changed()
  }

  isFavorite(title: TitleSummary): boolean {
    return this.titleFavorites.get(title.id) ?? title.favorite
  }

  /** A movie is a favorite through its title, an episode by itself. */
  isItemFavorite(item: MediaItem): boolean {
    const title = item.title
    if (title?.kind === "movie") return this.isFavorite(title)
    return this.itemFavorites.get(item.id) ?? item.favorite
  }

  /** The files without a season number aren't a season to mark, so they never are. */
  isSeasonFavorite(title: TitleSummary, season: Season): boolean {
    if (season.number === null) return false
    return (
      this.seasonFavorites.get(`${title.id}/${season.number}`) ??
      season.favorite
    )
  }

  isWatched(title: TitleSummary): boolean {
    return this.titleWatched.get(title.id) ?? title.watched
  }

  isItemWatched(item: MediaItem): boolean {
    return this.itemWatched.get(item.id) ?? item.progress?.completed ?? false
  }

  setFavorite(title: TitleSummary, favorite: boolean): Promise<void> {
    return this.titleFavorites.send(title.id, favorite, () =>
      session.api.favorites.set({ titleId: title.id, favorite }),
    )
  }

  setItemFavorite(item: MediaItem, favorite: boolean): Promise<void> {
    const title = item.title
    if (title?.kind === "movie") return this.setFavorite(title, favorite)
    return this.itemFavorites.send(item.id, favorite, () =>
      session.api.favorites.setItem({ itemId: item.id, favorite }),
    )
  }

  async setSeasonFavorite(
    title: TitleSummary,
    season: Season,
    favorite: boolean,
  ) {
    const number = season.number
    if (number === null) return
    await this.seasonFavorites.send(`${title.id}/${number}`, favorite, () =>
      session.api.favorites.setSeason({
        titleId: title.id,
        season: number,
        favorite,
      }),
    )
  }

  async setItemWatched(item: MediaItem, watched: boolean, when?: WatchedWhen) {
    const title = item.title
    if (title) {
      this.places.set(item.id, { title: title.id, season: item.seasonNumber })
    }
    await this.itemWatched.send(item.id, watched, () =>
      session.api.playback.setWatched({
        itemId: item.id,
        watched,
        watchedAt: watched ? when : undefined,
      }),
    )
    // A movie is watched with its one file. Whether a whole show is
    // watched now is the server's to say.
    if (title?.kind === "movie") this.titleWatched.confirm(title.id, watched)
    else if (title) this.titleWatched.forget(title.id)
    this.touch()
  }

  /**
   * Every file of a title, or of one of its seasons. Only the whole title
   * shows as marked before the server answers; a season's files show once
   * it did.
   */
  async setWatched(
    title: TitleSummary,
    watched: boolean,
    season?: number,
    when?: WatchedWhen,
  ) {
    const send = () =>
      session.api.playback.setTitleWatched({
        titleId: title.id,
        watched,
        season,
        watchedAt: watched ? when : undefined,
      })
    if (season === undefined) {
      await this.titleWatched.send(title.id, watched, send)
    } else {
      await send()
      this.titleWatched.forget(title.id)
    }
    // The files marked one by one before now are this answer too.
    for (const [itemId, place] of this.places) {
      if (
        place.title === title.id &&
        (season === undefined || place.season === season)
      ) {
        this.itemWatched.confirm(itemId, watched)
      }
    }
    this.touch()
  }
}
