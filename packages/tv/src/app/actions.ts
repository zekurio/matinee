import type { MediaItem, Season, TitleSummary } from "@matinee/contracts"

import { Observable } from "../lib/observable"
import type { WatchedWhen } from "../model/viewer"

/** What a card's menu is for: a file, a title, or a season of a show. */
export type ActionTarget =
  | { kind: "item"; item: MediaItem }
  | { kind: "title"; title: TitleSummary }
  | { kind: "season"; title: TitleSummary; season: Season }

/** Asking when something was watched, before marking it: its name, and how to mark it. */
export type WatchedAsk = {
  name: string
  mark: (when: WatchedWhen) => Promise<void>
}

/**
 * What the panel at the right edge shows for a card: its menu, opened by
 * holding Select on it, or the question of when it was watched, which
 * marking something watched asks first, as on the phone.
 */
export class Actions extends Observable {
  target: ActionTarget | null = null
  watched: WatchedAsk | null = null

  get isOpen(): boolean {
    return this.target !== null || this.watched !== null
  }

  open(target: ActionTarget) {
    this.target = target
    this.changed()
  }

  askWatched(name: string, mark: (when: WatchedWhen) => Promise<void>) {
    this.target = null
    this.watched = { name, mark }
    this.changed()
  }

  close() {
    this.target = null
    this.watched = null
    this.changed()
  }
}
