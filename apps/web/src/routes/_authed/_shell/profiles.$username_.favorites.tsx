import type { Favorites, Profile } from "@matinee/contracts"
import { Skeleton } from "@matinee/ui/components/skeleton"
import { useQuery } from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import { ChevronLeftIcon, HeartIcon, LockIcon } from "lucide-react"
import type { ReactNode } from "react"

import {
  EpisodeCard,
  PosterCard,
  SeasonPosterCard,
} from "@/components/media-item"
import { PageHeader, useDocumentTitle } from "@/components/page-header"
import { Rail, RailItem } from "@/components/rail"
import { StatsEmpty } from "@/components/stats/stat-blocks"
import { tr } from "@/i18n"
import { reloadOnEnter } from "@/lib/route-loading"
import { errorMessage, orpc } from "@/lib/rpc"

// Beside the profile's route rather than inside it, so it gets its own page.
export const Route = createFileRoute(
  "/_authed/_shell/profiles/$username_/favorites",
)({
  // Starts the favorites and the profile, for the name, while the page's
  // code loads, and on hover.
  shouldReload: reloadOnEnter,
  loader: ({ context: { queryClient }, params: { username } }) => {
    void queryClient.prefetchQuery(profileOptions(username))
    void queryClient.prefetchQuery(favoritesOptions(username))
  },
  component: FavoritesPage,
})

function profileOptions(username: string) {
  return orpc.profiles.get.queryOptions({ input: { username } })
}

function favoritesOptions(username: string) {
  return orpc.profiles.favorites.queryOptions({ input: { username } })
}

function displayName(profile: Profile): string {
  return profile.user.displayName ?? profile.user.username
}

/**
 * Someone's favorites, a row for each kind they have any of: shows,
 * seasons, episodes, then movies.
 */
function FavoritesPage() {
  const { username } = Route.useParams()
  const profile = useQuery(profileOptions(username))
  const favorites = useQuery(favoritesOptions(username))
  const name = profile.data ? displayName(profile.data) : null
  useDocumentTitle(
    name ? `${tr("profile.favorites")} · ${name}` : tr("profile.favorites"),
  )

  return (
    <div>
      <PageHeader
        title={tr("profile.favorites")}
        breadcrumb={
          <Link
            to="/profiles/$username"
            params={{ username }}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex items-center gap-1 rounded outline-none focus-visible:ring-2"
          >
            <ChevronLeftIcon className="size-3.5" />
            {name ?? `@${username}`}
          </Link>
        }
      />
      {favorites.isPending ? (
        <FavoritesSkeleton />
      ) : favorites.isError ? (
        <div className="py-24 text-center">
          <h2 className="text-2xl font-semibold tracking-tight">
            {tr("profile.favorites.loadFailed")}
          </h2>
          <p className="text-muted-foreground mt-2 text-sm">
            {errorMessage(favorites.error)}
          </p>
        </div>
      ) : favorites.data === null ? (
        <StatsEmpty
          icon={LockIcon}
          title={tr("profile.favorites.hidden", { name: name ?? username })}
        />
      ) : (
        <FavoriteRows
          favorites={favorites.data}
          empty={
            profile.data?.self ? (
              <StatsEmpty
                icon={HeartIcon}
                title={tr("profile.noFavorites")}
                description={tr("profile.noFavoritesHint")}
              />
            ) : (
              <StatsEmpty
                icon={HeartIcon}
                title={tr("profile.favorites.otherEmpty", {
                  name: name ?? username,
                })}
              />
            )
          }
        />
      )}
    </div>
  )
}

/** A row for each kind with any favorites, or `empty` when none has. */
function FavoriteRows({
  favorites,
  empty,
}: {
  favorites: Favorites
  empty: ReactNode
}) {
  const { shows, seasons, episodes, movies } = favorites
  if (
    shows.length === 0 &&
    seasons.length === 0 &&
    episodes.length === 0 &&
    movies.length === 0
  ) {
    return empty
  }
  return (
    <div className="flex flex-col gap-10">
      {shows.length > 0 && (
        <Rail title={tr("profile.favorites.shows")}>
          {shows.map((title) => (
            <RailItem key={title.id} artwork="poster">
              <PosterCard title={title} />
            </RailItem>
          ))}
        </Rail>
      )}
      {seasons.length > 0 && (
        <Rail title={tr("profile.favorites.seasons")}>
          {seasons.map(({ title, season }) => (
            <RailItem key={`${title.id}/${season.number}`} artwork="poster">
              <SeasonPosterCard title={title} season={season} />
            </RailItem>
          ))}
        </Rail>
      )}
      {episodes.length > 0 && (
        <Rail title={tr("profile.favorites.episodes")}>
          {episodes.map((item) => (
            <RailItem key={item.id}>
              <EpisodeCard item={item} />
            </RailItem>
          ))}
        </Rail>
      )}
      {movies.length > 0 && (
        <Rail title={tr("profile.favorites.movies")}>
          {movies.map((title) => (
            <RailItem key={title.id} artwork="poster">
              <PosterCard title={title} />
            </RailItem>
          ))}
        </Rail>
      )}
    </div>
  )
}

/** Two rows of posters on their way. */
function FavoritesSkeleton() {
  return (
    <div className="flex flex-col gap-10">
      {Array.from({ length: 2 }, (_, row) => (
        <section key={row}>
          <Skeleton className="mb-3 h-7 w-32" />
          <ul className="flex gap-3 overflow-hidden sm:gap-4">
            {Array.from({ length: 8 }, (_, i) => (
              <RailItem key={i} artwork="poster">
                <Skeleton className="aspect-[2/3] rounded-md" />
                <Skeleton className="mt-2.5 h-3.5 w-3/4" />
                <Skeleton className="mt-2 h-3 w-1/3" />
              </RailItem>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
