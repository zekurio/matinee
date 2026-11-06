import { Radio } from "@base-ui/react/radio"
import { RadioGroup } from "@base-ui/react/radio-group"
import type { Library, MediaItem } from "@matinee/contracts"
import { Button } from "@matinee/ui/components/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@matinee/ui/components/empty"
import { Input } from "@matinee/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@matinee/ui/components/select"
import { Skeleton } from "@matinee/ui/components/skeleton"
import { Spinner } from "@matinee/ui/components/spinner"
import { cn } from "@matinee/ui/lib/utils"
import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { createFileRoute, Link } from "@tanstack/react-router"
import {
  ArrowUpDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  FolderOpenIcon,
  SearchIcon,
  SearchXIcon,
  XIcon,
} from "lucide-react"
import {
  type ReactNode,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from "react"
import { z } from "zod"

import { BarSearch } from "@/components/bar-search"
import { chipClass, chipRow } from "@/components/chips"
import { MediaRow, PosterCard } from "@/components/media-item"
import { PageHeader } from "@/components/page-header"
import { itemLabel, splitYear } from "@/lib/media"
import { orpc } from "@/lib/rpc"

const PAGE_SIZE = 100
const GRID_PAGE_SIZE = 60

type Sort = "title" | "recent" | "year"
type SortOption = { value: Sort; label: string }
const fileSorts: SortOption[] = [
  { value: "title", label: "File name" },
  { value: "recent", label: "Recently added" },
]
const titleSorts: SortOption[] = [
  { value: "title", label: "Name" },
  { value: "recent", label: "Recently added" },
  { value: "year", label: "Year" },
]

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
        label: groupLabel.length ? groupLabel : ["Other files"],
        items: [item],
      })
    }
  }
  return groups
}

/** Title is the default sort, so the URL leaves it out. */
const LibrarySearch = z.object({
  q: z.string().min(1).optional().catch(undefined),
  show: z.string().min(1).optional().catch(undefined),
  sort: z
    .enum(["recent", "year"])
    .optional()
    .catch(undefined) satisfies z.ZodType<Sort | undefined>,
})

export const Route = createFileRoute("/_authed/_shell/libraries/$libraryId")({
  validateSearch: LibrarySearch,
  component: LibraryPage,
})

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

/** What the server is doing to the library, if anything. */
function libraryStatus(library: Library | undefined): ReactNode {
  const busy = library?.scanning
    ? "Scanning folders…"
    : library?.refreshing
      ? "Fetching metadata…"
      : null
  if (!busy) return null
  return (
    <span className="inline-flex items-center gap-1.5">
      <Spinner className="size-3.5" /> {busy}
    </span>
  )
}

/**
 * The search box's text, mirrored into the URL after a pause so Back from
 * the player restores it, and the sort, which goes there straight away.
 */
function useListParams() {
  const { q, sort: sortParam } = Route.useSearch()
  const sort: Sort = sortParam ?? "title"
  const navigate = Route.useNavigate()
  const [search, setSearch] = useState(q ?? "")
  const query = useDeferredValue(search.trim())
  const setSort = (next: Sort) =>
    void navigate({
      search: (prev) => ({
        ...prev,
        sort: next === "title" ? undefined : next,
      }),
      replace: true,
    })

  useEffect(() => {
    const next = search.trim() || undefined
    if (next === q) return
    const timer = window.setTimeout(() => {
      void navigate({ search: (prev) => ({ ...prev, q: next }), replace: true })
    }, 250)
    return () => window.clearTimeout(timer)
  }, [search, q, navigate])

  return { search, setSearch, query, sort, setSort }
}

function useLibrary(libraryId: string) {
  return useQuery(
    orpc.libraries.get.queryOptions({
      input: { id: libraryId },
      // Poll while a scan or metadata fetch runs so new titles show up.
      refetchInterval: (q) =>
        q.state.data?.scanning || q.state.data?.refreshing ? 2000 : false,
    }),
  )
}

/**
 * Movies and shows as a poster grid. `other` libraries, and links into one
 * folder, list files instead.
 */
function LibraryPage() {
  const { libraryId } = Route.useParams()
  const { show } = Route.useSearch()
  const library = useLibrary(libraryId)
  if (library.isPending) {
    return (
      <div className="max-w-6xl">
        <Skeleton className="mb-6 h-10 w-48" />
        <PosterGridSkeleton />
      </div>
    )
  }
  if (library.data && library.data.kind !== "other" && !show) {
    return <TitleGrid library={library.data} />
  }
  return <FolderList />
}

