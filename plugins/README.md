# Plugins

Plugins that ship with the repository. Each one is small on purpose, and
shows one kind of plugin end to end.

| Plugin               | Kind                 | What it does                                                    |
| -------------------- | -------------------- | --------------------------------------------------------------- |
| [anilist](anilist)   | Metadata             | Anime movies and shows from AniList, which needs no API key     |
| [webhook](webhook)   | Events               | Posts server events as signed JSON to an address you enter      |
| [oauth2](oauth2)     | Sign-in, redirect    | Sign in through an OAuth 2.0 provider such as GitHub or Discord |
| [jellyfin](jellyfin) | Sign-in, credentials | Sign in with the accounts of a Jellyfin server                  |

Build them with `pnpm --filter "matinee-plugin-*" build`. To run them on a
server, set `MATINEE_PLUGIN_DIRS` to this folder, or copy one plugin's
folder into `plugins/` in the server's data dir, then turn it on under
Settings → Plugins. `matinee-plugin pack` in a plugin's folder writes the
`.tgz` an install from a URL or a registry takes.

The [authoring guide](../packages/plugin/README.md) has the API, and
[the server's README](../apps/server/README.md#plugins) says how plugins
are installed, approved, and held to their limits.
