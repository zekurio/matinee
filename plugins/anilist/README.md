# AniList

Anime movie and show metadata from AniList's public GraphQL API. No API
key is needed. AniList has no useful per-episode metadata, so this provider
returns no seasons or episodes. Folder years help Matinee rank candidates;
they do not filter AniList searches.

## Permissions

- Metadata provider for movies and shows.
- Network access to `graphql.anilist.co` for queries and `s4.anilist.co`
  for covers, banners, and credit photos. No storage or account access.

## Settings

`titleLanguage` selects romaji, English, or native titles, with romaji as
the default and a fallback when the selected form is absent. Other forms
and synonyms become search aliases. `adult` defaults to false. Turn it on
to search adult titles instead of non-adult titles, following AniList's
`isAdult` filter semantics.

Build with `pnpm --filter matinee-plugin-anilist build`, install the built
folder, approve its permissions, then select AniList for a library.
`fetchJson` retries HTTP 429 and 5xx responses, honoring `Retry-After`.
Long AniList cooldowns can exceed Matinee's handler time limit; wait and
try again rather than repeatedly refreshing.
