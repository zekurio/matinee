import type { Season, Title } from "@matinee/contracts"
import { useQueryClient } from "@tanstack/solid-query"
import { Link } from "@tanstack/solid-router"
import { createEffect, createSignal, Show } from "solid-js"

import { pageGutter } from "@/components/app-shell"
import { CastRail } from "@/components/credits"
import { ItemTopBar } from "@/components/phone-nav"
import { useTitleWatched } from "@/components/watched-menu"
import { tr } from "@/i18n"
import { buttonVariants } from "@/kit/button"
import { Skeleton } from "@/kit/skeleton"
import { errorMessage } from "@/lib/rpc"

import { ShowEpisodes } from "./episodes"
import { NextUp } from "./next-up"
import { SeasonsRail } from "./seasons-rail"
import {
  TitleHeader,
  titleBackdrop,
  titleColumnTop,
  titlePoster,
  titleTop,
} from "./title-header"
import { initialSeason, seasonItemsOptions, useTitle } from "./title-queries"

export function TitlePage(props: { titleId: string }) {
  return (
    <div class={[pageGutter, "relative sm:-mt-16"]}>
      <ItemTopBar />
      <Show when={props.titleId} keyed>
        {(id) => <TitleDetail titleId={id} />}
      </Show>
    </div>
  )
}

function TitleDetail(props: { titleId: string }) {
  const title = useTitle(() => props.titleId)
  createEffect(
    () => title()?.data?.name,
    (name) => {
      if (!name) return
      document.title = `${name} · matinee`
      return () => {
        document.title = "matinee"
      }
    },
  )
  return (
    <Show
      when={title()?.data}
      fallback={
        <Show when={title()?.isLoadingError} fallback={<TitleSkeleton />}>
          <TitleLoadError message={errorMessage(title()?.error)} />
        </Show>
      }
    >
      {(current) => <TitleContent title={current()} />}
    </Show>
  )
}

function TitleContent(props: { title: Title }) {
  const watched = useTitleWatched(() => props.title)
  return (
    <div class="flex flex-col gap-6 sm:gap-8">
      <TitleHeader title={props.title} watched={watched} />
      <Show when={props.title.kind === "show"}>
        <ShowSections title={props.title} watched={watched.pending()} />
      </Show>
      <CastRail credits={props.title.credits} />
    </div>
  )
}

function ShowSections(props: { title: Title; watched: boolean | undefined }) {
  const [picked, setPicked] = createSignal<Season["number"]>()
  const season = () =>
    props.title.seasons.find((entry) => entry.number === picked()) ??
    initialSeason(props.title)
  const queryClient = useQueryClient()
  const select = (selected: Season) => {
    void queryClient.prefetchQuery(
      seasonItemsOptions(props.title.id, selected.number),
    )
    setPicked(selected.number)
  }
  return (
    <>
      <Show
        when={
          props.title.next &&
          !props.title.next.progress?.completed &&
          props.title.next
        }
      >
        {(item) => <NextUp item={item()} />}
      </Show>
      <Show when={season()}>
        {(selected) => (
          <>
            <Show when={props.title.seasons.length > 1}>
              <SeasonsRail
                title={props.title}
                selected={selected()}
                onSelect={select}
              />
            </Show>
            <ShowEpisodes
              title={props.title}
              season={selected()}
              watched={props.watched}
            />
          </>
        )}
      </Show>
    </>
  )
}

export function TitleSkeleton() {
  return (
    <div role="status" aria-label={tr("ui.loading")}>
      <Skeleton
        class={[
          "absolute inset-x-0 top-0 rounded-none [mask-image:linear-gradient(black,transparent)]",
          titleBackdrop,
        ].join(" ")}
      />
      <div class={["relative flex gap-6 lg:gap-10", titleTop]}>
        <Skeleton class={[titlePoster, "aspect-[2/3]"].join(" ")} />
        <div class={["w-full max-w-xl", titleColumnTop].join(" ")}>
          <Skeleton class="h-8 w-2/3 sm:h-12" />
          <Skeleton class="mt-3 h-5 w-1/3" />
          <div class="mt-5 flex items-center gap-2">
            <Skeleton class="h-11 flex-1 sm:h-10 sm:w-40 sm:flex-none" />
            <Skeleton class="size-11 rounded-full sm:size-10" />
            <Skeleton class="size-11 rounded-full sm:size-10" />
          </div>
          <Skeleton class="mt-6 h-[4.5rem] w-full" />
          <Skeleton class="mt-5 h-5 w-2/3" />
          <Skeleton class="mt-2 h-5 w-1/2" />
        </div>
      </div>
    </div>
  )
}

function TitleLoadError(props: { message: string }) {
  return (
    <div class="pt-40 pb-24 text-center">
      <h1 class="text-2xl font-semibold tracking-tight">
        {tr("title.loadError")}
      </h1>
      <p class="text-muted-foreground mt-2 text-sm">{props.message}</p>
      <Link
        to="/"
        class={buttonVariants({ variant: "secondary", className: "mt-6" })}
      >
        {tr("title.backHome")}
      </Link>
    </div>
  )
}
