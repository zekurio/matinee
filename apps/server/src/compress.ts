import { promisify } from "node:util"
import { brotliCompress, constants, gzip } from "node:zlib"

import type { MiddlewareHandler } from "hono"

const brotli = promisify(brotliCompress)
const gz = promisify(gzip)

// Below this, the headers cost more than compressing saves.
const MIN_BYTES = 1024
// Fast enough per response, and still well ahead of gzip on JSON.
const BROTLI_QUALITY = 4

/**
 * The encoding to send, from the client's Accept-Encoding. One it lists
 * with `q=0` is refused, not offered.
 */
export function pickEncoding(accept: string | undefined): "br" | "gzip" | null {
  const offered = new Set(
    (accept ?? "")
      .split(",")
      .filter((part) => !/;\s*q=0(?:\.0*)?\s*$/i.test(part))
      .map((part) => part.split(";")[0]?.trim().toLowerCase())
      .filter(Boolean),
  )
  if (offered.has("br")) return "br"
  if (offered.has("gzip")) return "gzip"
  return null
}

export async function compressBytes(
  bytes: Uint8Array,
  encoding: "br" | "gzip",
): Promise<Uint8Array<ArrayBuffer>> {
  const out = await (encoding === "br"
    ? brotli(bytes, {
        params: {
          [constants.BROTLI_PARAM_QUALITY]: BROTLI_QUALITY,
          [constants.BROTLI_PARAM_SIZE_HINT]: bytes.byteLength,
        },
      })
    : gz(bytes, { level: 6 }))
  // A copy that owns a plain ArrayBuffer, which Response takes.
  return new Uint8Array(out)
}

/**
 * Brotli or gzip for JSON answers: RPC and REST results, which are whole
 * documents. Event streams, video, and images pass untouched.
 */
export const compressJson: MiddlewareHandler = async (c, next) => {
  await next()
  const res = c.res
  if (!res.body || res.headers.has("Content-Encoding")) return
  if (!res.headers.get("Content-Type")?.startsWith("application/json")) return
  c.header("Vary", "Accept-Encoding", { append: true })
  const encoding = pickEncoding(c.req.header("Accept-Encoding"))
  if (!encoding) return
  const body = new Uint8Array(await res.arrayBuffer())
  // The old response is spent either way, so both branches answer anew.
  if (body.byteLength < MIN_BYTES) {
    c.res = new Response(body, res)
    return
  }
  const compressed = await compressBytes(body, encoding)
  c.res = new Response(compressed, res)
  c.res.headers.set("Content-Encoding", encoding)
  c.res.headers.set("Content-Length", String(compressed.byteLength))
}
