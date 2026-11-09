import { env } from "../../env"
import { limiter } from "../../media/process"
import { fetchJson } from "../http"
import { apiUrl } from "../url"

// TMDB's public endpoints, the same for every install.
const API = "https://api.themoviedb.org/3"
const IMAGES = "https://image.tmdb.org/t/p/"
// TMDB allows about 50 requests a second; stay well below.
const limit = limiter(6)

function apiKey(): string {
  if (!env.MATINEE_TMDB_API_KEY)
    throw new Error("MATINEE_TMDB_API_KEY isn't set")
  return env.MATINEE_TMDB_API_KEY
}

export function request<T>(
  path: string,
  params: Record<string, string | number | undefined>,
): Promise<T> {
  const url = apiUrl(API, path, params)
  const key = apiKey()
  const headers: Record<string, string> = {}
  // Read access tokens are JWTs; v3 keys are 32 hex characters.
  if (key.startsWith("eyJ")) headers.authorization = `Bearer ${key}`
  else url.searchParams.set("api_key", key)
  return limit(() => fetchJson<T>("TMDB", url, { headers }))
}

export function image(
  path: string | null | undefined,
  size: string,
): string | null {
  return path ? `${IMAGES}${size}${path}` : null
}
