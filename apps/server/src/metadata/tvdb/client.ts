import { limiter } from "../../media/process"
import { tvdbKey, tvdbPin, tvdbPlugin } from "../builtins"
import { fetchJson } from "../http"
import { ProviderError } from "../types"
import { apiUrl } from "../url"

// TVDB's public endpoints, the same for every install.
const API = "https://api4.thetvdb.com/v4"
// Tokens last a month. Renew well before that.
const TOKEN_TTL_MS = 25 * 24 * 60 * 60 * 1000
const limit = limiter(4)

export type Envelope<T> = { data: T; links?: { next?: string | null } }

let token: { value: string; expires: number } | null = null
let loggingIn: Promise<string> | null = null
let configVersion = 0
tvdbPlugin.onChange(() => {
  configVersion++
  token = null
  loggingIn = null
})

async function login(): Promise<string> {
  const version = configVersion
  const key = tvdbKey()
  if (!key)
    throw new Error("TheTVDB has no API key. Add one under Settings → Plugins.")
  const body = {
    apikey: key,
    pin: tvdbPin() || undefined,
  }
  const data = await fetchJson<Envelope<{ token: string }>>(
    "TheTVDB",
    `${API}/login`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  )
  if (version !== configVersion) return currentToken()
  token = { value: data.data.token, expires: Date.now() + TOKEN_TTL_MS }
  return token.value
}

function currentToken(): Promise<string> {
  if (token && token.expires > Date.now()) return Promise.resolve(token.value)
  if (!loggingIn) {
    const attempt = login().finally(() => {
      if (loggingIn === attempt) loggingIn = null
    })
    loggingIn = attempt
  }
  return loggingIn
}

export async function request<T>(
  path: string,
  params: Record<string, string | number | undefined> = {},
): Promise<Envelope<T>> {
  const url = apiUrl(API, path, params)
  const send = async () =>
    fetchJson<Envelope<T>>("TheTVDB", url, {
      headers: { authorization: `Bearer ${await currentToken()}` },
    })
  return limit(async () => {
    try {
      return await send()
    } catch (error) {
      // A revoked or expired token: log in again once.
      if (!(error instanceof ProviderError) || error.status !== 401) throw error
      token = null
      return send()
    }
  })
}
