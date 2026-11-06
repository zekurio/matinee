import { ProviderError } from "./types"

const TIMEOUT_MS = 20_000
const MAX_ATTEMPTS = 4
const MAX_WAIT_MS = 60_000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function retryDelay(response: Response | null, attempt: number): number {
  const header = response?.headers.get("retry-after")
  const seconds = header ? Number(header) : Number.NaN
  if (Number.isFinite(seconds)) return Math.min(seconds * 1000, MAX_WAIT_MS)
  return Math.min(1000 * 2 ** attempt, MAX_WAIT_MS)
}

/**
 * Fetch JSON from a provider. Rate limits, server errors, and network
 * failures are retried with backoff; other failures throw a ProviderError.
 */
export async function fetchJson<T>(
  provider: string,
  url: string | URL,
  init: RequestInit = {},
): Promise<T> {
  // A network failure on the last attempt is reported as unreachable, not as
  // an earlier attempt's status.
  let lastError: ProviderError | null = null
  const headers = new Headers(init.headers)
  if (!headers.has("accept")) headers.set("accept", "application/json")
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let response: Response | null = null
    try {
      response = await fetch(url, {
        ...init,
        headers,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
    } catch {
      lastError = null
      await sleep(retryDelay(null, attempt))
      continue
    }
    if (response.ok) {
      // SAFETY: Callers name the response shape the provider documents for
      // the endpoint they call. The body isn't schema-checked.
      return (await response.json()) as T
    }
    if (response.status === 429 || response.status >= 500) {
      lastError = new ProviderError(
        `${provider} answered ${response.status}`,
        response.status,
      )
      await response.body?.cancel()
      await sleep(retryDelay(response, attempt))
      continue
    }
    await response.body?.cancel()
    throw new ProviderError(
      `${provider} answered ${response.status} for ${new URL(url).pathname}`,
      response.status,
    )
  }
  if (lastError) throw lastError
  throw new ProviderError(`Couldn't reach ${provider}`, null)
}
