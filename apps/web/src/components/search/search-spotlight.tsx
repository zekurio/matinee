import {
  Autocomplete,
  AutocompleteCollection,
  AutocompleteEmpty,
  AutocompleteGroup,
  AutocompleteGroupLabel,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
  AutocompleteStatus,
} from "@matinee/ui/components/autocomplete"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@matinee/ui/components/dialog"
import { Spinner } from "@matinee/ui/components/spinner"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@matinee/ui/components/tooltip"
import { cn } from "@matinee/ui/lib/utils"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import {
  Building2Icon,
  ClapperboardIcon,
  FilmIcon,
  type LucideIcon,
  SearchIcon,
  TagIcon,
  TvIcon,
  UsersRoundIcon,
  XIcon,
} from "lucide-react"
import { type RefObject, useEffect, useRef } from "react"
import { useShallow } from "zustand/shallow"

import { plural } from "@/lib/format"
import { art, present } from "@/lib/media"
import { orpc } from "@/lib/rpc"
import { useSearchSpotlightStore } from "@/stores/search-spotlight"

import { creditLabel, PersonPortrait } from "../credits"
import { Picture, tone } from "../media-item"
import { UserAvatar } from "../user-avatar"
import {
  hitName,
  type SearchHit,
  type SearchSection,
  searchSections,
} from "./search-sections"

// How many of each kind the spotlight lists.
const PER_SECTION = 5
// What the server sends of each kind, enough to fill every library's share.
const FETCH_LIMIT = 30

/** A row in the list: a hit, or the way to every result. */
type Entry = SearchHit | { kind: "all"; id: "all" }

type Group = {
  key: string
  label: string | null
  kind: SearchSection["kind"] | null
  items: Entry[]
}

const sectionIcons = {
  profiles: UsersRoundIcon,
  movies: FilmIcon,
  shows: TvIcon,
  cast: ClapperboardIcon,
  genres: TagIcon,
  studios: Building2Icon,
} satisfies Record<SearchSection["kind"], LucideIcon>

/** What the field says and how screen readers name it. */
const FIELD_LABEL = "Search movies, shows, people, and more"

/**
 * Search as a spotlight: a field over the page that lists what matches as
 * you type, a section for each kind and library, best matches first. The
 * header only holds the button that opens it, and Cmd/Ctrl+K opens it from
 * anywhere in the shell. Mount it once.
 */
export function SearchSpotlight() {
  const { open, setOpen } = useSearchSpotlightStore(
    useShallow((state) => ({ open: state.open, setOpen: state.setOpen })),
  )
  const input = useRef<HTMLInputElement>(null)

  // A shortcut on the whole page opens it, and closes it again.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return
      if (event.key.toLowerCase() !== "k") return
      event.preventDefault()
      useSearchSpotlightStore.getState().toggle()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        initialFocus={input}
        showCloseButton={false}
        className={cn(
          // Pinned near the top rather than centred, so the field stays put
          // while the results grow under it.
          "top-[12vh] flex max-w-[calc(100%-1rem)] translate-y-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-xl",
          "max-sm:top-[calc(env(safe-area-inset-top)+0.5rem)]",
        )}
      >
        <DialogTitle className="sr-only">Search</DialogTitle>
        <SpotlightSearch input={input} onClose={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  )
}

/**
 * The button in the header that opens the spotlight. `className` gives it
 * the look of where it sits.
 */
export function SearchButton({ className }: { className: string }) {
  const setOpen = useSearchSpotlightStore((state) => state.setOpen)
  const mac = isMac()
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label="Search"
            aria-keyshortcuts={mac ? "Meta+K" : "Control+K"}
            onClick={() => setOpen(true)}
            className={className}
          />
        }
      >
        <SearchIcon />
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={8}>
        Search
        <kbd
          data-slot="kbd"
          className="bg-background/15 px-1 font-sans text-[11px] leading-4"
        >
          {mac ? "⌘K" : "Ctrl K"}
        </kbd>
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * The field and its results. Arrow keys move through the rows and Enter
 * opens one; Enter with none picked, or the last row, opens every result.
 */
