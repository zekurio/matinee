import {
  hashKey,
  QueriesObserver,
  type QueryObserverOptions,
  type QueryObserverResult,
  useQueryClient,
} from "@tanstack/solid-query"
import { createMemo, from } from "solid-js"

/**
 * Several queries at once, each loading on its own, as plain results.
 * Read through one observer rather than Solid Query's `useQueries`, whose
 * data reads wait while a query loads: a row that loads, fails, or comes
 * back holds up no other. An accessor for the results, in the order of
 * `options`, or undefined before the first.
 */
export function useFollowedQueries<Data>(
  options: () => readonly QueryObserverOptions<Data>[],
) {
  const queryClient = useQueryClient()
  // The same queries in a new array keep the observer.
  const list = createMemo(options, {
    equals: (before, after) => keys(before) === keys(after),
  })
  return createMemo(() => {
    const current = list()
    return from<QueryObserverResult<Data>[]>((next) => {
      const observer = new QueriesObserver(queryClient, [...current])
      // SAFETY: each result answers one of `current`, whose data is `Data`.
      const typed = (results: QueryObserverResult[]) =>
        next(results as QueryObserverResult<Data>[])
      const unsubscribe = observer.subscribe(typed)
      typed(observer.getCurrentResult())
      return unsubscribe
    })
  })
}

function keys<Data>(list: readonly QueryObserverOptions<Data>[]): string {
  return list
    .map((entry) => (entry.queryKey ? hashKey(entry.queryKey) : ""))
    .join("\n")
}
