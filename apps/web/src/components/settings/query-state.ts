/**
 * Whether a query is fetching, without waiting on it. Solid Query's own
 * `isFetching` reads the data, which holds the nearest boundary until a
 * query without any answers; a disabled one never does. A first load shows
 * in `fetchStatus`; a refetch over data shows only in `isFetching`.
 */
export function fetching(query: {
  fetchStatus: string
  isSuccess: boolean
  isFetching: boolean
}): boolean {
  return (
    query.fetchStatus === "fetching" || (query.isSuccess && query.isFetching)
  )
}
