import type { SchemaBoundaryInput } from "@matinee/contracts/schema"

import { BodyTooLarge, readJsonBody } from "../json-body"
import { log } from "../log"
import { ProviderError } from "./types"

const TIMEOUT_MS = 20_000
// The largest TMDB and TVDB replies (extended records, image lists, episode
// pages) run to a few hundred kilobytes. This leaves plenty of room.
const MAX_BODY_BYTES = 16 * 1024 * 1024
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
 * The body is read up to a size limit and checked with `schema`.
 */
export async function fetchJson<T>(
  provider: string,
  url: string | URL,
  schema: { parse: (value: SchemaBoundaryInput) => T },
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
      let body: SchemaBoundaryInput
      try {
        body = await readJsonBody(response, MAX_BODY_BYTES)
      } catch (cause) {
        if (cause instanceof BodyTooLarge) {
          log.warn(`${provider} sent a reply over ${MAX_BODY_BYTES} bytes`)
          throw new ProviderError(
            `${provider} sent a reply too large for Matinee to read.`,
            null,
          )
        }
        // A 200 with HTML or a truncated body, from a proxy or a provider
        // mid-outage, or a body the timeout cut off. The parser's message
        // would show the start of the body.
        log.warn(`Couldn't read ${provider}'s reply as JSON`, cause)
        throw new ProviderError(
          `${provider} sent a reply Matinee couldn't read. Try again later.`,
          null,
        )
      }
      try {
        return schema.parse(body)
      } catch (cause) {
        log.warn(`${provider} sent a reply in an unexpected shape`, cause)
        throw new ProviderError(
          `${provider} sent a reply Matinee couldn't read. Try again later.`,
          null,
        )
      }
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
