import type { ComponentChildren } from "preact"

import type { Entry } from "@/app/navigator"

import { FavoritesPage, SearchPage } from "./browse"
import { EpisodePage, SeasonPage, TitlePage } from "./detail"
import { BrowsePage, KindPage, PersonPage } from "./grid"
import { Home } from "./home"
import { PlayerPage } from "./player"
import { ProfilePage, RecentPage } from "./profile"
import { SettingsPage } from "./settings"

/**
 * The page for an entry on the stack, by its route. The phone's pages
 * that a TV leaves out (downloads, the admin pages, the image editor,
 * identify, and linking a device) have no route here, and neither has a
 * single library's grid: the drawer's Movies and Shows take every library
 * at once.
 */
export function pageFor(entry: Entry): ComponentChildren {
  const { route } = entry
  switch (route.page) {
    case "home":
      return <Home />
    case "search":
      return <SearchPage />
    case "favorites":
      return <FavoritesPage />
    case "kind":
      return <KindPage kind={route.kind} />
    case "title":
      return <TitlePage id={route.id} />
    case "season":
      return <SeasonPage titleId={route.titleId} season={route.season} />
    case "episode":
      return <EpisodePage itemId={route.itemId} />
    case "person":
      return <PersonPage name={route.name} tmdbId={route.tmdbId} />
    case "browse":
      return <BrowsePage genre={route.genre} studio={route.studio} />
    case "player":
      return <PlayerPage itemId={route.itemId} start={route.start} />
    case "profile":
      return <ProfilePage />
    case "recent":
      return <RecentPage />
    case "settings":
      return <SettingsPage category={route.category} />
  }
}
