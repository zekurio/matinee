import { createMatineeClient, type MatineeClient } from "@matinee/client"
import type { AuthConfig, User } from "@matinee/contracts"

import { describeFailure, isServerError, isSignedOut } from "@/api/errors"
import { tr } from "@/i18n"
import {
  isList,
  isRecord,
  type Json,
  type JsonObject,
  textAt,
} from "@/lib/decode"
import { Observable } from "@/lib/observable"
import { readStored, writeStored } from "@/lib/storage"
import { tvModel, tvName } from "@/platform/tizen"

/*
 * Which server the TV talks to and who is signed in there. The app keeps
 * several servers, each with its own sign-in, as the other apps do. A TV
 * has no downloads, so no offline mode: a server that doesn't answer shows
 * as unreachable, whatever is saved.
 */

const SERVERS_KEY = "matinee.tv.servers"
/** The cookie the server reads a session from when a request has no bearer token. */
const SESSION_COOKIE = "matinee_session"
/**
 * What the app calls itself in the server's sessions list, watching now,
 * and client stats: a product name, the same in every language.
 */
const CLIENT_NAME = "Matinee Samsung TV"

/** A server the TV knows, with its sign-in if it has one. */
export type SavedServer = {
  /** `https://media.example.com`: how the app reaches it, and tells it apart. */
  origin: string
  /** The session's token. Null once signed out, or before signing in. */
  token: string | null
  /** Who the token signed in, to name the server's sign-in in the list. */
  userName: string | null
}

export type AuthState =
  | { kind: "noServer"; canCancel: boolean }
  | { kind: "connecting"; server: string }
  | { kind: "unreachable"; server: string; offline: boolean; retrying: boolean }
  | { kind: "signedOut"; server: string; config: AuthConfig; adding: boolean }
  | { kind: "signedIn"; server: string; user: User }

