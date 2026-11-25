import { cn } from "@matinee/ui/lib/utils"
import type { JSX } from "@solidjs/web"
import { keepPreviousData, useQuery } from "@tanstack/solid-query"
import { useNavigate } from "@tanstack/solid-router"
import { createAutocompleteController } from "@ui-sdk/solid/autocomplete"
import {
  Building2,
  Clapperboard,
  Film,
  Plus,
  Search,
  Tag,
  TvMinimal,
  UsersRound,
  X,
} from "lucide"
import { createEffect, createMemo, createSignal, For, Show } from "solid-js"

import {
  catalogParams,
  catalogSearchOptions,
  type CatalogSummary,
  refKey,
} from "@/components/catalog/catalog-data"
import { askable } from "@/components/catalog/catalog-search"
import { cardLine } from "@/components/catalog/words"
import { creditLabel, PersonPortrait } from "@/components/credits"
import { Picture, tone } from "@/components/picture"
import {
  hitName,
  type SearchHit,
  type SearchSection,
  searchSections,
} from "@/components/search/search-sections"
import { UserAvatar } from "@/components/user-avatar"
import { tr } from "@/i18n"
import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteEmpty,
  AutocompleteGroup,
  AutocompleteGroupLabel,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
  AutocompleteStatus,
} from "@/kit/autocomplete"
import { Icon, type IconNode } from "@/kit/icon"
import { Spinner } from "@/kit/spinner"
import { art, present } from "@/lib/media"
import { orpc } from "@/lib/rpc"
import {
  clearSearch,
  searchFocus,
  searchSettled,
  searchText,
  setSearchText,
} from "@/stores/search"

// How many of each kind the list shows before the way to every result.
const PER_SECTION = 5
// What the server sends of each kind, enough to fill every library's share.
const FETCH_LIMIT = 30
// How many titles from outside the library it lists, after the library's
// own, and when the library has none.
const CATALOG_AFTER = 3
const CATALOG_ALONE = 5

/**
 * A row in the list: a hit, a title no library here has, or the way to
 * every result.
 */
type Entry =
  | SearchHit
  | { kind: "catalog"; id: string; item: CatalogSummary }
  | { kind: "all"; id: "all" }

type GroupKind = SearchSection["kind"] | "catalog"

type Group = {
  key: string
  label: string | null
  kind: GroupKind | null
  items: Entry[]
}

const sectionIcons = {
  profiles: UsersRound,
  movies: Film,
  shows: TvMinimal,
  cast: Clapperboard,
  genres: Tag,
  studios: Building2,
  catalog: Plus,
} satisfies Record<GroupKind, IconNode>

const mac = /mac|iphone|ipad/i.test(globalThis.navigator?.platform ?? "")

/**
 * The desktop bar's search: a field that is always editable, with matches
 * anchored under it as they're typed, a section for each kind and library,
 * best matches first. Cmd/Ctrl+K puts the caret in it from anywhere in the
 * shell, and Enter with no row picked opens every result on the search
 * page. Phones keep their search page instead.
 */
