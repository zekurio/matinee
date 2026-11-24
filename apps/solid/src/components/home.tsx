import type { Library, MediaItem } from "@matinee/contracts"
import { cn } from "@matinee/ui/lib/utils"
import { useQuery, useQueryClient } from "@tanstack/solid-query"
import {
  Link,
  useElementScrollRestoration,
  useRouteContext,
  useRouter,
} from "@tanstack/solid-router"
import { ChevronRight, FolderPlus, Popcorn } from "lucide"
import { createEffect, Errored, For, Loading, Repeat, Show } from "solid-js"

import { tr } from "@/i18n"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/kit/empty"
import { Icon } from "@/kit/icon"
import { Skeleton } from "@/kit/skeleton"
import { Spinner } from "@/kit/spinner"
import { enabledWhile, homeQueries, prefetchHome } from "@/lib/home-queries"
import { can } from "@/lib/permissions"
import { orpc } from "@/lib/rpc"
import { isPhone } from "@/lib/viewport"

import { pageGutter } from "./app-shell"
import { EpisodeCard, TitleCard } from "./media-item"
import {
  createRailReveal,
  holdRail,
  Rail,
  RailItem,
  type RailReveal,
} from "./rail"
import { RecommendationRails } from "./recommendations"
import {
  FeaturedCarousel,
  FeaturedCarouselSkeleton,
  HomeShowcase,
  HomeShowcaseSkeleton,
} from "./showcase"

/**
 * Home: the featured titles on top, as the showcase from `sm` up and as
 * cards on a phone, then what to watch next, what the viewer might like
 * from the libraries, then each library's latest.
 *
 * Each section waits on its own query in its own boundary, so a slow one
 * holds only its place, and one that fails is left out, as on the React
 * app. While a section loads, a skeleton takes the room it will.
 *
 * The shell keeps Home out of the page while another one shows, and
 * `showing` is false then: nothing in it runs or refetches.
 */
export function Home(props: { showing: boolean }) {
  const enabled = enabledWhile(() => props.showing)
  const queryClient = useQueryClient()
  // The loader ran before Home was back. What went stale between then and
  // now would wait for the next visit, so ask again; fresh rows are left.
  createEffect(
    () => props.showing,
    (showing) => {
      if (showing) prefetchHome(queryClient)
    },
    { defer: true },
  )
  const libraries = useQuery(() => ({
    ...orpc.libraries.list.queryOptions(),
    enabled,
  }))
  const eager = returning()
  return (
    <Errored fallback={<HomeSections eager={eager} showing={props.showing} />}>
      <Loading
        fallback={<HomeSections eager={eager} showing={props.showing} />}
      >
        <Show when={libraries.data.length > 0} fallback={<NoLibraries />}>
          <HomeSections eager={eager} showing={props.showing} />
        </Show>
      </Loading>
    </Errored>
  )
}

/** The history entries Home has shown in this tab. */
const visited = new Set<string>()

/**
 * Whether Home is coming back to a history entry it showed before, or to
 * one the browser scrolled before a reload. The router puts the page back
 * where it was as soon as it renders, rows scrolled sideways included, so
 * then every rail builds all its cards at once.
 */
function returning() {
  const router = useRouter()
  const restored = useElementScrollRestoration({ getElement: () => window })
  const location = router.latestLocation
  const key = location.state.__TSR_key ?? location.href
  const seen = visited.has(key)
  visited.add(key)
  return seen || (restored?.scrollY ?? 0) > 0
}

/** Between Home's sections: the Flutter app's 24 on a phone, 32 beside the rail. */
const sectionGap = "gap-6 sm:gap-8"

/**
 * Home's sections. Rails below the fold build their first card only, until
 * they come near the window (see {@link createRailReveal}).
 */
function HomeSections(props: { eager: boolean; showing: boolean }) {
  const enabled = enabledWhile(() => props.showing)
  const resume = useQuery(() => ({ ...homeQueries.resume(), enabled }))
  const nextUp = useQuery(() => ({ ...homeQueries.nextUp(), enabled }))
  const featured = useQuery(() => ({ ...homeQueries.featured(), enabled }))
  const reveal = createRailReveal(props.eager, () => props.showing)
  return (
    <div
      class={cn("flex flex-col pt-2", sectionGap)}
      onFocusIn={(event) => {
        if (
          event.target instanceof Element &&
          event.target.matches(":focus-visible")
        ) {
          reveal.showAll()
        }
      }}
    >
      <Errored fallback={null}>
        <Loading
          fallback={
            <Show when={!isPhone()} fallback={<FeaturedCarouselSkeleton />}>
              <HomeShowcaseSkeleton />
            </Show>
          }
        >
          <Show when={featured.data.length > 0}>
            <Show
              when={!isPhone()}
              fallback={
                <FeaturedCarousel
                  slides={featured.data}
                  showing={props.showing}
                />
              }
            >
              <HomeShowcase slides={featured.data} showing={props.showing} />
            </Show>
          </Show>
        </Loading>
      </Errored>

      <div class={cn(pageGutter, "flex flex-col", sectionGap)}>
        <Errored fallback={null}>
          <Loading
            fallback={
              <EpisodeRailSkeleton title={tr("browse.home.continueWatching")} />
            }
          >
            <Show when={resume.data.length > 0}>
              <EpisodeRail
                reveal={reveal}
                title={tr("browse.home.continueWatching")}
                items={resume.data}
              />
            </Show>
          </Loading>
        </Errored>

        <Errored fallback={null}>
          <Loading
            fallback={<EpisodeRailSkeleton title={tr("browse.home.nextUp")} />}
          >
            <Show when={nextUp.data.length > 0}>
              <EpisodeRail
                reveal={reveal}
                title={tr("browse.home.nextUp")}
                items={nextUp.data.map((entry) => entry.item)}
              />
            </Show>
          </Loading>
        </Errored>

        <Errored fallback={null}>
          <RecommendationRails reveal={reveal} />
        </Errored>

        <Shelves reveal={reveal} />
      </div>
    </div>
  )
}

