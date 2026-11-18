/*
 * Runs the desktop app against a stand-in for a server and checks that
 * the shell does its part: it opens the page with the session's token,
 * the page reaches the shell through the bridge, and mpv plays a clip
 * from the "server" with the same token, pauses, and seeks.
 *
 *   node apps/desktop/smoke/smoke.mjs <path to matinee-desktop>
 *
 * The app needs somewhere to show a window: a desktop session, or a
 * headless compositor. It runs with a directory of its own
 * (MATINEE_DESKTOP_DIR), so it leaves the user's servers and settings
 * alone and runs beside a copy that's open.
 *
 * Whether the picture is on screen is not something this can see. For
 * that, set SMOKE_SCREENSHOT to a command that writes a screenshot to the
 * path in place of `{file}`. It runs while the clip plays, with the page's
 * pink badge and its bar over the video, and SMOKE_OUT (default: a
 * temporary directory, printed at the end) gets the picture, the app's
 * log, and mpv's last state.
 *
 * A check that fails leaves the app running for a moment. SMOKE_FAILED,
 * if set, is a command to look at it with before it's stopped, like one
 * that lists what the threads of a hung app are doing. `{pid}` stands for
 * the app's process and `{out}` for SMOKE_OUT.
 */

import { execSync, spawn } from "node:child_process"
import { createReadStream, createWriteStream } from "node:fs"
import { mkdir, mkdtemp, stat, writeFile } from "node:fs/promises"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import { dirname, extname, join, normalize } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const pages = join(here, "page")
const TOKEN = "smoke-test-token"
const TYPES = new Map([
  [".html", "text/html"],
  [".css", "text/css"],
  [".js", "text/javascript"],
  [".mkv", "video/x-matroska"],
])

const app = process.argv[2]
if (!app) {
  process.stderr.write("Usage: node smoke.mjs <path to matinee-desktop>\n")
  process.exit(2)
}

// How long the app's page gets to answer. An app that hangs never does.
const ANSWER_MS = 30_000

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Fails the run, with what was expected. */
function check(condition, what) {
  if (condition) {
    process.stdout.write(`ok    ${what}\n`)
    return
  }
  throw new Error(`failed: ${what}`)
}

/** Polls `read` until `done` accepts its answer, and returns that answer. */
async function until(what, read, done, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs
  let last
  while (Date.now() < deadline) {
    last = await read().catch(() => undefined)
    if (last !== undefined && done(last)) return last
    await sleep(200)
  }
  throw new Error(
    `timed out waiting for ${what}; last: ${JSON.stringify(last)}`,
  )
}

/**
 * The stand-in server: the health check the shell asks for, the test
 * page, and the clip, with byte ranges as the real one serves files. It
 * notes whether each path came with the session's token.
 */
function serve() {
  const authorized = new Map()
  const server = createServer(async (request, response) => {
    const { pathname } = new URL(request.url, "http://localhost")
    authorized.set(
      pathname,
      request.headers.authorization === `Bearer ${TOKEN}`,
    )
    if (pathname === "/api/health") {
      response.writeHead(200, { "Content-Type": "application/json" })
      response.end(JSON.stringify({ ok: true, contract: "smoke" }))
      return
    }
    const file =
      pathname === "/api/media/clip/stream"
        ? join(here, "clip.mkv")
        : normalize(join(pages, pathname === "/" ? "index.html" : pathname))
    const info = file.startsWith(here)
      ? await stat(file).catch(() => null)
      : null
    if (!info?.isFile()) {
      response.writeHead(404).end()
      return
    }
    const type = TYPES.get(extname(file)) ?? "application/octet-stream"
    const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range ?? "")
    if (!range) {
      response.writeHead(200, {
        "Content-Type": type,
        "Content-Length": info.size,
        "Accept-Ranges": "bytes",
      })
      createReadStream(file).pipe(response)
      return
    }
    const start = Number(range[1])
    const end = range[2] ? Number(range[2]) : info.size - 1
    response.writeHead(206, {
      "Content-Type": type,
      "Content-Length": end - start + 1,
      "Content-Range": `bytes ${start}-${end}/${info.size}`,
      "Accept-Ranges": "bytes",
    })
    createReadStream(file, { start, end }).pipe(response)
  })
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () =>
      resolve({ server, authorized, port: server.address().port }),
    )
  })
}

/** A port nothing listens on, for the app's DevTools. */
function freePort() {
  return new Promise((resolve) => {
    const probe = createServer()
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address()
      probe.close(() => resolve(port))
    })
  })
}

/** Evaluates expressions in the app's page, over the DevTools protocol. */
async function connect(port) {
  const target = await until(
    "the app's page",
    async () =>
      (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(
        (entry) => entry.type === "page",
      ),
    Boolean,
    30_000,
  )
  const socket = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve)
    socket.addEventListener("error", reject)
  })
  const waiting = new Map()
  let nextId = 1
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data)
    waiting.get(message.id)?.(message.result)
    waiting.delete(message.id)
  })
  const evaluate = (expression) =>
    new Promise((resolve, reject) => {
      const id = nextId++
      const late = setTimeout(() => {
        waiting.delete(id)
        reject(new Error(`the app's page didn't answer: ${expression}`))
      }, ANSWER_MS)
      waiting.set(id, (result) => {
        clearTimeout(late)
        if (result?.exceptionDetails) {
          reject(new Error(JSON.stringify(result.exceptionDetails)))
        } else resolve(result?.result?.value)
      })
      socket.send(
        JSON.stringify({
          id,
          method: "Runtime.evaluate",
          params: { expression, awaitPromise: true, returnByValue: true },
        }),
      )
    })
  return { evaluate, close: () => socket.close() }
}

