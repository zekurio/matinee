import {
  type AppInfo,
  connectDesktop,
  type DesktopBridge,
  type DiscoveredServer,
  type SavedServer,
  type ServerList,
  type ServerProbeFailure,
  type ShellReason,
  type SignInFailure,
  type SignInMethod,
  type SignInResult,
} from "@matinee/desktop-bridge"
import { create } from "zustand"

/*
 * Where the pages are, and what they know from the shell. One store for
 * the one page: the screens are steps of one flow, and every step talks
 * to the shell through the actions here.
 */

/** The screens a sign-in starts from and goes back to. */
export type Home =
  | { name: "servers" }
  | { name: "signed-out"; server: SavedServer }
  | { name: "unreachable"; server: SavedServer }

export type Screen =
  | { name: "starting" }
  /** Not in the desktop app, or in one too old to talk to. */
  | { name: "no-shell" }
  /** The shell didn't say why it shows these pages. */
  | { name: "failed" }
  | Home
  | { name: "sign-in"; url: string; back: Home }

export type SignIn =
  | { phase: "choose" }
  | { phase: "starting"; method: SignInMethod }
  /** The browser opened `url`, or should have. */
  | { phase: "browser"; url: string }
  | {
      phase: "code"
      userCode: string
      verificationUri: string
      verificationUriComplete: string
      /** When the code stops working, in epoch milliseconds. */
      expiresAt: number
      /** How long it worked for from the start, in milliseconds. */
      lifetime: number
    }
  | { phase: "approved"; server: SavedServer }
  | {
      phase: "failed"
      method: SignInMethod
      /** `start`: the shell couldn't start it. */
      reason: SignInFailure | "start"
      message: string | null
    }

/** Why the address someone typed didn't lead to a server. */
export type ProbeError = {
  /** `empty`: nothing typed. `error`: the shell couldn't check. */
  reason: ServerProbeFailure | "empty" | "error"
  address: string
}

type AppState = {
  screen: Screen
  reason: ShellReason
  info: AppInfo | null
  saved: ServerList | null
  /** The local network: being searched, and what answered last time. */
  searching: boolean
  searched: boolean
  found: DiscoveredServer[]
  probing: boolean
  probeError: ProbeError | null
  signIn: SignIn
  /** A saved server on its way to open, and the one that didn't. */
  opening: string | null
  openFailed: string | null

  start: () => Promise<void>
  showServers: () => void
  search: () => Promise<void>
  connect: (address: string) => Promise<void>
  clearProbeError: () => void
  /** Shows the ways to sign in to the server at `url`. */
  signInTo: (url: string) => void
  startSignIn: (method: SignInMethod) => Promise<void>
  /** Ends a sign-in that runs and goes back to where it started. */
  leaveSignIn: () => void
  open: (id: string) => Promise<void>
  /** Signs out of a saved server and forgets it. Rejects when that fails. */
  remove: (id: string) => Promise<void>
  quit: () => void
}

function bridge(): DesktopBridge {
  const connected = connectDesktop()
  if (!connected) throw new Error("These pages run only in the desktop app.")
  return connected
}

/** How long a server that opened may take to replace this page. */
const OPEN_TIMEOUT_MS = 15_000

/**
 * Counts sign-ins started here, so the answer to one that was left or
 * replaced doesn't land on the one after it.
 */
let attempt = 0
let listening = false

function screenFor(
  reason: ShellReason,
  server: SavedServer | null,
): Home | null {
  if (reason === "signed-out" && server) return { name: "signed-out", server }
  if (reason === "unreachable" && server) {
    return { name: "unreachable", server }
  }
  return null
}

