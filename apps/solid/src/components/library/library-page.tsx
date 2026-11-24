import type { Library } from "@matinee/contracts"
import { getRouteApi } from "@tanstack/solid-router"
import { type Accessor, Errored, Loading, Show } from "solid-js"

import type { TitleListSearch } from "@/components/library/title-filter-params"
import { tr } from "@/i18n"
import { Skeleton } from "@/kit/skeleton"
import { Spinner } from "@/kit/spinner"
import { errorMessage } from "@/lib/rpc"

import { PosterGridSkeleton, useLibrary } from "./library-states"
import { browseLayout, TitleGrid } from "./title-grid"
import { libraryTitlesOptions, useTitleFilters } from "./title-queries"

const libraryRoute = getRouteApi("/_authed/_shell/libraries/$libraryId")

export function LibraryPage() {
  const params = libraryRoute.useParams()
  return (
    <Show when={params().libraryId} keyed>
      {(id) => <LibraryById id={id} />}
    </Show>
  )
}

function LibraryById(props: { id: string }) {
  const library = useLibrary(() => props.id)
  return (
    <Errored fallback={libraryError}>
      <Loading
        fallback={
          <div class={browseLayout}>
            <Skeleton class="mb-4 h-12 w-48 sm:mb-16" />
            <PosterGridSkeleton />
          </div>
        }
      >
        <Show when={library.data}>
          {(value) => <LibraryTitles library={value()} />}
        </Show>
      </Loading>
    </Errored>
  )
}

function LibraryTitles(props: { library: Library }) {
  const search = libraryRoute.useSearch()
  const navigate = libraryRoute.useNavigate()
  const update = (patch: Partial<TitleListSearch>) =>
    void navigate({
      search: (previous) => ({ ...previous, ...patch }),
      replace: true,
      resetScroll: false,
    })
  const list = useTitleFilters(search, update, () => ({
    libraryId: props.library.id,
  }))
  const busy = () => props.library.scanning || props.library.refreshing
  return (
    <TitleGrid
      name={props.library.name}
      kind={props.library.kind === "movies" ? "movie" : "show"}
      scanning={props.library.scanning}
      request={libraryTitlesOptions(props.library.id, {
        filters: list.filters(),
        order: list.order(),
      })}
      poll={busy() ? 3000 : false}
      list={list}
      back
      description={
        busy() ? (
          <span class="inline-flex items-center gap-1.5">
            <Spinner class="size-3.5" />
            {props.library.scanning
              ? tr("library.scanning")
              : tr("library.fetchingMetadata")}
          </span>
        ) : undefined
      }
    />
  )
}

function libraryError(cause: Accessor<Parameters<typeof errorMessage>[0]>) {
  return (
    <div class="py-24 text-center">
      <h1 class="text-2xl font-semibold tracking-tight">
        {tr("library.loadFailed")}
      </h1>
      <p class="text-muted-foreground mt-2 text-sm">{errorMessage(cause())}</p>
    </div>
  )
}
