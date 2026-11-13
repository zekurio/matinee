import type { Translation } from "../../translation"
import access from "./access"
import account from "./account"
import appearance from "./appearance"
import auth from "./auth"
import branding from "./branding"
import browse from "./browse"
import common from "./common"
import downloads from "./downloads"
import format from "./format"
import jobs from "./jobs"
import libraries from "./libraries"
import library from "./library"
import link from "./link"
import media from "./media"
import network from "./network"
import oidc from "./oidc"
import party from "./party"
import people from "./people"
import playback from "./playback"
import player from "./player"
import profile from "./profile"
import search from "./search"
import server from "./server"
import settings from "./settings"
import shell from "./shell"
import stats from "./stats"
import title from "./title"
import transcoding from "./transcoding"
import trickplay from "./trickplay"
import ui from "./ui"
import users from "./users"
import validation from "./validation"

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
  ...downloads,
  ...title,
  ...people,
  ...search,
  ...stats,
  ...profile,
  ...libraries,
  ...ui,
  ...users,
  ...access,
  ...validation,
  ...oidc,
  ...transcoding,
  ...trickplay,
  ...jobs,
  ...branding,
  ...account,
  ...playback,
  ...common,
  ...link,
  ...party,
  ...network,
} satisfies Translation
