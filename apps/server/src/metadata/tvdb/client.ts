import { t } from "@matinee/contracts/schema"

import { env } from "../../env"
import { limiter } from "../../media/process"
import { fetchJson } from "../http"
import { ProviderError } from "../types"
import { apiUrl } from "../url"

// TVDB's public endpoints, the same for every install.
const API = "https://api4.thetvdb.com/v4"
// Tokens last a month. Renew well before that.
const TOKEN_TTL_MS = 25 * 24 * 60 * 60 * 1000
const limit = limiter(4)

export type Envelope<T> = { data: T; links?: { next?: string | null } }

// Every TVDB v4 reply wraps its record in `data`. The record is the
// endpoint's to check; the envelope and the paging link are checked here.
const envelope = t.looseObject({
  data: t.unknown(),
  links: t
    .looseObject({ next: t.string().nullable().optional() })
    .nullable()
    .optional(),
})
const loginReply = t.looseObject({
  data: t.looseObject({ token: t.string() }),
})

let token: { value: string; expires: number } | null = null
let loggingIn: Promise<string> | null = null

async function login(): Promise<string> {
  if (!env.MATINEE_TVDB_API_KEY)
    throw new Error("MATINEE_TVDB_API_KEY isn't set")
  const body = {
    apikey: env.MATINEE_TVDB_API_KEY,
    pin: env.MATINEE_TVDB_PIN || undefined,
  }
  const data = await fetchJson("TheTVDB", `${API}/login`, loginReply, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
  token = { value: data.data.token, expires: Date.now() + TOKEN_TTL_MS }
  return token.value
}

function currentToken(): Promise<string> {
  if (token && token.expires > Date.now()) return Promise.resolve(token.value)
  loggingIn ??= login().finally(() => (loggingIn = null))
  return loggingIn
}

export async function request<T>(
  path: string,
  params: Record<string, string | number | undefined> = {},
): Promise<Envelope<T>> {
  const url = apiUrl(API, path, params)
  const send = async (): Promise<Envelope<T>> => {
    const reply = await fetchJson("TheTVDB", url, envelope, {
      headers: { authorization: `Bearer ${await currentToken()}` },
    })
    return {
      // SAFETY: The envelope is checked. Callers name the record TVDB
      // documents for the endpoint they call; its fields aren't
      // schema-checked yet.
      data: reply.data as T,
      links: reply.links ?? undefined,
    }
  }
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