/** Search and sort, given to both layouts. */
type ListControlsProps = {
  search: string
  setSearch: (value: string) => void
  /** The search field's label and placeholder. */
  label: string
  sorts: SortOption[]
  sort: Sort
  setSort: (value: Sort) => void
}

/** Sort and search beside the title, from `sm` up. */
function HeaderControls({
  search,
  setSearch,
  label,
  sorts,
  sort,
  setSort,
}: ListControlsProps) {
  return (
    <>
      <SortSelect options={sorts} value={sort} onChange={setSort} />
      <SearchBox value={search} onChange={setSearch} label={label} />
    </>
  )
}

/** Phones: sort as chips under the title, search in the tab bar. */
function PhoneControls({
  search,
  setSearch,
  label,
  sorts,
  sort,
  setSort,
}: ListControlsProps) {
  return (
    <>
      <SortChips options={sorts} value={sort} onChange={setSort} />
      <BarSearch value={search} onChange={setSearch} label={label} />
    </>
  )
}

function SortChips({
  options,
  value,
  onChange,
}: {
  options: SortOption[]
  value: Sort
  onChange: (value: Sort) => void
}) {
  return (
    <RadioGroup
      aria-label="Sort"
      value={value}
      onValueChange={onChange}
      className={cn(chipRow, "mb-4 sm:hidden")}
    >
      <ArrowUpDownIcon
        aria-hidden
        className="text-muted-foreground mr-0.5 size-4 shrink-0"
      />
      {options.map((option) => (
        <Radio.Root
          key={option.value}
          value={option.value}
          className={chipClass(option.value === value)}
        >
          {option.label}
        </Radio.Root>
      ))}
    </RadioGroup>
  )
}

function SearchBox({
  value,
  onChange,
  label,
}: {
  value: string
  onChange: (value: string) => void
  label: string
}) {
  return (
    <div className="relative w-72">
      <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
      <Input
        type="search"
        placeholder={label}
        aria-label={label}
        className="px-8 [&::-webkit-search-cancel-button]:appearance-none"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") onChange("")
        }}
      />
      {value && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Clear search"
          className="absolute top-1/2 right-1 -translate-y-1/2 [@media(pointer:coarse)]:size-11"
          onClick={() => onChange("")}
        >
          <XIcon />
        </Button>
      )}
    </div>
  )
}

