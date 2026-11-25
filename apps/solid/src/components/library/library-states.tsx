import type { Library } from "@matinee/contracts"
import { useQuery, useQueryClient } from "@tanstack/solid-query"
import { LibraryBig, SearchX } from "lucide"
import { createEffect, Repeat, Show } from "solid-js"

import { tr } from "@/i18n"
import { Button } from "@/kit/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/kit/empty"
import { Icon } from "@/kit/icon"
import { Skeleton } from "@/kit/skeleton"
import { Spinner } from "@/kit/spinner"
import { client, orpc } from "@/lib/rpc"

/** Keep two posters on phones and fit as many as the desktop content can hold. */
export const posterGrid =
  "grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))]"

export function PosterGridSkeleton() {
  return (
    <ul class={posterGrid} aria-hidden="true">
      <Repeat count={12}>
        {() => (
          <li>
            <Skeleton class="aspect-[2/3] rounded-md" />
            <div class="mt-2 flex h-10 flex-col justify-center gap-2">
              <Skeleton class="h-3.5 w-3/4" />
              <Skeleton class="h-3 w-1/3" />
            </div>
          </li>
        )}
      </Repeat>
    </ul>
  )
}

export function EmptyList(props: {
  title: string
  scanning: boolean
  clear?: () => void
}) {
  return (
    <Empty class="min-h-64 py-16">
      <EmptyHeader>
        <EmptyMedia variant="icon" class="mb-4 size-9 [&_svg]:size-5">
          <Icon icon={props.clear ? SearchX : LibraryBig} />
        </EmptyMedia>
        <EmptyTitle class="text-base font-semibold">{props.title}</EmptyTitle>
        <Show when={!props.clear}>
          <EmptyDescription>
            {props.scanning
              ? tr("library.scanRunning")
              : tr("library.noVideosHint")}
          </EmptyDescription>
        </Show>
      </EmptyHeader>
      <Show when={props.clear}>
        <EmptyContent>
          <Button variant="outline" onClick={() => props.clear?.()}>
            {tr("library.clearFilters")}
          </Button>
        </EmptyContent>
      </Show>
    </Empty>
  )
}

export function ShowMore(props: {
  fetching: boolean
  paused: boolean
  failed: boolean
  onLoad: () => void
}) {
  let node: HTMLDivElement | undefined
  createEffect(
    () => !props.fetching && !props.failed && !props.paused,
    (ready) => {
      if (!ready || !node) return
      const observer = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) props.onLoad()
        },
        { rootMargin: "0px 0px 150% 0px" },
      )
      observer.observe(node)
      return () => observer.disconnect()
    },
  )

  return (
    <div
      ref={(element) => {
        node = element
      }}
      class="mt-8 flex justify-center"
    >
      <Button
        variant="outline"
        disabled={props.fetching || props.paused}
        onClick={() => props.onLoad()}
      >
        <Show when={props.fetching}>
          <Spinner />
        </Show>
        {tr("library.showMore")}
      </Button>
    </div>
  )
}

const isBusy = (library: Library) => library.scanning || library.refreshing

/** Refresh the lists affected by a scan as its work finishes. */
export function useLibrary(id: () => string) {
  const queryClient = useQueryClient()
  return useQuery(() => {
    const input = { id: id() }
    const options = orpc.libraries.get.queryOptions({ input })
    return {
      ...options,
      queryFn: async ({ signal }) => {
        const before = queryClient.getQueryData(options.queryKey)
        const library = await client.libraries.get(input, { signal })
        const scanDone = before?.scanning === true && !library.scanning
        const workDone =
          before !== undefined && isBusy(before) && !isBusy(library)
        if (scanDone || workDone) {
          void queryClient.invalidateQueries({ queryKey: orpc.media.key() })
          void queryClient.invalidateQueries({
            queryKey: orpc.libraries.list.key(),
          })
        }
        if (workDone)
          void queryClient.invalidateQueries({ queryKey: orpc.titles.key() })
        return library
      },
      refetchInterval: (query) =>
        query.state.data && isBusy(query.state.data) ? 2000 : false,
    }
  })
}
