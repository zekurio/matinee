import type { YouTubeTrailer } from "@matinee/db"

// Enough for a trailer and a teaser in a few languages.
const MAX_TRAILERS = 10
const VIDEO_ID = /^[\w-]{11}$/
const HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
  "www.youtube-nocookie.com",
])

export function isYouTubeId(key: string): boolean {
  return VIDEO_ID.test(key)
}

/** The video id in a YouTube link, or null for any other link. */
export function youTubeId(link: string): string | null {
  const url = URL.parse(link)
  if (!url || !HOSTS.has(url.hostname)) return null
  const id =
    url.hostname === "youtu.be"
      ? url.pathname.slice(1)
      : url.pathname === "/watch"
        ? url.searchParams.get("v")
        : /^\/(?:embed|shorts|v)\/([^/]+)/.exec(url.pathname)?.[1]
  return id && isYouTubeId(id) ? id : null
}

export function youTubeUrl(key: string): string {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(key)}`
}

/**
 * Trailers in the library's language first, then English, then those
 * without a language, then the rest. Otherwise in the order given, each
 * video once.
 */
export function rankTrailers(
  trailers: YouTubeTrailer[],
  language: string,
): YouTubeTrailer[] {
  const wanted = language.split("-")[0]?.toLowerCase()
  const rank = ({ language: tag }: YouTubeTrailer) => {
    const base = tag?.split("-")[0]
    if (base === wanted) return 0
    if (base === "en") return 1
    return base === undefined ? 2 : 3
  }
  return trailers
    .filter((t, i) => trailers.findIndex((o) => o.key === t.key) === i)
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, MAX_TRAILERS)
}
