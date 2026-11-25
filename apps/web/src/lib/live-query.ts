import {
  QueryObserver,
  type QueryObserverOptions,
  type QueryObserverResult,
  useQueryClient,
} from "@tanstack/solid-query"
import { createMemo, from } from "solid-js"

/**
 * A query followed through an observer of its own: an accessor for its
 * latest result. Every query with `liveQuery` (a stream from the server)
 * goes through this rather than `useQuery`. Solid Query holds a query's
 * new `data` until its fetch settles, and a stream's fetch lasts until the
 * stream ends, so `useQuery` shows a stream's first answer alone.
 *
 * The options are read tracked, so a new key or `enabled` follows the new
 * query, and the old observer closes.
 */
export function useLiveQuery<Streamed, Data = Streamed>(
  options: () => QueryObserverOptions<Streamed, Error, Data>,
) {
  const queryClient = useQueryClient()
  return createMemo(() => {
    const current = options()
    return from<QueryObserverResult<Data>>((next) => {
      const observer = new QueryObserver(queryClient, current)
      const unsubscribe = observer.subscribe(next)
      next(observer.getCurrentResult())
      return unsubscribe
    })
  })
}

/** A result's data once it has some, kept through a failed refetch. */
export function liveData<Data>(
  result: QueryObserverResult<Data> | undefined,
): Data | undefined {
  return result && (result.isSuccess || result.isRefetchError)
    ? result.data
    : undefined
}