export function SearchField() {
  const navigate = useNavigate()
  const palette = createAutocompleteController()
  const [field, setField] = createSignal<HTMLElement | null>(null)
  let input: HTMLInputElement | undefined

  // A request from the shortcut or the empty search page puts the caret
  // in the field, and reopens what is already found.
  createEffect(
    () => searchFocus(),
    (request) => {
      if (request.ticket === 0) return
      palette.focus()
      input?.select()
      if (request.text.trim() !== "") void palette.open()
    },
  )

  const libraries = useQuery(() => orpc.libraries.list.queryOptions())
  const results = useQuery(() => ({
    ...orpc.search.query.queryOptions({
      input: { query: searchSettled(), limit: FETCH_LIMIT },
    }),
    enabled: searchSettled() !== "",
    // The last results stay up while the next ones load, so typing never
    // empties the list.
    placeholderData: keepPreviousData,
  }))
  // Titles no library here has, which never hold up the library's.
  const catalog = useQuery(() => ({
    ...catalogSearchOptions(searchSettled()),
    enabled: searchSettled() !== "",
    placeholderData: keepPreviousData,
  }))
  const trimmed = () => searchText().trim()
  const found = () => (results.isSuccess ? results.data : undefined)
  const groups = createMemo((): Group[] => {
    const data = found()
    if (trimmed() === "" || !data) return []
    const sections = searchSections(
      data,
      libraries.isSuccess ? libraries.data : [],
      PER_SECTION,
    )
    const elsewhere = askable(catalog.isSuccess ? catalog.data.items : [])
      .slice(0, sections.length > 0 ? CATALOG_AFTER : CATALOG_ALONE)
      .map((item): Entry => ({ kind: "catalog", id: refKey(item.ref), item }))
    if (sections.length === 0 && elsewhere.length === 0) return []
    // The sections, the catalog's titles, then the way to every result.
    return [
      ...sections.map((section) => ({ ...section, items: section.hits })),
      ...(elsewhere.length > 0
        ? [
            {
              key: "catalog",
              label: tr("catalog.notHere"),
              kind: "catalog" as const,
              items: elsewhere,
            },
          ]
        : []),
      {
        key: "all",
        label: null,
        kind: null,
        items: [{ kind: "all", id: "all" }],
      },
    ]
  })
  // Still typing, or the request is out. `fetchStatus` rather than
  // `isFetching`, which also waits on the data, and a query that's off
  // until something is typed has none to wait for.
  const pending = () =>
    results.fetchStatus === "fetching" || trimmed() !== searchSettled()

  const showAll = (value: string) => {
    const query = value.trim()
    if (!query) return
    void navigate({ to: "/search", search: { q: query } })
  }

  // What a row leads to, looked up from the value a press reports.
  const entries = createMemo(() => {
    const byId = new Map<string, Entry>()
    for (const group of groups()) {
      for (const entry of group.items) byId.set(entry.id, entry)
    }
    return byId
  })
  const openEntry = (entry: Entry) => {
    switch (entry.kind) {
      case "all":
        showAll(trimmed())
        return
      case "catalog":
        void navigate({
          to: "/catalog/$kind/$provider/$providerId",
          params: catalogParams(entry.item.ref),
        })
        return
      case "user":
        void navigate({
          to: "/profiles/$username",
          params: { username: entry.user.username },
        })
        return
      case "person":
        void navigate({
          to: "/people/$name",
          params: { name: entry.person.name },
        })
        return
      case "genre":
        void navigate({
          to: "/genres/$genre",
          params: { genre: entry.facet.name },
        })
        return
      case "studio":
        void navigate({
          to: "/studios/$studio",
          params: { studio: entry.facet.name },
        })
        return
      case "title":
        void navigate({
          to: "/titles/$titleId",
          params: { titleId: entry.title.id },
        })
        return
    }
  }

  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault()
        showAll(searchText())
      }}
      class="w-full max-w-[30rem]"
    >
      <Autocomplete
        controller={palette}
        value={searchText()}
        onValueChange={(next, details) => {
          // A row goes to its page; the field keeps what was typed.
          if (details.reason === "item-press") {
            const entry =
              details.item === undefined
                ? undefined
                : entries().get(details.item.value)
            if (entry) openEntry(entry)
            details.cancel()
            return
          }
          setSearchText(next)
        }}
        // The server matched them already, and ranked them.
        filter={false}
        // Coming back to a search shows its matches again.
        openOnFocus={trimmed() !== ""}
        // Nothing is picked until an arrow key, so Enter opens every result.
        autoHighlight={false}
        status={pending() ? "loading" : results.isError ? "error" : "idle"}
        onSubmit={(value, details) => {
          details.event?.preventDefault()
          showAll(value)
        }}
      >
        <div
          ref={(element) => setField(element)}
          onPointerDown={(event) => {
            if (!(event.target instanceof Element)) return
            if (event.target === input || event.target.closest("button")) return
            event.preventDefault()
            input?.focus()
          }}
          class="group/search border-foreground/12 bg-foreground/[0.06] text-foreground focus-within:border-foreground/25 focus-within:bg-foreground/[0.08] focus-within:outline-ring flex h-10 w-full min-w-0 items-center gap-2.5 rounded-full border pr-2 pl-3.5 text-sm transition-colors outline-none focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-solid motion-reduce:transition-none"
        >
          <Icon
            icon={Search}
            aria-hidden="true"
            class="text-muted-foreground size-[18px] shrink-0"
          />
          <AutocompleteInput
            ref={(element: HTMLInputElement) => (input = element)}
            aria-label={tr("search.field")}
            aria-keyshortcuts={mac ? "Meta+K" : "Control+K"}
            placeholder={tr("search.field")}
            autocomplete="off"
            spellcheck={false}
            enterkeyhint="search"
            // 16px keeps iOS from zooming in on focus.
            class="placeholder:text-muted-foreground h-full min-w-0 flex-1 bg-transparent text-base outline-none"
          />
          <Show
            when={searchText()}
            fallback={
              <kbd
                aria-hidden="true"
                class="border-foreground/10 bg-background/60 text-11px text-muted-foreground shrink-0 rounded-md border px-1.5 font-sans font-medium max-md:hidden"
              >
                {mac ? "⌘K" : tr("search.shortcut")}
              </kbd>
            }
          >
            <button
              type="button"
              aria-label={tr("search.clear")}
              // Keeps the field focused, so typing can go on.
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => {
                clearSearch()
                void palette.close()
                input?.focus()
              }}
              class="focus-visible:ring-ring text-muted-foreground hover:text-foreground hover:bg-foreground/10 grid size-6 shrink-0 place-items-center rounded-md transition-colors outline-none focus-visible:ring-2"
            >
              <Icon icon={X} class="size-3.5" />
            </button>
          </Show>
        </div>

        <AutocompleteContent
          anchor={field()}
          side="bottom"
          sideOffset={8}
          collisionPadding={8}
          class="p-0"
          // A results table needs a calmer surface than a one-line menu.
          style={{
            "background-color": "var(--popover)",
            "backdrop-filter": "none",
          }}
        >
          <div
            class="relative flex flex-col"
            aria-busy={pending() ? "true" : undefined}
          >
            <Show when={pending()}>
              <LoadingBar />
            </Show>
            <AutocompleteStatus class="empty:hidden">
              <Show
                when={!found() && pending()}
                fallback={
                  <Show when={results.isError && groups().length === 0}>
                    <span class="text-muted-foreground block px-3 py-3 text-sm">
                      {tr("search.failed")}
                    </span>
                  </Show>
                }
              >
                <span class="text-muted-foreground flex items-center gap-2 px-3 py-3 text-sm">
                  <Spinner class="size-3.5" />
                  {tr("search.searching")}
                </span>
              </Show>
            </AutocompleteStatus>
            <AutocompleteEmpty class="px-3 py-3 text-sm empty:hidden">
              <Show
                when={
                  trimmed() !== "" &&
                  found() &&
                  groups().length === 0 &&
                  !pending() &&
                  catalog.fetchStatus !== "fetching"
                }
              >
                {tr("search.noMatch", { query: searchSettled() })}
              </Show>
            </AutocompleteEmpty>
            <AutocompleteList
              class={cn(
                "max-h-[min(28rem,calc(100dvh-6rem))] scroll-py-1 overflow-y-auto overscroll-contain p-1 outline-none",
                { hidden: groups().length === 0 },
              )}
            >
              <For each={groups()} keyed={(group) => group.key}>
                {(group) => (
                  <AutocompleteGroup class="not-last:mb-1">
                    <Show when={group().label ? group().kind : null}>
                      {(kind) => (
                        <AutocompleteGroupLabel>
                          <Icon
                            icon={sectionIcons[kind()]}
                            aria-hidden="true"
                          />
                          {group().label}
                        </AutocompleteGroupLabel>
                      )}
                    </Show>
                    <For each={group().items} keyed={(entry) => entry.id}>
                      {(entry) => (
                        <EntryRow entry={entry()} query={trimmed()} />
                      )}
                    </For>
                  </AutocompleteGroup>
                )}
              </For>
            </AutocompleteList>
          </div>
        </AutocompleteContent>
      </Autocomplete>
    </form>
  )
}