const out =
  process.env.SMOKE_OUT ?? (await mkdtemp(join(tmpdir(), "matinee-smoke-")))
await mkdir(out, { recursive: true })
const home = join(out, "home")
await mkdir(join(home, "config"), { recursive: true })
await mkdir(join(home, "data"), { recursive: true })

const { server, authorized, port } = await serve()
const origin = `http://127.0.0.1:${port}`
// A server the app is signed in to already, as its own files have it.
await writeFile(
  join(home, "config", "servers.json"),
  JSON.stringify({
    current: "smoke",
    servers: [
      {
        id: "smoke",
        url: origin,
        username: "smoke",
        displayName: null,
        avatar: null,
      },
    ],
  }),
)
await writeFile(
  join(home, "data", "tokens.json"),
  JSON.stringify({ smoke: TOKEN }),
)

const devtools = await freePort()
const log = createWriteStream(join(out, "app.log"))
const child = spawn(app, ["--verbose"], {
  env: {
    ...process.env,
    MATINEE_DESKTOP_DIR: home,
    QTWEBENGINE_REMOTE_DEBUGGING: String(devtools),
    QT_FORCE_STDERR_LOGGING: "1",
  },
  stdio: ["ignore", "pipe", "pipe"],
})
child.stdout.pipe(log)
child.stderr.pipe(log)
const exited = new Promise((resolve) => child.on("exit", resolve))

let failed = false
try {
  const page = await connect(devtools)
  const call = async (method, params = {}) =>
    JSON.parse(
      await page.evaluate(
        `smoke.call(${JSON.stringify(method)}, ${JSON.stringify(params)}).then(JSON.stringify)`,
      ),
    )
  const state = async () =>
    JSON.parse(await page.evaluate("JSON.stringify(smoke.state)"))

  await until(
    "the test page",
    () => page.evaluate("typeof smoke"),
    (type) => type === "object",
  )
  check(authorized.get("/") === true, "the page loads with the session's token")

  const info = await call("app.info")
  check(
    info.result?.protocol >= 1,
    `the bridge answers (mpv ${info.result?.mpv})`,
  )
  const refused = await call("servers.list")
  check(
    refused.error?.code === "forbidden",
    "the web app may not read the server list",
  )
  const foreign = await call("player.load", {
    url: "file:///etc/hostname",
    start: 0,
    paused: false,
    audio: null,
    subtitle: null,
    subtitleDelay: 0,
  })
  check(
    foreign.error?.code === "forbidden",
    "mpv only opens the server's addresses",
  )

  await call("player.load", {
    url: "/api/media/clip/stream",
    start: 1,
    paused: false,
    audio: 1,
    subtitle: { kind: "stream", index: 2 },
    subtitleDelay: 0,
  })
  const playing = await until(
    "the clip to play",
    state,
    (now) => now.phase === "ready" && !now.buffering && now.time > 2,
  )
  check(
    playing.video?.width === 426,
    "mpv opened the clip and reports its picture",
  )
  check(
    authorized.get("/api/media/clip/stream") === true,
    "mpv sends the session's token",
  )

  if (process.env.SMOKE_SCREENSHOT) {
    const file = join(out, "playing.png")
    execSync(process.env.SMOKE_SCREENSHOT.replace("{file}", file), {
      stdio: "inherit",
    })
    process.stdout.write(`      screenshot in ${file}\n`)
  }

  await call("player.setPaused", { paused: true })
  const paused = await until("the pause", state, (now) => now.paused === true)
  await sleep(600)
  check(
    Math.abs((await state()).time - paused.time) < 0.2,
    "paused, the time stands still",
  )

  await call("player.seek", { time: 6 })
  const sought = await until(
    "the seek",
    state,
    (now) => !now.seeking && now.time >= 5.9,
  )
  check(sought.phase === "ready", "it seeks")

  const stats = await call("player.stats")
  check(stats.result?.videoCodec === "h264", "the stats name the codec")
  await writeFile(
    join(out, "state.json"),
    JSON.stringify(
      { info: info.result, state: await state(), stats: stats.result },
      null,
      2,
    ),
  )

  await call("player.stop")
  await until("the stop", state, (now) => now.phase === "idle")
  check(true, "it stops")

  page.close()
} catch (cause) {
  failed = true
  process.stderr.write(
    `${cause instanceof Error ? cause.message : String(cause)}\n`,
  )
  if (process.env.SMOKE_FAILED) {
    const look = process.env.SMOKE_FAILED.replaceAll(
      "{pid}",
      String(child.pid),
    ).replaceAll("{out}", out)
    try {
      execSync(look, { stdio: "inherit" })
    } catch {
      process.stderr.write(`couldn't run ${look}\n`)
    }
  }
} finally {
  child.kill()
  await Promise.race([exited, sleep(5000)])
  server.close()
  log.end()
  process.stdout.write(
    `${failed ? "FAILED" : "passed"}; log and state in ${out}\n`,
  )
  process.exit(failed ? 1 : 0)
}