function SortSelect({
  options,
  value,
  onChange,
}: {
  options: SortOption[]
  value: Sort
  onChange: (value: Sort) => void
}) {
  return (
    <Select
      items={options}
      value={value}
      onValueChange={(next) => next && onChange(next)}
    >
      <SelectTrigger
        aria-label="Sort"
        className="min-w-44 shrink-0 justify-between gap-1"
      >
        <span className="text-muted-foreground">Sort:</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

const gridClass =
  "grid grid-cols-3 gap-x-3 gap-y-5 sm:grid-cols-4 sm:gap-x-4 md:grid-cols-5 lg:grid-cols-6"

function PosterGridSkeleton() {
  return (
    <ul className={gridClass}>
      {Array.from({ length: 12 }, (_, i) => (
        <li key={i}>
          <Skeleton className="aspect-[2/3] rounded-md" />
          <Skeleton className="mt-2.5 h-3.5 w-3/4" />
          <Skeleton className="mt-2 h-3 w-1/3" />
        </li>
      ))}
    </ul>
  )
}

function TitleGrid({ library }: { library: Library }) {
  const queryClient = useQueryClient()
  const { search, setSearch, query, sort, setSort } = useListParams()
  const busy = library.scanning || library.refreshing
  const titles = useInfiniteQuery(
    orpc.titles.list.infiniteOptions({
      input: (offset: number) => ({
        libraryId: library.id,
        query: query || undefined,
        sort: sort === "title" ? "name" : sort,
        limit: GRID_PAGE_SIZE,
        offset,
      }),
      initialPageParam: 0,
      getNextPageParam: (last, pages) => {
        const loaded = pages.reduce((n, page) => n + page.items.length, 0)
        return loaded < last.total ? loaded : undefined
      },
      placeholderData: keepPreviousData,
      // Posters arrive one title at a time while metadata is fetched.
      refetchInterval: busy ? 3000 : false,
    }),
  )

  // One last refresh when the work finishes, for the final titles.
  const wasBusy = useRef(busy)
  useEffect(() => {
    if (wasBusy.current && !busy) {
      void queryClient.invalidateQueries({ queryKey: orpc.titles.key() })
      void queryClient.invalidateQueries({ queryKey: orpc.media.key() })
      void queryClient.invalidateQueries({
        queryKey: orpc.libraries.list.key(),
      })
    }
    wasBusy.current = busy
  }, [busy, queryClient])

  const rows = titles.data?.pages.flatMap((page) => page.items) ?? []
  const noun = library.kind === "shows" ? "show" : "movie"
  const controls: ListControlsProps = {
    search,
    setSearch,
    label: `Search ${noun}s`,
    sorts: titleSorts,
    sort,
    setSort,
  }

  return (
    <div className="max-w-6xl">
      <PageHeader
        title={library.name}
        description={libraryStatus(library)}
        actions={<HeaderControls {...controls} />}
      />
      <PhoneControls {...controls} />

      {titles.isPending ? (
        <PosterGridSkeleton />
      ) : rows.length === 0 ? (
        <Empty className="py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon" className="mb-4 size-9 [&_svg]:size-5">
              {query ? <SearchXIcon /> : <FolderOpenIcon />}
            </EmptyMedia>
            <EmptyTitle className="text-base font-semibold">
              {query ? `No ${noun}s match “${query}”` : `No ${noun}s found`}
            </EmptyTitle>
            {!query && (
              <EmptyDescription>
                {library.scanning
                  ? "The scan is still running."
                  : "Check that the library folders contain video files the server can read."}
              </EmptyDescription>
            )}
          </EmptyHeader>
          {query && (
            <EmptyContent>
              <Button variant="outline" onClick={() => setSearch("")}>
                Clear search
              </Button>
            </EmptyContent>
          )}
        </Empty>
      ) : (
        <>
          <ul className={gridClass}>
            {rows.map((title) => (
              <li key={title.id}>
                <PosterCard title={title} />
              </li>
            ))}
          </ul>
          {titles.hasNextPage && (
            <div className="mt-8 flex justify-center">
              <Button
                variant="outline"
                disabled={titles.isFetchingNextPage}
                onClick={() => void titles.fetchNextPage()}
              >
                {titles.isFetchingNextPage && <Spinner />}
                Show more
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/** Every file, grouped under its folder, for `other` libraries. */
function FolderList() {
  const { libraryId } = Route.useParams()
  const queryClient = useQueryClient()
  const { show } = Route.useSearch()
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

  // Refresh the list once a scan finishes.
  const wasScanning = useRef(false)
  const scanning = library.data?.scanning ?? false
  useEffect(() => {
    if (wasScanning.current && !scanning) {
      void queryClient.invalidateQueries({ queryKey: orpc.media.key() })
      void queryClient.invalidateQueries({
        queryKey: orpc.libraries.list.key(),
      })
    }
    wasScanning.current = scanning
  }, [scanning, queryClient])

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
    label: show ? "Search episodes" : "Search titles",
    sorts: fileSorts,
    sort,
    setSort,
  }

  return (
    <div className="max-w-6xl">
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
      />
      <PhoneControls {...controls} />

      {items.isPending ? (
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
      ) : rows.length === 0 ? (
        <Empty className="py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon" className="mb-4 size-9 [&_svg]:size-5">
              {query ? <SearchXIcon /> : <FolderOpenIcon />}
            </EmptyMedia>
            <EmptyTitle className="text-base font-semibold">
              {query
                ? `No ${show ? "episodes" : "titles"} match “${query}”`
                : "No videos found"}
            </EmptyTitle>
            {!query && (
              <EmptyDescription>
                {scanning
                  ? "The scan is still running."
                  : "Check that the library folders contain video files the server can read."}
              </EmptyDescription>
            )}
          </EmptyHeader>
          {query && (
            <EmptyContent>
              <Button variant="outline" onClick={() => setSearch("")}>
                Clear search
              </Button>
            </EmptyContent>
          )}
        </Empty>
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
            <div className="mt-6 flex justify-center">
              <Button
                variant="outline"
                disabled={items.isFetchingNextPage}
                onClick={() => void items.fetchNextPage()}
              >
                {items.isFetchingNextPage && <Spinner />}
                Show more
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
