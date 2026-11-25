import { createContext, createEffect, useContext } from "solid-js"

import { Observable } from "../lib/observable"
import type { ImageSource } from "../model/format"

/**
 * What the shell draws around its pages and the pages steer: the picture
 * behind them, and whether the clock shows. The clock goes under an open
 * panel, and while a page has scrolled its content up to it.
 */
export class Chrome extends Observable {
  /** The pictures behind the page, the first that loads. Empty for none. */
  backdrop: readonly ImageSource[] = []
  /** The page that asked for them, so a new page's show at once. */
  backdropPage = 0
  panels = 0
  scrolled = 0

  panelOpened(change: number) {
    this.panels += change
    this.changed()
  }

  pageScrolled(change: number) {
    this.scrolled += change
    this.changed()
  }

  showBackdrop(page: number, sources: readonly ImageSource[]) {
    if (
      this.backdropPage === page &&
      this.backdrop.join(" ") === sources.join(" ")
    ) {
      return
    }
    this.backdrop = sources
    this.backdropPage = page
    this.changed()
  }
}

export const ChromeContext = createContext<Chrome | null>(null)

/** Hides the clock while `scrolled`, for a page whose content scrolls up under it. */
export function useHideClock(scrolled: () => boolean): void {
  const chrome = useContext(ChromeContext)
  createEffect(
    () => scrolled(),
    (on) => {
      if (!on || !chrome) return
      chrome.pageScrolled(1)
      return () => chrome.pageScrolled(-1)
    },
  )
}
