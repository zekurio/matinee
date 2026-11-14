import { readFile } from "node:fs/promises"
import { join, resolve } from "node:path"

import { serveStatic } from "@hono/node-server/serve-static"
import {
  API_REFERENCE_PAGE_PATH,
  HEALTH_PATH,
  OPENAPI_DOCS_PATH,
  OPENAPI_PATH,
  OPENAPI_SPEC_PATH,
  RPC_PATH,
} from "@matinee/contracts"
import type { OpenAPIHandler } from "@orpc/openapi/fetch"
import { type HTTPPath, onError } from "@orpc/server"
import { RPCHandler } from "@orpc/server/fetch"
import { type Context, Hono, type Next } from "hono"
import { csrf } from "hono/csrf"
import { secureHeaders } from "hono/secure-headers"

import { appRoutes } from "./auth/apps"
import { avatarRoutes } from "./auth/avatars"
import { oidcRoutes } from "./auth/oidc"
import { compressBytes, compressJson, pickEncoding } from "./compress"
import { env } from "./env"
import { artworkRoutes } from "./media/artwork"
import { downloadRoutes } from "./media/download-routes"
import { streamRoutes } from "./media/stream"
import type { RpcContext } from "./rpc/base"
import { logError } from "./rpc/errors"
import { contractFingerprint, openapi, openapiSpec } from "./rpc/openapi"
import { router } from "./rpc/router"

const rpc = new RPCHandler(router, { interceptors: [onError(logError)] })

/** Hand requests under `prefix` to an oRPC handler, the rest on. */
function mount(
  handler: RPCHandler<RpcContext> | OpenAPIHandler<RpcContext>,
  prefix: HTTPPath,
) {
  return async (c: Context, next: Next) => {
    const { matched, response } = await handler.handle(c.req.raw, {
      prefix,
      context: { hono: c },
    })
    // newResponse merges cookies the procedures set on `c`.
    if (matched) return c.newResponse(response.body, response)
    await next()
  }
}

export function createApp() {
  const app = new Hono()

  app.use(secureHeaders({ crossOriginResourcePolicy: "same-origin" }))
  // A browser sends a body other than form data or text, or an
  // Authorization header, only after a CORS preflight, which fails since the
  // server answers none. That leaves form posts and bodiless requests, which
  // this checks. A bearer token can't come from another site's page, and
  // readSession ignores the cookie when one is sent.
  const checkOrigin = csrf({ origin: env.PUBLIC_URL })
  app.use("/api/*", (c, next) =>
    c.req.header("authorization")?.startsWith("Bearer ")
      ? next()
      : checkOrigin(c, next),
  )

  app.use("/api/*", compressJson)
  app.get(HEALTH_PATH, async (c) =>
    c.json({ ok: true, contract: await contractFingerprint() }),
  )
  app.route("/api/auth/oidc", oidcRoutes)
  app.route("/api/auth/app", appRoutes)
  app.route("/api/media", streamRoutes)
  app.route("/api/downloads", downloadRoutes)
  app.route("/api/artwork", artworkRoutes)
  app.route("/api/avatars", avatarRoutes)

  app.use(`${RPC_PATH}/*`, mount(rpc, RPC_PATH))
  app.get(OPENAPI_SPEC_PATH, async (c) => c.json(await openapiSpec()))
  // The reference is a page of the web app, which can't live under /api.
  app.get(OPENAPI_DOCS_PATH, (c) => c.redirect(API_REFERENCE_PAGE_PATH))
  app.use(`${OPENAPI_PATH}/*`, mount(openapi, OPENAPI_PATH))

  app.all("/api/*", (c) => c.json({ error: "Not found" }, 404))

  if (env.MATINEE_WEB_DIST) {
    const root = resolve(env.MATINEE_WEB_DIST)
    let indexHtml: Promise<IndexHtml> | null = null
    app.use(
      "/assets/*",
      serveStatic({
        root,
        precompressed: true,
        onFound: (_path, c) => {
          c.header("Cache-Control", "public, max-age=31536000, immutable")
        },
      }),
    )
    // A missing asset is a 404, not the app shell: a browser holding an
    // older build's page should fail to load it, not parse HTML as code.
    app.get("/assets/*", (c) => c.body(null, 404))
    // Everything else, `/` and its index.html included, keeps its name
    // across builds, so the browser asks again each time. The store gives
    // these files a 1970 mtime, which would otherwise let a browser cache
    // them for years.
    app.use(
      "*",
      serveStatic({
        root,
        precompressed: true,
        onFound: (_path, c) => {
          c.header("Cache-Control", "no-cache")
        },
      }),
    )
    // Client-side routes all load the app shell.
    app.get("*", async (c) => {
      indexHtml ??= loadIndexHtml(join(root, "index.html"))
      const html = await indexHtml
      const encoding = pickEncoding(c.req.header("Accept-Encoding"))
      c.header("Cache-Control", "no-cache")
      c.header("Content-Type", "text/html; charset=UTF-8")
      c.header("Vary", "Accept-Encoding")
      if (!encoding) return c.body(html.raw)
      c.header("Content-Encoding", encoding)
      return c.body(html[encoding])
    })
  }

  return app
}

type IndexHtml = {
  raw: Uint8Array<ArrayBuffer>
  br: Uint8Array<ArrayBuffer>
  gzip: Uint8Array<ArrayBuffer>
}

async function loadIndexHtml(path: string): Promise<IndexHtml> {
  const raw = new Uint8Array(await readFile(path))
  const [br, gzip] = await Promise.all([
    compressBytes(raw, "br"),
    compressBytes(raw, "gzip"),
  ])
  return { raw, br, gzip }
}
