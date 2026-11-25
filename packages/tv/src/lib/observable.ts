import { createSignal, onCleanup } from "solid-js"

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

/**
 * The source as an accessor that draws again whenever it changes: read
 * it in JSX, a memo, or an effect. A component runs once in Solid, so
 * the read, not the component, is what follows the changes.
 */
export function useObserved<Source extends Observable | null | undefined>(
  source: Source,
): () => Source {
  const [version, setVersion] = createSignal(0, { equals: false })
  if (source) {
    const unsubscribe = source.subscribe(() => setVersion((count) => count + 1))
    onCleanup(unsubscribe)
  }
  return () => {
    version()
    return source
  }
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
export function useValue<T>(source: Value<T>): () => T {
  const observed = useObserved(source)
  return () => observed().get()
}
