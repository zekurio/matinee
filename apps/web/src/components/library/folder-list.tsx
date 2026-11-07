import type { MediaItem } from "@matinee/contracts"
import { Skeleton } from "@matinee/ui/components/skeleton"
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

import { MediaRow } from "@/components/media-item"
import { PageHeader } from "@/components/page-header"
import { tr } from "@/i18n"
import { itemLabel, splitYear } from "@/lib/media"
import { orpc } from "@/lib/rpc"

import {
  EmptyList,
  libraryStatus,
  ShowMore,
  useLibrary,
} from "./library-states"
import {
  HeaderControls,
  type ListControlsProps,
  PhoneControls,
} from "./list-controls"
import { fileSorts, libraryRoute, useListParams } from "./list-params"

const PAGE_SIZE = 100

type Group = {
  key: string
  folder: string
  label: string[]
  items: MediaItem[]
}

/**
 * Consecutive titles from the same folder, so a season's episodes sit under
 * one header instead of repeating its path on every row.
 */
function groupByFolder(items: MediaItem[]): Group[] {
  const groups: Group[] = []
  for (const item of items) {
    const { group, groupLabel } = itemLabel(item)
    const last = groups.at(-1)
    if (last && last.folder === group) last.items.push(item)
    else {
      groups.push({
        key: `${group}:${groups.length}`,
        folder: group,
        label: groupLabel.length ? groupLabel : [tr("library.otherFiles")],
        items: [item],
      })
    }
  }
  return groups
}

/**
 * A show's name links to the show view; its year and season follow in muted
 * text. Inside a show, only the season is left.
 */
function GroupHeading({
  libraryId,
  group,
  inShow,
}: {
  libraryId: string
  group: Group
  inShow: boolean
}) {
  const showFolder =
    !inShow && group.folder ? group.folder.split(" / ")[0] : undefined
  if (!showFolder) {
    return (
      <>
        <span className="text-base leading-6 font-semibold">
          {group.label[0]}
        </span>
        {group.label.length > 1 && (
          <span className="text-muted-foreground whitespace-nowrap">
            {group.label.slice(1).join(" · ")}
          </span>
        )}
      </>
    )
  }
  const { showName, year } = splitYear(showFolder)
  const meta = [year, ...group.label.slice(1)].filter(Boolean).join(" · ")
  return (
    <>
      <Link
        to="/libraries/$libraryId"
        params={{ libraryId }}
        search={{ show: showFolder }}
        className="focus-visible:ring-ring rounded text-base leading-6 font-semibold underline-offset-4 outline-none hover:underline focus-visible:ring-2"
      >
        {showName}
        <ChevronRightIcon className="text-muted-foreground ml-1 inline-block size-3.5 align-[-1px]" />
      </Link>
      {meta && (
        <span className="text-muted-foreground whitespace-nowrap">{meta}</span>
      )}
    </>
  )
}

function FolderListSkeleton() {
  return (
    <div className="flex flex-col gap-1">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-4 p-2">
          <Skeleton className="aspect-video w-24 rounded-md sm:w-28" />
          <div className="flex-1">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="mt-2 h-3.5 w-1/4" />
          </div>
        </div>
      ))}
    </div>
  )
}

/** Every file below one show's folder, grouped by subfolder. */
export function FolderList() {
  const { libraryId } = libraryRoute.useParams()
  const { show } = libraryRoute.useSearch()
  const { search, setSearch, query, sort: rawSort, setSort } = useListParams()
  const sort = rawSort === "year" ? "title" : rawSort
  const library = useLibrary(libraryId)

  const items = useInfiniteQuery(
    orpc.media.list.infiniteOptions({
      input: (offset: number) => ({
        libraryId,
        query: query || undefined,
        folder: show,
        sort,
        limit: PAGE_SIZE,
        offset,
      }),
      initialPageParam: 0,
      getNextPageParam: (last, pages) => {
        const loaded = pages.reduce((n, page) => n + page.items.length, 0)
        return loaded < last.total ? loaded : undefined
      },
      placeholderData: keepPreviousData,
    }),
  )

  const scanning = library.data?.scanning ?? false

  const rows = items.data?.pages.flatMap((page) => page.items) ?? []
  // Inside a show, the page title already names it; headers show the season.
  // The groups are rebuilt on every render, so trimming them in place is safe.
  const groups = groupByFolder(rows)
  for (const group of groups) {
    if (show && group.label[0] === show && group.label.length > 1) {
      group.label = group.label.slice(1)
    }
  }
  const controls: ListControlsProps = {
    search,
    setSearch,
    label: show ? tr("library.searchEpisodes") : tr("library.searchTitles"),
    sorts: fileSorts(),
    sort,
    setSort,
  }

  return (
    <div>
      <PageHeader
        title={show ? splitYear(show).showName : (library.data?.name ?? "")}
        breadcrumb={
          show &&
          library.data && (
            <Link
              to="/libraries/$libraryId"
              params={{ libraryId }}
              className="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex items-center gap-1 rounded outline-none focus-visible:ring-2"
            >
              <ChevronLeftIcon className="size-3.5" />
              {library.data.name}
            </Link>
          )
        }
        description={
          libraryStatus(library.data) ?? (show && splitYear(show).year)
        }
        actions={<HeaderControls {...controls} />}
        phoneActions={<PhoneControls {...controls} />}
      />

      {items.isPending ? (
        <FolderListSkeleton />
      ) : rows.length === 0 ? (
        <EmptyList
          title={
            query
              ? show
                ? tr("library.noEpisodesMatch", { query })
                : tr("library.noTitlesMatch", { query })
              : tr("library.noVideos")
          }
          scanning={scanning}
          clear={
            query
              ? {
                  label: tr("library.clearSearch"),
                  onClick: () => setSearch(""),
                }
              : undefined
          }
        />
      ) : (
        <>
          <div className="flex flex-col gap-4 md:gap-6">
            {groups.map((group) => (
              <section key={group.key} aria-label={group.label.join(", ")}>
                {/* Mobile stacks show and season; wider screens keep them inline. */}
                <h2 className="bg-background/95 after:bg-border/60 sticky top-[env(safe-area-inset-top)] z-[5] -mx-2 mb-1 flex flex-col items-start gap-1 px-2 py-2 text-sm backdrop-blur after:absolute after:inset-x-2 after:bottom-0 after:h-px sm:top-16 sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-2 md:py-2.5">
                  <GroupHeading
                    libraryId={libraryId}
                    group={group}
                    inShow={show !== undefined}
                  />
                </h2>
                {/* Wide screens show a season in two columns. */}
                <ul className="-mx-2 grid min-[1200px]:grid-cols-2 min-[1200px]:gap-x-6">
                  {group.items.map((item) => (
                    <MediaRow key={item.id} item={item} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
          {items.hasNextPage && (
            <ShowMore
              fetching={items.isFetchingNextPage}
              onClick={() => void items.fetchNextPage()}
              className="mt-6"
            />
          )}
        </>
      )}
    </div>
  )
}
