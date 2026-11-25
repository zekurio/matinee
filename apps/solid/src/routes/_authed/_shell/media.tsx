import type { TitleKind, TitleScope } from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
import { type QueryClient, useQuery } from "@tanstack/solid-query"
import { createFileRoute } from "@tanstack/solid-router"
import { createMemo, Show } from "solid-js"

import { libraryKind } from "@/components/browse/kind-page"
import { titleListSearch } from "@/components/library/title-filter-params"
import { TitleGrid } from "@/components/library/title-grid"
import {
  browsedTitlesOptions,
  preloadInput,
  titleFilterOptionsQuery,
  useTitleFilters,
} from "@/components/library/title-queries"
import { useDocumentTitle } from "@/components/page-header"
import { tr } from "@/i18n"
import { orpc } from "@/lib/rpc"

const MediaSearch = t.object({
  kind: t.enum(["movie", "show"]).optional().catch(undefined),
  library: t.uuid().optional().catch(undefined),
  ...titleListSearch,
})
type MediaSearch = t.infer<typeof MediaSearch>

export const Route = createFileRoute("/_authed/_shell/media")({
  validateSearch: MediaSearch,
  loaderDeps: ({ search }) => search,
  loader: ({ context: { queryClient }, deps }) =>
    preloadMedia(queryClient, deps),
  component: MediaPage,
})

/** The library the URL names, while it still holds titles of the picked kind. */
function pickedLibrary(
  search: MediaSearch,
  libraries: { id: string; kind: string }[] | undefined,
): string | undefined {
  if (!search.library || !libraries) return search.library
  return libraries.some(
    (library) =>
      library.id === search.library &&
      (search.kind === undefined || library.kind === libraryKind[search.kind]),
  )
    ? search.library
    : undefined
}

function preloadMedia(queryClient: QueryClient, search: MediaSearch) {
  const librariesQuery = orpc.libraries.list.queryOptions()
  void queryClient.prefetchQuery(librariesQuery)
  const library = pickedLibrary(
    search,
    queryClient.getQueryData(librariesQuery.queryKey),
  )
  void queryClient.prefetchQuery(
    titleFilterOptionsQuery(
      library
        ? { libraryId: library }
        : search.kind
          ? { kind: search.kind }
          : {},
    ),
  )
  const input = preloadInput(search)
  if (input)
    void queryClient.prefetchInfiniteQuery(
      browsedTitlesOptions({
        ...input,
        kind: search.kind,
        libraryId: library,
      }),
    )
}

/**
 * The Media tab: every movie and show the viewer can see, across the
 * libraries, as the Flutter phone's Media does. The kind and the library
 * narrow it from the filter panel, and the sort follows what the server
 * offers for what's picked.
 */
function MediaPage() {
  useDocumentTitle(() => tr("shell.media"))
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const libraries = useQuery(() => orpc.libraries.list.queryOptions())
  const library = createMemo(() =>
    pickedLibrary(search(), libraries.isSuccess ? libraries.data : undefined),
  )
  const kind = () => search().kind
  const scope = createMemo<TitleScope>(() =>
    library() ? { libraryId: library() } : kind() ? { kind: kind() } : {},
  )
  const ofKind = createMemo(() => {
    const type = kind()
    return (libraries.isSuccess ? libraries.data : []).filter(
      (entry) => !type || entry.kind === libraryKind[type],
    )
  })
  const list = useTitleFilters(
    search,
    (patch) =>
      void navigate({
        search: (previous) => ({ ...previous, ...patch }),
        replace: true,
        resetScroll: false,
      }),
    scope,
  )
  const request = createMemo(() =>
    list.ready()
      ? browsedTitlesOptions({
          kind: kind(),
          libraryId: library(),
          filters: list.filters(),
          order: list.order(),
        })
      : undefined,
  )
  const changeKind = (next: TitleKind | undefined) => {
    const current = library()
    const picked = (libraries.data ?? []).find((entry) => entry.id === current)
    const keeps =
      current === undefined ||
      next === undefined ||
      picked?.kind === libraryKind[next]
    void navigate({
      search: (previous) => ({
        ...previous,
        kind: next,
        library: keeps ? previous.library : undefined,
      }),
      replace: true,
      resetScroll: false,
    })
  }

  return (
    <Show when={scope()} keyed>
      {(current) => (
        <TitleGrid
          name={tr("shell.media")}
          tab
          scanning={(libraries.data ?? []).some((entry) => entry.scanning)}
          list={list}
          request={request()}
          libraries={ofKind()}
          libraryId={current.libraryId}
          onLibraryChange={(next) =>
            void navigate({
              search: (previous) => ({ ...previous, library: next }),
              replace: true,
              resetScroll: false,
            })
          }
          kind={kind()}
          onKindChange={changeKind}
        />
      )}
    </Show>
  )
}