function SpotlightSearch({
  input,
  onClose,
}: {
  input: RefObject<HTMLInputElement | null>
  onClose: () => void
}) {
  const { query, settled, setQuery, clear } = useSearchSpotlightStore(
    useShallow((state) => ({
      query: state.query,
      settled: state.settled,
      setQuery: state.setQuery,
      clear: state.clear,
    })),
  )
  const navigate = useNavigate()

  const libraries = useQuery(orpc.libraries.list.queryOptions())
  const results = useQuery({
    ...orpc.search.query.queryOptions({
      input: { query: settled, limit: FETCH_LIMIT },
    }),
    enabled: settled !== "",
    // The last results stay up while the next ones load, so typing never
    // empties the list.
    placeholderData: keepPreviousData,
  })
  const trimmed = query.trim()
  const sections =
    trimmed !== "" && results.data
      ? searchSections(results.data, libraries.data ?? [], PER_SECTION)
      : []
  // The sections, then the way to every result, when there's any.
  const groups: Group[] =
    sections.length > 0
      ? [
          ...sections.map((section) => ({ ...section, items: section.hits })),
          {
            key: "all",
            label: null,
            kind: null,
            items: [{ kind: "all", id: "all" }],
          },
        ]
      : []
  // Still typing, or the request is out.
  const pending = results.isFetching || trimmed !== settled

  const showAll = () => {
    if (!trimmed) return
    onClose()
    void navigate({ to: "/search", search: { q: trimmed } })
  }

  return (
    <Autocomplete
      // The list sits in the dialog, not in a popup of its own.
      inline
      open
      items={groups}
      // The server matched them already.
      filter={null}
      value={query}
      onValueChange={(next, details) => {
        // Opening a row goes to its page; the field keeps what was typed.
        if (details.reason === "item-press") return
        setQuery(next)
      }}
      itemToStringValue={(entry: Entry) =>
        entry.kind === "all" ? trimmed : hitName(entry)
      }
    >
      <search className="group/spotlight">
        {/* Enter with no row picked submits, for every result. */}
        <form
          onSubmit={(event) => {
            event.preventDefault()
            showAll()
          }}
          className="flex h-14 items-center gap-2 pr-2 pl-4"
        >
          <SearchIcon
            aria-hidden
            className="text-muted-foreground group-focus-within/spotlight:text-accent size-5 shrink-0 transition-colors"
          />
          <AutocompleteInput
            ref={input}
            aria-label={FIELD_LABEL}
            placeholder={FIELD_LABEL}
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
            // Opening it again selects the last search, so typing replaces it.
            onFocus={(event) => event.currentTarget.select()}
            // 16px keeps iOS from zooming in on focus.
            className="placeholder:text-muted-foreground h-full min-w-0 flex-1 bg-transparent pl-1 text-base outline-none"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              // Keeps the field focused, so typing can go on.
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => {
                clear()
                input.current?.focus()
              }}
              className="focus-visible:ring-ring text-muted-foreground hover:text-foreground grid size-8 shrink-0 place-items-center rounded-full outline-none focus-visible:ring-2 [@media(pointer:coarse)]:size-11"
            >
              <XIcon className="size-4" />
            </button>
          )}
          {/* Esc closes it from a keyboard; touch gets a word to tap. */}
          <DialogClose
            aria-label="Close search"
            className="focus-visible:ring-ring text-muted-foreground hover:text-foreground border-foreground/10 shrink-0 rounded border px-1.5 font-sans text-[11px] leading-5 outline-none focus-visible:ring-2 [@media(pointer:coarse)]:hidden"
          >
            Esc
          </DialogClose>
          <DialogClose className="focus-visible:ring-ring text-foreground/80 hidden h-11 shrink-0 items-center rounded-full px-2 text-[15px] outline-none focus-visible:ring-2 [@media(pointer:coarse)]:inline-flex">
            Cancel
          </DialogClose>
        </form>
      </search>

      {trimmed !== "" && (
        <div className="relative border-t" aria-busy={pending || undefined}>
          {pending && <LoadingBar />}
          <AutocompleteStatus className="empty:hidden">
            {!results.data && pending ? (
              <span className="text-muted-foreground flex items-center gap-2 px-4 py-4 text-sm">
                <Spinner className="size-3.5" />
                Searching…
              </span>
            ) : results.isError && groups.length === 0 ? (
              <span className="text-muted-foreground block px-4 py-4 text-sm">
                The search didn't go through. Try again in a moment.
              </span>
            ) : null}
          </AutocompleteStatus>
          <AutocompleteEmpty className="px-4 py-4">
            {results.data && !pending ? `Nothing matches “${settled}”.` : null}
          </AutocompleteEmpty>
          {groups.length > 0 && (
            <AutocompleteList className="max-h-[min(28rem,60dvh)] p-2">
              {(group: Group) => (
                <AutocompleteGroup key={group.key} items={group.items}>
                  {group.label && group.kind && (
                    <AutocompleteGroupLabel>
                      <SectionIcon kind={group.kind} />
                      {group.label}
                    </AutocompleteGroupLabel>
                  )}
                  <AutocompleteCollection>
                    {(entry: Entry) => (
                      <EntryRow
                        key={entry.id}
                        entry={entry}
                        query={trimmed}
                        onOpen={onClose}
                      />
                    )}
                  </AutocompleteCollection>
                </AutocompleteGroup>
              )}
            </AutocompleteList>
          )}
        </div>
      )}
    </Autocomplete>
  )
}

