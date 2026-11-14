import type { Translation } from "../../translation"
import access from "./access"
import account from "./account"
import appearance from "./appearance"
import ask from "./ask"
import auth from "./auth"
import branding from "./branding"
import browse from "./browse"
import catalog from "./catalog"
import common from "./common"
import connections from "./connections"
import discover from "./discover"
import downloads from "./downloads"
import filters from "./filters"
import format from "./format"
import jobs from "./jobs"
import libraries from "./libraries"
import library from "./library"
import link from "./link"
import media from "./media"
import network from "./network"
import notifications from "./notifications"
import oidc from "./oidc"
import party from "./party"
import people from "./people"
import playback from "./playback"
import player from "./player"
import profile from "./profile"
import requests from "./requests"
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
  ...notifications,
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
  ...catalog,
  ...discover,
  ...filters,
  ...ask,
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
  ...requests,
  ...connections,
  ...party,
  ...network,
} satisfies Translation
