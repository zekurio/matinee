import { t } from "@matinee/contracts/schema"

import { env } from "../env"
import { defineBuiltinPlugin } from "../plugins"

export const tmdbPlugin = defineBuiltinPlugin({
  id: "tmdb",
  name: "TMDB",
  description: "Movie and TV metadata from The Movie Database.",
  homepage: "https://www.themoviedb.org",
  config: [
    {
      key: "apiKey",
      type: "secret",
      label: "API key or read access token",
      description:
        "Get a free API key or API Read Access Token from your TMDB account's API settings.",
      required: true,
    },
  ],
  environment: {
    apiKey: {
      variable: "MATINEE_TMDB_API_KEY",
      value: env.MATINEE_TMDB_API_KEY,
    },
  },
  metadata: [
    {
      id: "tmdb",
      name: "TMDB",
      description: "Movies and shows from The Movie Database.",
      kinds: ["movie", "show"],
      episodes: true,
    },
  ],
})

export const tvdbPlugin = defineBuiltinPlugin({
  id: "tvdb",
  name: "TheTVDB",
  description:
    "TV and movie metadata from TheTVDB, with Sonarr's season order.",
  homepage: "https://thetvdb.com",
  config: [
    {
      key: "apiKey",
      type: "secret",
      label: "API key",
      description:
        "Get an API key from your TheTVDB account's API access settings.",
      required: true,
    },
    {
      key: "pin",
      type: "secret",
      required: false,
      label: "Subscriber PIN",
      description:
        "For subscriber-supported keys, enter the PIN from your TheTVDB subscription. Otherwise leave this empty.",
    },
  ],
  environment: {
    apiKey: {
      variable: "MATINEE_TVDB_API_KEY",
      value: env.MATINEE_TVDB_API_KEY,
    },
    pin: { variable: "MATINEE_TVDB_PIN", value: env.MATINEE_TVDB_PIN },
  },
  metadata: [
    {
      id: "tvdb",
      name: "TheTVDB",
      description: "Shows in Sonarr's season order, plus movies.",
      kinds: ["movie", "show"],
      episodes: true,
    },
  ],
})

export function tmdbKey(): string {
  return t.string().catch("").parse(tmdbPlugin.config().apiKey)
}

export function tvdbKey(): string {
  return t.string().catch("").parse(tvdbPlugin.config().apiKey)
}

export function tvdbPin(): string {
  return t.string().catch("").parse(tvdbPlugin.config().pin)
}
