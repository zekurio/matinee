import account from "./account"
import appearance from "./appearance"
import auth from "./auth"
import browse from "./browse"
import common from "./common"
import format from "./format"
import jobs from "./jobs"
import libraries from "./libraries"
import library from "./library"
import link from "./link"
import media from "./media"
import oidc from "./oidc"
import people from "./people"
import playback from "./playback"
import player from "./player"
import profile from "./profile"
import search from "./search"
import server from "./server"
import serverAppearance from "./serverAppearance"
import settings from "./settings"
import shell from "./shell"
import stats from "./stats"
import themes from "./themes"
import title from "./title"
import transcoding from "./transcoding"
import trickplay from "./trickplay"
import ui from "./ui"
import users from "./users"
import validation from "./validation"

/*
 * The source catalog: every message the interface shows, in English, one
 * file per area of the app. Keys are dotted and start with their area. Write
 * `{name}` for a value the code fills in, and `plural(...)` for text that
 * changes with a count. A new message goes here first; other languages
 * fall back to it until they translate it. A new area gets a file here,
 * one in each other language, and a line in each index.
 */
export default {
  ...format,
  ...shell,
  ...auth,
  ...server,
  ...settings,
  ...appearance,
  ...player,
  ...browse,
  ...library,
  ...media,
  ...title,
  ...people,
  ...search,
  ...stats,
  ...profile,
  ...libraries,
  ...ui,
  ...users,
  ...validation,
  ...oidc,
  ...transcoding,
  ...trickplay,
  ...jobs,
  ...serverAppearance,
  ...account,
  ...playback,
  ...themes,
  ...common,
  ...link,
}
