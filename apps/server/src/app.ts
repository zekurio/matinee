import { readFile } from "node:fs/promises"
import { join, resolve } from "node:path"

import { serveStatic } from "@hono/node-server/serve-static"
import { OPENAPI_PATH, OPENAPI_SPEC_PATH, RPC_PATH } from "@matinee/contracts"
import type { OpenAPIHandler } from "@orpc/openapi/fetch"
import { type HTTPPath, onError } from "@orpc/server"
import { RPCHandler } from "@orpc/server/fetch"
import { type Context, Hono, type Next } from "hono"
import { csrf } from "hono/csrf"
import { secureHeaders } from "hono/secure-headers"

import { appRoutes } from "./auth/apps"
import { avatarRoutes } from "./auth/avatars"
import { oidcRoutes } from "./auth/oidc"
import { env } from "./env"
import { artworkRoutes } from "./media/artwork"
import { streamRoutes } from "./media/stream"
import type { RpcContext } from "./rpc/base"
import { logError } from "./rpc/errors"
import { openapi, openapiSpec } from "./rpc/openapi"
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

  app.get("/api/health", (c) => c.json({ ok: true }))
  app.route("/api/auth/oidc", oidcRoutes)
  app.route("/api/auth/app", appRoutes)
  app.route("/api/media", streamRoutes)
  app.route("/api/artwork", artworkRoutes)
  app.route("/api/avatars", avatarRoutes)

  app.use(`${RPC_PATH}/*`, mount(rpc, RPC_PATH))
  app.get(OPENAPI_SPEC_PATH, async (c) => c.json(await openapiSpec()))
  app.use(`${OPENAPI_PATH}/*`, mount(openapi, OPENAPI_PATH))

  app.all("/api/*", (c) => c.json({ error: "Not found" }, 404))

  if (env.MATINEE_WEB_DIST) {
    const root = resolve(env.MATINEE_WEB_DIST)
    let indexHtml: Promise<string> | null = null
    app.use(
      "/assets/*",
      serveStatic({
        root,
        onFound: (_path, c) => {
          c.header("Cache-Control", "public, max-age=31536000, immutable")
        },
      }),
    )
    app.use("*", serveStatic({ root }))
    // Client-side routes all load the app shell.
    app.get("*", async (c) => {
      indexHtml ??= readFile(join(root, "index.html"), "utf8")
      c.header("Cache-Control", "no-cache")
      return c.html(await indexHtml)
    })
  }

  return app
}