function EpisodeRail(props: {
  reveal: RailReveal
  title: string
  items: MediaItem[]
}) {
  const hold = holdRail(props.reveal, () => props.items)
  return (
    <Rail ref={hold.ref} title={props.title}>
      <For each={hold.cards(props.items)} keyed={(item) => item.id}>
        {(item) => (
          <RailItem>
            <EpisodeCard item={item()} />
          </RailItem>
        )}
      </For>
    </Rail>
  )
}

/** Each library's latest, once the libraries are known. */
function Shelves(props: { reveal: RailReveal }) {
  const enabled = enabledWhile(() => props.reveal.showing())
  const libraries = useQuery(() => ({
    ...orpc.libraries.list.queryOptions(),
    enabled,
  }))
  return (
    <Errored fallback={null}>
      <Loading fallback={<PosterRailSkeleton />}>
        <For each={libraries.data} keyed={(library) => library.id}>
          {(library) => (
            <Errored fallback={null}>
              <LibraryShelf library={library()} reveal={props.reveal} />
            </Errored>
          )}
        </For>
      </Loading>
    </Errored>
  )
}

/** The two 20px lines of text under a card, as bars. */
function CardTextSkeleton() {
  return (
    <span class="mt-2 flex h-10 flex-col justify-center gap-2">
      <Skeleton class="h-3.5 w-2/3" />
      <Skeleton class="h-3 w-1/2" />
    </span>
  )
}

/** A row of episode cards on its way, as tall as the row it stands in for. */
function EpisodeRailSkeleton(props: { title: string }) {
  return (
    <Rail title={props.title}>
      <Repeat count={6}>
        {() => (
          <RailItem>
            <Skeleton class="aspect-video rounded-md" />
            <CardTextSkeleton />
          </RailItem>
        )}
      </Repeat>
    </Rail>
  )
}

/** Posters on their way, inside a rail. */
function PosterSkeletons() {
  return (
    <Repeat count={8}>
      {() => (
        <RailItem artwork="poster">
          <Skeleton class="aspect-[2/3] rounded-md" />
          <CardTextSkeleton />
        </RailItem>
      )}
    </Repeat>
  )
}

/** A shelf whose library isn't known yet: its heading as a bar. */
function PosterRailSkeleton() {
  return (
    <section aria-busy="true">
      <Skeleton class="mb-3 h-7 w-56" />
      <ul class="flex gap-3 overflow-hidden py-1.5 sm:gap-4">
        <PosterSkeletons />
      </ul>
    </section>
  )
}

function LibraryShelf(props: { library: Library; reveal: RailReveal }) {
  const enabled = enabledWhile(() => props.reveal.showing())
  const entries = useQuery(() => ({
    ...homeQueries.shelf(props.library.id),
    enabled,
  }))
  const hold = holdRail(props.reveal, () =>
    entries.isSuccess ? entries.data : undefined,
  )
  const title = () =>
    tr("browse.home.recentlyAdded", { library: props.library.name })
  return (
    <Rail
      ref={hold.ref}
      title={title()}
      heading={
        props.library.itemCount > 0 ? (
          <Link
            to="/libraries/$libraryId"
            params={{ libraryId: props.library.id }}
            search={{ sort: "recent" }}
            class="group/heading focus-visible:ring-ring inline-flex max-w-full items-center gap-1 rounded-sm outline-none focus-visible:ring-2"
          >
            <span class="truncate">{title()}</span>
            <Icon
              icon={ChevronRight}
              class="text-muted-foreground group-hover/heading:text-foreground size-5 shrink-0 transition-colors"
            />
          </Link>
        ) : undefined
      }
      action={
        props.library.scanning ? (
          <span class="text-muted-foreground inline-flex items-center gap-1.5 text-sm">
            <Spinner class="size-3.5" />
            {tr("browse.home.scanning")}
          </span>
        ) : undefined
      }
    >
      <Loading fallback={<PosterSkeletons />}>
        <Show
          when={entries.data.length > 0}
          fallback={
            <li class="text-muted-foreground w-full rounded-lg border border-dashed p-6 text-sm">
              {tr("browse.home.emptyShelf")}
            </li>
          }
        >
          <For
            each={hold.cards(entries.data)}
            keyed={(entry) => entry.title.id}
          >
            {(entry) => (
              <RailItem artwork="poster">
                <TitleCard entry={entry()} />
              </RailItem>
            )}
          </For>
        </Show>
      </Loading>
    </Rail>
  )
}

/**
 * What Home says when there's no library to show. An admin sees every
 * library, so none means none exist; anyone else may be in no group that
 * opens one. Adding one is in settings, which come later.
 */
function NoLibraries() {
  const context = useRouteContext({ from: "/_authed/_shell" })
  const admin = () => can(context().user, "library.create")
  return (
    <div class={cn(pageGutter, "flex flex-col gap-6 pt-6")}>
      <h1 class="text-2xl font-semibold tracking-tight">
        {tr("browse.home.welcome", {
          name: context().user.displayName ?? context().user.username,
        })}
      </h1>
      <Empty class="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Icon icon={admin() ? FolderPlus : Popcorn} />
          </EmptyMedia>
          <EmptyTitle>
            {admin()
              ? tr("browse.home.noLibraries")
              : tr("browse.home.nothingYet")}
          </EmptyTitle>
          <EmptyDescription>
            {admin()
              ? tr("browse.home.noLibrariesAdmin")
              : tr("browse.home.nothingYetDescription")}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  )
}
