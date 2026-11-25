import type { Favorites, Profile } from "@matinee/contracts"
import type { JSX } from "@solidjs/web"
import { useQuery } from "@tanstack/solid-query"
import { createFileRoute } from "@tanstack/solid-router"
import { Heart, Lock } from "lucide"
import { For, Match, Repeat, Show, Switch } from "solid-js"

import { pageGutter } from "@/components/app-shell"
import { FavoriteCard } from "@/components/favorites"
import { EpisodeCard, PosterCard } from "@/components/media-item"
import { PageHeader, useDocumentTitle } from "@/components/page-header"
import { Rail, RailItem } from "@/components/rail"
import { StatsEmpty } from "@/components/stats/stat-blocks"
import { tr } from "@/i18n"
import { Skeleton } from "@/kit/skeleton"
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
  const params = Route.useParams()
  const profile = useQuery(() => profileOptions(params().username))
  const favorites = useQuery(() => favoritesOptions(params().username))
  const name = () => (profile.isSuccess ? displayName(profile.data) : null)
  useDocumentTitle(() => {
    const shown = name()
    return shown
      ? `${tr("profile.favorites")} · ${shown}`
      : tr("profile.favorites")
  })

  return (
    <div class={[pageGutter, "sm:pt-8"]}>
      <PageHeader title={tr("profile.favorites")} />
      <Switch>
        <Match when={favorites.isPending}>
          <FavoritesSkeleton />
        </Match>
        <Match when={favorites.isError}>
          <div class="py-24 text-center">
            <h2 class="text-2xl font-semibold tracking-tight">
              {tr("profile.favorites.loadFailed")}
            </h2>
            <p class="text-muted-foreground mt-2 text-sm">
              {errorMessage(favorites.error)}
            </p>
          </div>
        </Match>
        <Match when={favorites.isSuccess && favorites.data === null}>
          <StatsEmpty
            icon={Lock}
            title={tr("profile.favorites.hidden", {
              name: name() ?? params().username,
            })}
          />
        </Match>
        <Match when={favorites.isSuccess && favorites.data}>
          {(data) => (
            <FavoriteRows
              favorites={data()}
              empty={
                <Show
                  when={profile.isSuccess && profile.data.self}
                  fallback={
                    <StatsEmpty
                      icon={Heart}
                      title={tr("profile.favorites.otherEmpty", {
                        name: name() ?? params().username,
                      })}
                    />
                  }
                >
                  <StatsEmpty
                    icon={Heart}
                    title={tr("profile.noFavorites")}
                    description={tr("profile.noFavoritesHint")}
                  />
                </Show>
              }
            />
          )}
        </Match>
      </Switch>
    </div>
  )
}

/** A row for each kind with any favorites, or `empty` when none has. */
function FavoriteRows(props: { favorites: Favorites; empty: JSX.Element }) {
  const none = () =>
    props.favorites.shows.length === 0 &&
    props.favorites.seasons.length === 0 &&
    props.favorites.episodes.length === 0 &&
    props.favorites.movies.length === 0
  return (
    <Show when={!none()} fallback={props.empty}>
      <div class="flex flex-col gap-10">
        <Show when={props.favorites.shows.length > 0}>
          <Rail title={tr("profile.favorites.shows")}>
            <For each={props.favorites.shows} keyed={(title) => title.id}>
              {(title) => (
                <RailItem artwork="poster">
                  <PosterCard title={title()} />
                </RailItem>
              )}
            </For>
          </Rail>
        </Show>
        <Show when={props.favorites.seasons.length > 0}>
          <Rail title={tr("profile.favorites.seasons")}>
            <For
              each={props.favorites.seasons}
              keyed={(entry) => `${entry.title.id}/${entry.season.number}`}
            >
              {(entry) => (
                <RailItem artwork="poster">
                  <FavoriteCard
                    favorite={{
                      kind: "showSeason",
                      title: entry().title,
                      season: entry().season,
                    }}
                  />
                </RailItem>
              )}
            </For>
          </Rail>
        </Show>
        <Show when={props.favorites.episodes.length > 0}>
          <Rail title={tr("profile.favorites.episodes")}>
            <For each={props.favorites.episodes} keyed={(item) => item.id}>
              {(item) => (
                <RailItem>
                  <EpisodeCard item={item()} />
                </RailItem>
              )}
            </For>
          </Rail>
        </Show>
        <Show when={props.favorites.movies.length > 0}>
          <Rail title={tr("profile.favorites.movies")}>
            <For each={props.favorites.movies} keyed={(title) => title.id}>
              {(title) => (
                <RailItem artwork="poster">
                  <PosterCard title={title()} />
                </RailItem>
              )}
            </For>
          </Rail>
        </Show>
      </div>
    </Show>
  )
}

/** Two rows of posters on their way. */
function FavoritesSkeleton() {
  return (
    <div class="flex flex-col gap-10">
      <Repeat count={2}>
        {() => (
          <section>
            <Skeleton class="mb-3 h-7 w-32" />
            <ul class="flex gap-3 overflow-hidden sm:gap-4">
              <Repeat count={8}>
                {() => (
                  <RailItem artwork="poster">
                    <Skeleton class="aspect-[2/3] rounded-md" />
                    <Skeleton class="mt-2.5 h-3.5 w-3/4" />
                    <Skeleton class="mt-2 h-3 w-1/3" />
                  </RailItem>
                )}
              </Repeat>
            </ul>
          </section>
        )}
      </Repeat>
    </div>
  )
}
