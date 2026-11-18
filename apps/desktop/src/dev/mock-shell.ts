import { t } from "@matinee/contracts/schema"
import {
  BRIDGE_PROTOCOL,
  type BridgeTransport,
  type DesktopSettings,
  type DiscoveredServer,
  type EventData,
  type EventName,
  type MethodName,
  type MethodResult,
  methods,
  type SavedServer,
  SHELL_REASONS,
  type ServerProbe,
  SIGN_IN_FAILURES,
  type SignInFailure,
  type SignInMethod,
} from "@matinee/desktop-bridge"

/*
 * A pretend shell for `pnpm --filter @matinee/desktop dev` in a browser,
 * which has no `window.matineeDesktop`. main.tsx loads it in development
 * only. It answers like the native one, after a delay, and a panel in the
 * corner switches what the shell says and ends a running sign-in.
 *
 * The address field answers by what's typed:
 *   anything with a dot, or an IP    a server (http for an IP or a port)
 *   no dot, spaces                   invalid
 *   "offline", "down", 10.x.x.x       unreachable
 *   "router", "notmatinee"           not-matinee
 *   "boom"                           the shell fails the request
 * A server with "flaky" in its address fails to start a sign-in.
 *
 * Query parameters:
 *   ?reason=welcome|servers|signed-out|unreachable   what shell.state says
 *   ?saved=0       nothing saved, whatever the reason
 *   ?lan=0         the local network has no servers
 *   ?outcome=approve|expired|denied|unreachable|failed|none
 *                  how a sign-in ends on its own (approve, after a few seconds)
 *   ?expires=90    seconds a code works for
 *   ?panel=0       hides the panel, for screenshots
 */

const query = new URLSearchParams(location.search)
const reason = t
  .enum(SHELL_REASONS)
  .catch("welcome")
  .parse(query.get("reason") ?? "welcome")
const Outcome = t
  .enum(["approve", "none", ...SIGN_IN_FAILURES] as const)
  .catch("approve")
const outcome = Outcome.parse(query.get("outcome") ?? "approve")
const codeSeconds = Number(query.get("expires") ?? 90) || 90

const SAMPLE_SERVERS: SavedServer[] = [
  {
    id: "home",
    url: "https://watch.example.com",
    username: "zeku",
    displayName: "Zeku",
    avatar: "/api/v1/users/avatar/1",
  },
  {
    id: "anna",
    url: "http://192.168.1.20:8420",
    username: "anna",
    displayName: null,
    avatar: null,
  },
]

let servers: SavedServer[] =
  reason === "welcome" || query.get("saved") === "0" ? [] : [...SAMPLE_SERVERS]
let current: string | null = servers[0]?.id ?? null

const NEARBY: DiscoveredServer[] = [
  { name: "Living room", url: "http://192.168.1.20:8420" },
  { name: "Basement", url: "http://192.168.1.42:8420" },
]

const SETTINGS: DesktopSettings = {
  hardwareDecoding: true,
  audioDevice: "auto",
  audioChannels: "auto",
  passthrough: [],
  exclusiveAudio: false,
  scale: 1,
  startFullscreen: false,
}

const Request = t.object({
  id: t.number(),
  method: t.string(),
  params: t.unknown().optional(),
})

let transport: BridgeTransport | null = null

function deliver(message: string) {
  // As the shell does: never in the same task as the request.
  setTimeout(() => transport?.receive?.(message), 0)
}

function answer<Name extends MethodName>(
  id: number,
  _method: Name,
  result: MethodResult<Name>,
) {
  deliver(JSON.stringify({ id, result }))
}

function refuse(id: number, message: string) {
  deliver(JSON.stringify({ id, error: { code: "failed", message } }))
}

function emit<Name extends EventName>(event: Name, data: EventData<Name>) {
  deliver(JSON.stringify({ event, data }))
}

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms))

