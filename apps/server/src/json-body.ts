import type { SchemaBoundaryInput } from "@matinee/contracts/schema"

/*
 * `response.json()` reads a body of any size into memory. Services the
 * server calls out to (metadata providers, Radarr, Sonarr) are trusted to
 * answer, not to answer small, so their JSON goes through here instead.
 */

/** A body larger than the reader allows. */
export class BodyTooLarge extends Error {
  constructor(readonly limit: number) {
    super(`The response body is larger than ${limit} bytes`)
    this.name = "BodyTooLarge"
  }
}

/** The declared length, or null when the header is missing or malformed. */
function declaredLength(response: Response): number | null {
  const header = response.headers.get("content-length")?.trim()
  if (!header || !/^\d+$/.test(header)) return null
  const length = Number(header)
  return Number.isSafeInteger(length) ? length : null
}

/**
 * Read `response` as JSON, at most `maxBytes` of decoded body. Throws
 * BodyTooLarge past the limit, a SyntaxError for a body that isn't JSON,
 * and whatever the stream throws when the request's signal aborts it.
 * The body is cancelled on every failure.
 */
export async function readJsonBody(
  response: Response,
  maxBytes: number,
): Promise<SchemaBoundaryInput> {
  // Content-Length is optional and, under Content-Encoding, counts the
  // compressed bytes, so it only settles an answer that's too large up front.
  const length = declaredLength(response)
  if (length !== null && length > maxBytes) {
    await response.body?.cancel().catch(() => undefined)
    throw new BodyTooLarge(maxBytes)
  }
  const reader = response.body?.getReader()
  // Like response.json(): UTF-8, a leading BOM dropped.
  const decoder = new TextDecoder("utf-8")
  let text = ""
  if (reader) {
    let received = 0
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        received += value.byteLength
        if (received > maxBytes) throw new BodyTooLarge(maxBytes)
        text += decoder.decode(value, { stream: true })
      }
    } catch (cause) {
      await reader.cancel().catch(() => undefined)
      throw cause
    } finally {
      reader.releaseLock()
    }
  }
  text += decoder.decode()
  const value: SchemaBoundaryInput = JSON.parse(text)
  return value
}
