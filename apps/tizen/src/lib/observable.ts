import { useLayoutEffect, useReducer } from "preact/hooks"

/**
 * Something whose state components show. A class extends it, keeps its
 * state in plain fields, and calls `changed()` after writing them; a
 * component that reads it with `useObserved` draws again then.
 */
export class Observable {
  private readonly listeners = new Set<() => void>()
  /** Counts the changes, so a subscriber can tell it missed one. */
  private count = 0

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  get changes(): number {
    return this.count
  }

  protected changed() {
    this.count += 1
    // A listener may unsubscribe another while they run.
    for (const listener of Array.from(this.listeners)) listener()
  }
}

/** Draws the component again whenever `source` changes. */
export function useObserved<Source extends Observable | null | undefined>(
  source: Source,
): Source {
  const [, redraw] = useReducer((count: number) => count + 1, 0)
  const seen = source?.changes
  useLayoutEffect(() => {
    if (!source) return
    // It changed between the render and here.
    if (source.changes !== seen) redraw(0)
    return source.subscribe(() => redraw(0))
  }, [source])
  return source
}

/** One value components show, for state too small for a class. */
export class Value<T> extends Observable {
  private current: T

  constructor(initial: T) {
    super()
    this.current = initial
  }

  get(): T {
    return this.current
  }

  set(next: T) {
    if (Object.is(next, this.current)) return
    this.current = next
    this.changed()
  }
}

/** The value in `source`, drawn again when it changes. */
export function useValue<T>(source: Value<T>): T {
  return useObserved(source).get()
}