/** What the shell would do now, said in a strip at the bottom. */
function pretend(text: string) {
  const strip = document.createElement("div")
  strip.textContent = `Mock shell: ${text}`
  strip.style.cssText =
    "position:fixed;left:50%;bottom:72px;transform:translateX(-50%);z-index:100;padding:8px 14px;border-radius:8px;background:#111;color:#fff;font:13px system-ui;box-shadow:0 8px 24px rgb(0 0 0/.4)"
  document.body.append(strip)
  setTimeout(() => strip.remove(), 4000)
}

/** The sign-in that runs, and its timers. */
type Running = { url: string; timers: number[] }
let running: Running | null = null

function endSignIn() {
  for (const timer of running?.timers ?? []) clearTimeout(timer)
  running = null
}

function finish(how: SignInFailure | "approve") {
  const signIn = running
  if (!signIn) return
  endSignIn()
  if (how !== "approve") {
    emit("signIn.result", {
      status: "failed",
      reason: how,
      message:
        how === "failed" ? "The server refused the sign-in request." : null,
    })
    return
  }
  const server: SavedServer = {
    id: crypto.randomUUID(),
    url: signIn.url,
    username: "zeku",
    displayName: "Zeku",
    avatar: null,
  }
  servers = [...servers.filter((saved) => saved.url !== server.url), server]
  current = server.id
  emit("signIn.result", { status: "approved", server })
  setTimeout(() => pretend(`opens ${server.url}`), 1500)
}

function probe(address: string): ServerProbe {
  const typed = address.trim()
  if (/\s/.test(typed) || typed === "") return { ok: false, reason: "invalid" }
  const schemed = /^[a-z]+:\/\//i.test(typed)
  let url: URL
  try {
    url = new URL(schemed ? typed : `https://${typed}`)
  } catch {
    return { ok: false, reason: "invalid" }
  }
  const host = url.hostname
  if (!host.includes(".") && host !== "localhost") {
    return { ok: false, reason: "invalid" }
  }
  if (/offline|down/.test(host) || host.startsWith("10.")) {
    return { ok: false, reason: "unreachable" }
  }
  if (/router|notmatinee/.test(host))
    return { ok: false, reason: "not-matinee" }
  // Without a scheme, an IP or a port answers on http, as at home.
  if (!schemed && (/^[\d.]+$/.test(host) || url.port)) url.protocol = "http:"
  return { ok: true, url: url.origin }
}

function userCode(): string {
  const letters = "BCDFGHJKLMNPQRSTVWXZ"
  let code = ""
  for (let i = 0; i < 8; i++) {
    code += letters[Math.floor(Math.random() * letters.length)]
    if (i === 3) code += "-"
  }
  return code
}

async function startSignIn(id: number, url: string, method: SignInMethod) {
  endSignIn()
  await wait(600)
  if (url.includes("flaky")) {
    refuse(id, "The server didn't answer the sign-in request.")
    return
  }
  const signIn: Running = { url, timers: [] }
  running = signIn
  if (outcome !== "none") {
    const after = outcome === "expired" && method === "code" ? codeSeconds : 6
    signIn.timers.push(
      window.setTimeout(() => finish(outcome), after * 1000 + 600),
    )
  }
  if (method === "browser") {
    answer(id, "signIn.start", {
      method: "browser",
      url: `${url}/authorize?client=matinee-desktop&state=mock`,
    })
    return
  }
  const code = userCode()
  signIn.timers.push(
    window.setTimeout(() => finish("expired"), codeSeconds * 1000 + 600),
  )
  answer(id, "signIn.start", {
    method: "code",
    userCode: code,
    verificationUri: `${url}/link`,
    verificationUriComplete: `${url}/link?code=${code}`,
    expiresIn: codeSeconds,
  })
}