export const useApp = create<AppState>()((set, get) => {
  const finish = (result: SignInResult) => {
    const { signIn } = get()
    // Only a sign-in that is waiting can end: the shell may still answer
    // for one that was left, or that the one starting now replaces.
    if (signIn.phase !== "browser" && signIn.phase !== "code") return
    if (result.status === "approved") {
      set({ signIn: { phase: "approved", server: result.server } })
      return
    }
    set({
      signIn: {
        phase: "failed",
        method: signIn.phase,
        reason: result.reason,
        message: result.message,
      },
    })
  }

  return {
    screen: { name: "starting" },
    reason: "welcome",
    info: null,
    saved: null,
    searching: false,
    searched: false,
    found: [],
    probing: false,
    probeError: null,
    signIn: { phase: "choose" },
    opening: null,
    openFailed: null,

    start: async () => {
      const shell = connectDesktop()
      if (!shell) {
        set({ screen: { name: "no-shell" } })
        return
      }
      set({ screen: { name: "starting" } })
      if (!listening) {
        listening = true
        shell.on("signIn.result", finish)
      }
      shell.request("app.info").then(
        (info) => set({ info }),
        // Without it the corner shows no version; nothing else needs it.
        () => {},
      )
      try {
        const [state, saved] = await Promise.all([
          shell.request("shell.state"),
          shell.request("servers.list"),
        ])
        set({ reason: state.reason, saved })
        const home = screenFor(state.reason, state.server)
        if (home) set({ screen: home })
        else get().showServers()
      } catch {
        set({ screen: { name: "failed" } })
      }
    },

    showServers: () => {
      set({ screen: { name: "servers" }, openFailed: null })
      if (!get().searched) void get().search()
    },

    search: async () => {
      if (get().searching) return
      set({ searching: true })
      let found: DiscoveredServer[] = []
      try {
        found = await bridge().request("servers.discover")
      } catch {
        // A search that failed found nothing; the list says so quietly.
      }
      set({ searching: false, searched: true, found })
    },

    connect: async (typed) => {
      const address = typed.trim()
      if (!address) {
        set({ probeError: { reason: "empty", address } })
        return
      }
      set({ probing: true, probeError: null })
      try {
        const probe = await bridge().request("servers.probe", { address })
        set({ probing: false })
        if (probe.ok) get().signInTo(probe.url)
        else set({ probeError: { reason: probe.reason, address } })
      } catch {
        set({ probing: false, probeError: { reason: "error", address } })
      }
    },

    clearProbeError: () => set({ probeError: null }),

    signInTo: (url) => {
      const { screen } = get()
      const back: Home =
        screen.name === "signed-out" || screen.name === "unreachable"
          ? screen
          : { name: "servers" }
      set({
        screen: { name: "sign-in", url, back },
        signIn: { phase: "choose" },
      })
    },

    startSignIn: async (method) => {
      const { screen } = get()
      if (screen.name !== "sign-in") return
      const mine = ++attempt
      set({ signIn: { phase: "starting", method } })
      try {
        const started = await bridge().request("signIn.start", {
          url: screen.url,
          method,
        })
        if (mine !== attempt) return
        set({
          signIn:
            started.method === "browser"
              ? { phase: "browser", url: started.url }
              : {
                  phase: "code",
                  userCode: started.userCode,
                  verificationUri: started.verificationUri,
                  verificationUriComplete: started.verificationUriComplete,
                  expiresAt: Date.now() + started.expiresIn * 1000,
                  lifetime: started.expiresIn * 1000,
                },
        })
      } catch {
        if (mine !== attempt) return
        set({
          signIn: { phase: "failed", method, reason: "start", message: null },
        })
      }
    },

    leaveSignIn: () => {
      const { screen, signIn } = get()
      if (screen.name !== "sign-in") return
      attempt++
      if (
        signIn.phase === "starting" ||
        signIn.phase === "browser" ||
        signIn.phase === "code"
      ) {
        bridge()
          .request("signIn.cancel")
          .catch(() => {})
      }
      set({ signIn: { phase: "choose" } })
      if (screen.back.name === "servers") get().showServers()
      else set({ screen: screen.back })
    },

    open: async (id) => {
      set({ opening: id, openFailed: null })
      try {
        await bridge().request("servers.open", { id })
        // The shell goes to the server now, and this page with it. Should
        // it stay, the button comes back.
        setTimeout(() => {
          if (get().opening === id) set({ opening: null })
        }, OPEN_TIMEOUT_MS)
      } catch {
        set({ opening: null, openFailed: id })
      }
    },

    remove: async (id) => {
      const shell = bridge()
      await shell.request("servers.remove", { id })
      const saved = await shell.request("servers.list").catch(() => null)
      set((state) => ({
        saved: saved ?? {
          current:
            state.saved?.current === id ? null : (state.saved?.current ?? null),
          servers: state.saved?.servers.filter((s) => s.id !== id) ?? [],
        },
      }))
    },

    quit: () => {
      bridge()
        .request("app.quit")
        .catch(() => {})
    },
  }
})