/** `media.example.com` for `https://media.example.com`, as lists show a server. */
export function hostOf(origin: string): string {
  return origin.replace(/^[a-z]+:\/\//, "")
}

/** The name a person goes by: their display name, else their username. */
export function nameOf(user: Pick<User, "username" | "displayName">): string {
  return user.displayName || user.username
}

/**
 * The origins to try for what the person typed, like `media.example.com`
 * or `192.168.1.5:8420`: as typed when it names a scheme, else https and
 * then http.
 */
export function serverCandidates(input: string): string[] {
  const text = input.trim().replace(/\/+$/, "")
  if (text === "") return []
  const typed = /^[a-z][a-z0-9+.-]*:\/\//i.test(text)
  const candidates = typed ? [text] : [`https://${text}`, `http://${text}`]
  return candidates.flatMap((candidate) => {
    try {
      const url = new URL(candidate)
      return url.protocol === "http:" || url.protocol === "https:"
        ? [url.origin]
        : []
    } catch {
      return []
    }
  })
}

/** What the TV has stored: the servers it knows, and the one in use. */
type StoredServers = { active: string | null; servers: SavedServer[] }

function readServers(): StoredServers {
  const stored = readStored(SERVERS_KEY)
  const list = isRecord(stored) && isList(stored.servers) ? stored.servers : []
  const servers = list.flatMap((entry: Json): SavedServer[] => {
    const origin = textAt(entry, "origin")
    if (!origin) return []
    return [
      {
        origin,
        token: textAt(entry, "token") ?? null,
        userName: textAt(entry, "userName") ?? null,
      },
    ]
  })
  const active = textAt(stored, "active")
  return {
    servers,
    active: servers.some((server) => server.origin === active)
      ? (active ?? null)
      : null,
  }
}

/** What the TV says it is when it signs in: the person's name for it, else its model. */
function deviceName(): string {
  return (tvName() ?? tvModel ?? "Samsung TV").slice(0, 64)
}

export class Session extends Observable {
  state: AuthState = { kind: "noServer", canCancel: false }
  servers: SavedServer[]
  /** The origin of the server in use. */
  private origin: string | null
  /** A server being added, before its sign-in is done and it's saved. */
  private candidate: string | null = null
  /** Counts the checks of the saved server. Only the newest sets the state. */
  private check = 0
  private clients = new Map<string, MatineeClient>()

  constructor() {
    super()
    const stored = readServers()
    this.servers = stored.servers
    this.origin = stored.active
    // A network that comes back tries the server again by itself.
    window.addEventListener("online", () => {
      if (this.state.kind === "unreachable" && !this.state.retrying)
        this.start()
    })
  }

  /** The server in use, as its address. */
  get server(): string | null {
    return this.origin
  }

  /** The token of the server in use. */
  get token(): string | null {
    return this.saved(this.origin)?.token ?? null
  }

  /** The API of the server in use. */
  get api(): MatineeClient {
    if (!this.origin) throw new Error("not connected")
    return this.clientFor(this.origin)
  }

  /** The API to sign in at: a server being added, or the one in use. */
  get signInApi(): MatineeClient {
    return this.clientFor(this.candidate ?? this.origin ?? "")
  }

  /**
   * The page runs on the server's own origin, as in a browser during
   * development. Pictures and video then load as they do in the web app,
   * with the session in a cookie.
   */
  get sameOrigin(): boolean {
    return this.origin === window.location.origin
  }

  /** A path on the server as an address. */
  url(path: string): string {
    return `${this.origin ?? ""}${path}`
  }

  /** What this TV calls itself to the server. */
  get device() {
    return { name: deviceName(), platform: "tizen" as const }
  }

  private saved(origin: string | null): SavedServer | undefined {
    return this.servers.find((server) => server.origin === origin)
  }

  private clientFor(origin: string): MatineeClient {
    const known = this.clients.get(origin)
    if (known) return known
    const client = createMatineeClient({
      baseUrl: origin,
      token: () => this.saved(origin)?.token,
    })
    this.clients.set(origin, client)
    return client
  }

  private persist() {
    const servers: JsonObject[] = this.servers.map((server) => ({
      origin: server.origin,
      token: server.token,
      userName: server.userName,
    }))
    writeStored(SERVERS_KEY, { active: this.origin, servers })
    this.syncCookie()
  }

  /** On the server's own origin, the session goes in its cookie too, for pictures and video. */
  private syncCookie() {
    if (!this.sameOrigin) return
    const token = this.token
    document.cookie = token
      ? `${SESSION_COOKIE}=${token}; path=/; SameSite=Lax`
      : `${SESSION_COOKIE}=; path=/; max-age=0`
  }

  private set(state: AuthState) {
    this.state = state
    this.changed()
  }

  /** Checks the saved server and session again. */
  start() {
    const mine = ++this.check
    this.candidate = null
    const origin = this.origin
    if (!origin) {
      this.set({ kind: "noServer", canCancel: false })
      return
    }
    this.syncCookie()
    // Trying again stays on the unreachable screen, with its button busy.
    this.set(
      this.state.kind === "unreachable"
        ? { ...this.state, retrying: true }
        : { kind: "connecting", server: origin },
    )
    void this.verify(origin, mine)
  }

  private async verify(origin: string, mine: number) {
    const api = this.clientFor(origin)
    try {
      const sent = this.saved(origin)?.token
      const user = sent ? (await api.auth.session()).user : null
      if (mine !== this.check) return
      if (user) {
        this.keepUser(origin, user)
        this.set({ kind: "signedIn", server: origin, user })
        this.identify(api)
        return
      }
      // Only a token the server turned down goes.
      if (sent) this.keepToken(origin, null, null)
      const config = await api.auth.config()
      if (mine !== this.check) return
      this.set({ kind: "signedOut", server: origin, config, adding: false })
    } catch (cause) {
      if (mine !== this.check) return
      if (isSignedOut(cause)) {
        this.keepToken(origin, null, null)
        this.start()
        return
      }
      this.set({
        kind: "unreachable",
        server: origin,
        offline: navigator.onLine === false,
        retrying: false,
      })
    }
  }

  private keepToken(
    origin: string,
    token: string | null,
    userName: string | null,
  ) {
    this.servers = this.servers.map((server) =>
      server.origin === origin ? { ...server, token, userName } : server,
    )
    this.persist()
  }

  private keepUser(origin: string, user: User) {
    const name = nameOf(user)
    if (this.saved(origin)?.userName === name) return
    this.servers = this.servers.map((server) =>
      server.origin === origin ? { ...server, userName: name } : server,
    )
    this.persist()
  }

  /**
   * Connects to the server the person typed. A server already saved is
   * switched to. Returns the error to show, or null once connected.
   */
  async connect(input: string): Promise<string | null> {
    const candidates = serverCandidates(input)
    if (candidates.length === 0) return tr("connectEmpty")
    const known = candidates.find((origin) => this.saved(origin))
    if (known) {
      this.switchTo(known)
      return null
    }
    let failure: string | null = null
    for (const origin of candidates) {
      try {
        const config = await this.clientFor(origin).auth.config()
        // Gone back, or to another server, while it answered.
        if (this.state.kind !== "noServer") return null
        if (this.origin === null) {
          // The first server is saved at once, so the app comes back to its sign-in.
          this.servers = [
            ...this.servers,
            { origin, token: null, userName: null },
          ]
          this.origin = origin
          this.persist()
          this.set({ kind: "signedOut", server: origin, config, adding: false })
        } else {
          this.candidate = origin
          this.set({ kind: "signedOut", server: origin, config, adding: true })
        }
        return null
      } catch (cause) {
        failure = isServerError(cause)
          ? tr("connectNotMatinee", hostOf(origin))
          : tr("connectFailed", hostOf(origin))
      }
    }
    return failure
  }

  /** The device grant ended with a session: signed in, at the server being added or the one in use. */
  signedIn(token: string, user: User) {
    const origin = this.candidate ?? this.origin
    if (!origin) return
    this.check += 1
    if (!this.saved(origin)) {
      this.servers = [...this.servers, { origin, token: null, userName: null }]
    }
    this.candidate = null
    this.origin = origin
    this.keepToken(origin, token, nameOf(user))
    this.set({ kind: "signedIn", server: origin, user })
    this.identify(this.clientFor(origin))
  }

  /**
   * Tell the server what the app calls itself for the session, as every
   * client does when it starts. It's only ever shown, so a failure is let go.
   */
  private identify(api: MatineeClient) {
    api.account.sessions.identify({ name: CLIENT_NAME }).catch(() => {})
  }

  /** The account changed something of its own, like its playback preferences. */
  updateUser(user: User) {
    if (this.state.kind !== "signedIn") return
    this.set({ ...this.state, user })
  }

  /** Pick a server to add. The one in use stays as it is meanwhile. */
  addServer() {
    this.check += 1
    this.candidate = null
    this.set({ kind: "noServer", canCancel: this.origin !== null })
  }

  /** Back from adding a server to the one in use. */
  cancelAdd() {
    this.start()
  }

  switchTo(origin: string) {
    if (!this.saved(origin)) return
    this.origin = origin
    this.persist()
    this.start()
  }

  /** Signs out there and forgets the server. Another saved one takes its place. */
  removeServer(origin: string) {
    const removed = this.saved(origin)
    if (!removed) return
    if (removed.token) {
      // Its session ends on the server too, if the server still answers.
      // A client of its own, since the saved token is about to go.
      void createMatineeClient({ baseUrl: origin, token: () => removed.token })
        .auth.signOut()
        .catch(() => {})
    }
    this.servers = this.servers.filter((server) => server.origin !== origin)
    this.clients.delete(origin)
    if (this.origin === origin) {
      this.origin = this.servers[0]?.origin ?? null
      this.persist()
      this.start()
    } else {
      this.persist()
      this.changed()
    }
  }

  /** Signs out of the server in use, which stays saved. */
  signOut() {
    const origin = this.origin
    if (!origin) return
    void this.clientFor(origin)
      .auth.signOut()
      .catch(() => {})
      .then(() => {
        this.keepToken(origin, null, null)
        this.start()
      })
  }

  /** The server said the session is gone. */
  lost() {
    if (this.state.kind === "signedIn") this.start()
  }

  /** Why a call failed, for the person; a session that ended signs out. */
  describe(cause: unknown): string {
    if (isSignedOut(cause)) this.lost()
    return describeFailure(cause)
  }
}

/** The one session the app has. */
export const session = new Session()
