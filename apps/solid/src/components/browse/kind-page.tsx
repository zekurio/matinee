import type { Library, TitleKind, TitleScope } from "@matinee/contracts"
import { type QueryClient, useQuery } from "@tanstack/solid-query"
import { createMemo, Show } from "solid-js"

import { TitleGrid } from "@/components/library/title-grid"
import {
  browsedTitlesOptions,
  preloadInput,
  titleFilterOptionsQuery,
  useTitleFilters,
} from "@/components/library/title-queries"
import { tr } from "@/i18n"
import type { KindSearch } from "@/lib/browse-search"
import { orpc } from "@/lib/rpc"
import { isPhone } from "@/lib/viewport"

/** The kind of library that holds each kind of title. */
export const libraryKind = {
  movie: "movies",
  show: "shows",
} satisfies Record<TitleKind, Library["kind"]>

/**
 * The library `search` narrows to, when it names one of `kind`'s. Until
 * the libraries load, the one it names, so the list isn't asked for twice.
 */
export function pickedLibrary(
  search: KindSearch,
  libraries: Library[] | undefined,
  kind: TitleKind,
): string | undefined {
  if (!search.library || !libraries) return search.library
  return libraries.some(
    (library) =>
      library.id === search.library && library.kind === libraryKind[kind],
  )
    ? search.library
    : undefined
}

/** What the Movies or Shows route starts loading before the page mounts. */
export function kindPageLoader(
  queryClient: QueryClient,
  kind: TitleKind,
  search: KindSearch,
) {
  const librariesQuery = orpc.libraries.list.queryOptions()
  void queryClient.prefetchQuery(librariesQuery)
  const libraryId = pickedLibrary(
    search,
    queryClient.getQueryData(librariesQuery.queryKey),
    kind,
  )
  void queryClient.prefetchQuery(
    titleFilterOptionsQuery(libraryId ? { libraryId } : { kind }),
  )
  const input = preloadInput(search)
  if (input)
    void queryClient.prefetchInfiniteQuery(
      browsedTitlesOptions({ ...input, kind, libraryId }),
    )
}

type KindPageProps = {
  kind: TitleKind
  search: KindSearch
  update: (patch: KindSearch) => void
}

export function KindPage(props: KindPageProps) {
  const libraries = useQuery(() => orpc.libraries.list.queryOptions())
  const libraryId = createMemo(() =>
    pickedLibrary(
      props.search,
      libraries.isSuccess ? libraries.data : undefined,
      props.kind,
    ),
  )
  const ofKind = createMemo(() =>
    (libraries.isSuccess ? libraries.data : []).filter(
      (library) => library.kind === libraryKind[props.kind],
    ),
  )
  const scope = createMemo(() => {
    const id = libraryId()
    return id ? { libraryId: id } : { kind: props.kind }
  })

  return (
    <Show when={scope()} keyed>
      {(current) => (
        <KindTitles {...props} scope={current} libraries={ofKind()} />
      )}
    </Show>
  )
}

function KindTitles(
  props: KindPageProps & { scope: TitleScope; libraries: Library[] },
) {
  const list = useTitleFilters(
    () => props.search,
    (patch) => props.update(patch),
    () => props.scope,
  )
  const request = () =>
    browsedTitlesOptions({
      kind: props.kind,
      libraryId: props.scope.libraryId,
      filters: list.filters(),
      order: list.order(),
    })

  return (
    <TitleGrid
      // A phone tab is Media, as in the Flutter app; wider screens keep the
      // rail's own Movies and Shows names.
      name={
        isPhone() ? tr("shell.media") : tr(`shell.${libraryKind[props.kind]}`)
      }
      kind={props.kind}
      tab={isPhone()}
      scanning={props.libraries.some((library) => library.scanning)}
      list={list}
      request={request()}
      libraries={props.libraries}
      libraryId={props.scope.libraryId}
      onLibraryChange={(library) => props.update({ library })}
    />
  )
}