/**
 * A row that opens its page. A new entry for the same row, from the next
 * results, draws it again.
 */
function EntryRow(props: { entry: Entry; query: string }) {
  return (
    <Show when={props.entry} keyed>
      {(entry) => entryRow(entry, () => props.query)}
    </Show>
  )
}

function entryRow(entry: Entry, query: () => string): JSX.Element {
  switch (entry.kind) {
    case "all":
      return (
        <AutocompleteItem
          value="all"
          label={tr("search.everyResult", { query: query() })}
          class="text-muted-foreground data-highlighted:text-foreground mt-1 border-t pt-2"
        >
          <Icon icon={Search} aria-hidden="true" class="mx-2.5 size-4" />
          <span class="truncate">
            {tr("search.everyResult", { query: query() })}
          </span>
        </AutocompleteItem>
      )
    case "catalog":
      return (
        <AutocompleteItem value={entry.id} label={entry.item.name}>
          <Poster tone={entry.id} poster={entry.item.poster} />
          <RowText
            name={entry.item.name}
            detail={cardLine(entry.item, entry.item.availability)}
          />
        </AutocompleteItem>
      )
    case "user":
      return (
        <AutocompleteItem value={entry.id} label={hitName(entry)}>
          <UserAvatar user={entry.user} class="size-9 text-xs" />
          <RowText name={hitName(entry)} detail={`@${entry.user.username}`} />
        </AutocompleteItem>
      )
    case "person":
      return (
        <AutocompleteItem value={entry.id} label={entry.person.name}>
          <PersonPortrait
            name={entry.person.name}
            photo={entry.person.photo}
            class="size-9 text-xs"
          />
          <RowText
            name={entry.person.name}
            detail={`${creditLabel(entry.person.kind)} · ${tr("search.titles", { count: entry.person.titleCount })}`}
          />
        </AutocompleteItem>
      )
    case "genre":
      return (
        <AutocompleteItem value={entry.id} label={entry.facet.name}>
          <FacetRow
            icon={Tag}
            name={entry.facet.name}
            count={entry.facet.titleCount}
          />
        </AutocompleteItem>
      )
    case "studio":
      return (
        <AutocompleteItem value={entry.id} label={entry.facet.name}>
          <FacetRow
            icon={Building2}
            name={entry.facet.name}
            count={entry.facet.titleCount}
          />
        </AutocompleteItem>
      )
    case "title":
      return (
        <AutocompleteItem value={entry.id} label={entry.title.name}>
          <Poster tone={entry.title.id} poster={entry.title.images.poster} />
          <RowText
            name={entry.title.name}
            detail={[entry.title.year, tr(`search.kind.${entry.title.kind}`)]
              .filter(Boolean)
              .join(" · ")}
          />
        </AutocompleteItem>
      )
  }
}

function Poster(props: {
  tone: string
  poster: Parameters<typeof art>[0]
}): JSX.Element {
  return (
    <span
      aria-hidden="true"
      class={cn(
        "relative block aspect-[2/3] w-9 shrink-0 overflow-hidden rounded-sm border",
        tone(props.tone),
      )}
    >
      <Picture sources={present(art(props.poster))} />
    </span>
  )
}

function FacetRow(props: { icon: IconNode; name: string; count: number }) {
  return (
    <>
      <span
        aria-hidden="true"
        class="text-muted-foreground grid size-9 shrink-0 place-items-center rounded-md border"
      >
        <Icon icon={props.icon} class="size-4" />
      </span>
      <RowText
        name={props.name}
        detail={tr("search.titles", { count: props.count })}
      />
    </>
  )
}

function RowText(props: { name: string; detail: string }) {
  return (
    <span class="flex min-w-0 flex-1 flex-col">
      <span class="truncate font-medium">{props.name}</span>
      <span class="text-muted-foreground truncate text-xs">{props.detail}</span>
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
      aria-hidden="true"
      class="bg-accent/70 absolute inset-x-0 top-0 h-0.5 animate-pulse"
    />
  )
}