async function handle({ id, method, params: raw }: t.infer<typeof Request>) {
  if (!(method in methods)) {
    refuse(id, `No method ${method}.`)
    return
  }
  switch (method) {
    case "app.info":
      answer(id, method, {
        version: "0.0.0-dev",
        protocol: BRIDGE_PROTOCOL,
        platform: "linux",
        mpv: "v0.41.0",
        qt: "6.10.0",
        chromium: "130.0.0",
        features: [],
      })
      return
    case "app.quit":
      pretend("quits")
      answer(id, method, undefined)
      return
    case "settings.get":
    case "settings.set":
      answer(id, method, SETTINGS)
      return
    case "settings.audioDevices":
      answer(id, method, [])
      return
    case "shell.state":
      await wait(150)
      answer(id, method, {
        reason,
        server:
          reason === "signed-out" || reason === "unreachable"
            ? (servers[0] ?? SAMPLE_SERVERS[0] ?? null)
            : null,
      })
      return
    case "servers.list":
      answer(id, method, { servers, current })
      return
    case "servers.probe": {
      const params = methods[method].params.safeParse(raw)
      await wait(800)
      if (!params.success) {
        refuse(id, "Bad parameters.")
      } else if (params.data.address.includes("boom")) {
        refuse(id, "The probe crashed.")
      } else {
        answer(id, method, probe(params.data.address))
      }
      return
    }
    case "servers.discover":
      await wait(3000)
      answer(id, method, query.get("lan") === "0" ? [] : NEARBY)
      return
    case "servers.open": {
      const params = methods[method].params.safeParse(raw)
      await wait(500)
      const server = servers.find(
        (saved) => params.success && saved.id === params.data.id,
      )
      if (!server) {
        refuse(id, "No such server.")
        return
      }
      current = server.id
      answer(id, method, undefined)
      pretend(`opens ${server.url}`)
      return
    }
    case "servers.remove": {
      const params = methods[method].params.safeParse(raw)
      await wait(700)
      if (!params.success) {
        refuse(id, "Bad parameters.")
        return
      }
      servers = servers.filter((saved) => saved.id !== params.data.id)
      if (current === params.data.id) current = servers[0]?.id ?? null
      answer(id, method, undefined)
      return
    }
    case "signIn.start": {
      const params = methods[method].params.safeParse(raw)
      if (!params.success) {
        refuse(id, "Bad parameters.")
        return
      }
      await startSignIn(id, params.data.url, params.data.method)
      return
    }
    case "signIn.cancel":
      endSignIn()
      answer(id, method, undefined)
      return
    default:
      refuse(id, `${method} is for the server's web app.`)
  }
}

/** Buttons for what the shell would decide, in the top corner. */
function panel() {
  if (query.get("panel") === "0") return
  const box = document.createElement("div")
  box.style.cssText =
    "position:fixed;top:8px;right:8px;z-index:100;display:flex;flex-wrap:wrap;gap:4px;max-width:420px;justify-content:flex-end;padding:6px;border-radius:8px;background:rgb(0 0 0/.75);font:12px system-ui;color:#fff"
  const button = (label: string, onClick: () => void) => {
    const element = document.createElement("button")
    element.type = "button"
    element.textContent = label
    element.tabIndex = -1
    element.style.cssText =
      "padding:2px 6px;border-radius:4px;background:#333;color:#fff;border:1px solid #555;cursor:pointer"
    element.addEventListener("click", onClick)
    box.append(element)
  }
  for (const each of SHELL_REASONS) {
    button(each === reason ? `[reason: ${each}]` : `reason: ${each}`, () => {
      const next = new URLSearchParams(location.search)
      next.set("reason", each)
      location.search = next.toString()
    })
  }
  button("sign-in: approve", () => finish("approve"))
  for (const failure of SIGN_IN_FAILURES) {
    button(`sign-in: ${failure}`, () => finish(failure))
  }
  document.body.append(box)
}

/** Puts the pretend shell where the real one would be. */
export function installMockShell(): void {
  const mock: BridgeTransport = {
    protocol: BRIDGE_PROTOCOL,
    receive: null,
    send: (message) => {
      const request = Request.safeParse(JSON.parse(message))
      if (request.success) void handle(request.data)
    },
  }
  transport = mock
  window.matineeDesktop = mock
  if (document.body) panel()
  else document.addEventListener("DOMContentLoaded", panel)
}
