import { limiter } from "./process"

/**
 * Runs jobs a few at a time, shares one run between callers that ask for
 * the same key at once, and remembers keys whose job failed so a broken
 * file isn't retried on every request. Adapted from alloy's keyed-work,
 * without cancellation: a result nobody waits for any more still lands in
 * the cache for the next request.
 */
export function keyedWork<T>(concurrency: number) {
  const withSlot = limiter(concurrency)
  const inflight = new Map<string, Promise<T>>()
  const failed = new Set<string>()

  return {
    hasFailed: (key: string) => failed.has(key),
    /** Rejects with the job's error, for every caller that shared it. */
    run(key: string, job: () => Promise<T>): Promise<T> {
      const pending = inflight.get(key)
      if (pending) return pending
      const result = withSlot(job)
        .catch((cause: unknown) => {
          failed.add(key)
          throw cause
        })
        .finally(() => inflight.delete(key))
      inflight.set(key, result)
      return result
    },
  }
}
