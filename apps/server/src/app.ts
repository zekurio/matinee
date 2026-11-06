import { readFile } from "node:fs/promises"
import { join, resolve } from "node:path"

import { serveStatic } from "@hono/node-server/serve-static"
import { RPC_PATH } from "@matinee/contracts"
import { onError, ORPCError } from "@orpc/server"
import { RPCHandler } from "@orpc/server/fetch"
import { Hono } from "hono"
import { csrf } from "hono/csrf"
import { secureHeaders } from "hono/secure-headers"

import { oidcRoutes } from "./auth/oidc"
import { env } from "./env"
import { log } from "./log"
import { artworkRoutes } from "./media/artwork"
import { streamRoutes } from "./media/stream"
import { router } from "./rpc/router"

const rpc = new RPCHandler(router, {
  interceptors: [
    onError((error) => {
      // Expected failures carry a status below 500 and a user-facing message.
      if (error instanceof ORPCError && error.status < 500) return
      log.error("RPC failed", error)
    }),
  ],
})

export function createApp() {
  const app = new Hono()

  app.use(secureHeaders({ crossOriginResourcePolicy: "same-origin" }))
  // JSON bodies already need a CORS preflight. This covers form posts.
  app.use("/api/*", csrf({ origin: env.PUBLIC_URL }))

  app.get("/api/health", (c) => c.json({ ok: true }))
  app.route("/api/auth/oidc", oidcRoutes)
  app.route("/api/media", streamRoutes)
  app.route("/api/artwork", artworkRoutes)

  app.use(`${RPC_PATH}/*`, async (c, next) => {
    const { matched, response } = await rpc.handle(c.req.raw, {
      prefix: RPC_PATH,
      context: { hono: c },
    })
    // newResponse merges cookies the procedures set on `c`.
    if (matched) return c.newResponse(response.body, response)
    await next()
  })

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