function SectionIcon({ kind }: { kind: SearchSection["kind"] }) {
  const Icon = sectionIcons[kind]
  return <Icon aria-hidden />
}

/** A row that opens its page: a link, so it also opens in a new tab. */
function EntryRow({
  entry,
  query,
  onOpen,
}: {
  entry: Entry
  query: string
  onOpen: () => void
}) {
  if (entry.kind === "all") {
    return (
      <AutocompleteItem
        value={entry}
        onClick={onOpen}
        render={<Link to="/search" search={{ q: query }} />}
        className="text-muted-foreground data-highlighted:text-foreground mt-1 border-t pt-2"
      >
        <SearchIcon aria-hidden className="mx-2.5" />
        <span className="truncate">Every result for “{query}”</span>
      </AutocompleteItem>
    )
  }
  if (entry.kind === "user") {
    const { user } = entry
    return (
      <AutocompleteItem
        value={entry}
        onClick={onOpen}
        render={
          <Link to="/profiles/$username" params={{ username: user.username }} />
        }
      >
        <UserAvatar user={user} className="size-9 text-xs" />
        <RowText
          name={user.displayName ?? user.username}
          detail={`@${user.username}`}
        />
      </AutocompleteItem>
    )
  }
  if (entry.kind === "person") {
    const { person } = entry
    return (
      <AutocompleteItem
        value={entry}
        onClick={onOpen}
        render={<Link to="/people/$name" params={{ name: person.name }} />}
      >
        <PersonPortrait
          name={person.name}
          photo={person.photo}
          className="size-9 text-xs"
        />
        <RowText
          name={person.name}
          detail={`${creditLabel(person.kind)} · ${plural(person.titleCount, "title")}`}
        />
      </AutocompleteItem>
    )
  }
  if (entry.kind === "genre" || entry.kind === "studio") {
    const { facet } = entry
    const Icon = entry.kind === "genre" ? TagIcon : Building2Icon
    const detail = plural(facet.titleCount, "title")
    const row = (
      <>
        <span
          aria-hidden
          className="text-muted-foreground grid size-9 shrink-0 place-items-center rounded-md border"
        >
          <Icon className="size-4" />
        </span>
        <RowText name={facet.name} detail={detail} />
      </>
    )
    return entry.kind === "genre" ? (
      <AutocompleteItem
        value={entry}
        onClick={onOpen}
        render={<Link to="/genres/$genre" params={{ genre: facet.name }} />}
      >
        {row}
      </AutocompleteItem>
    ) : (
      <AutocompleteItem
        value={entry}
        onClick={onOpen}
        render={<Link to="/studios/$studio" params={{ studio: facet.name }} />}
      >
        {row}
      </AutocompleteItem>
    )
  }
  const { title } = entry
  return (
    <AutocompleteItem
      value={entry}
      onClick={onOpen}
      render={<Link to="/titles/$titleId" params={{ titleId: title.id }} />}
    >
      <span
        aria-hidden
        className={cn(
          "relative block aspect-[2/3] w-9 shrink-0 overflow-hidden rounded-sm border",
          tone(title.id),
        )}
      >
        <Picture sources={present(art(title.images.poster))} />
      </span>
      <RowText
        name={title.name}
        detail={[title.year, title.kind === "show" ? "Show" : "Movie"]
          .filter(Boolean)
          .join(" · ")}
      />
    </AutocompleteItem>
  )
}

function RowText({ name, detail }: { name: string; detail: string }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col">
      <span className="truncate font-medium">{name}</span>
      <span className="text-muted-foreground truncate text-xs">{detail}</span>
    </span>
  )
}

/**
 * A thin bar along the divider while a search is out. The rows already
 * shown stay put, so typing stays calm.
 */
function LoadingBar() {
  return (
    <span
      aria-hidden
      className="bg-accent/70 absolute inset-x-0 -top-px h-0.5 animate-pulse"
    />
  )
}

function isMac() {
  return /mac|iphone|ipad/i.test(globalThis.navigator?.platform ?? "")
}
