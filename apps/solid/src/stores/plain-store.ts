import { type Accessor, createStore } from "solid-js"

/**
 * State that code outside rendering reads and writes at once, as a zustand
 * store does: `getState()` returns the latest object, a new one after each
 * `setState`. Solid only shows a write after the next flush, and the
 * player's code often reads right after it writes. `view` is a shallow
 * store of the same fields, so a render tracks only the fields it reads,
 * and their values stay plain objects.
 */
export type PlainStore<State extends object> = {
  getState: () => State
  setState: (change: Partial<State>) => void
  /** The same fields, as reads that track. */
  view: Readonly<State>
}

export function createPlainStore<State extends object>(
  initial: State,
): PlainStore<State> {
  let state = initial
  // SAFETY: createStore rules out a function as its state, which TypeScript
  // can't check for a type parameter; the state is an object of fields.
  const seed = { ...initial } as never
  const [view, setView] = createStore<State>(seed, { shallow: true })
  return {
    getState: () => state,
    setState: (change) => {
      state = { ...state, ...change }
      setView((draft) => {
        Object.assign(draft, change)
      })
    },
    view,
  }
}

/** A module-wide store read the zustand way: `useStore(select)` or `useStore.getState()`. */
export type StoreHook<State extends object> = (<Slice>(
  select: (state: State) => Slice,
) => Accessor<Slice>) & {
  getState: () => State
  setState: (change: Partial<State>) => void
}

export function storeHook<State extends object>(
  store: PlainStore<State>,
): StoreHook<State> {
  const hook =
    <Slice>(select: (state: State) => Slice) =>
    () =>
      select(store.view)
  return Object.assign(hook, {
    getState: store.getState,
    setState: store.setState,
  })
}
