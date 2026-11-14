import type { AdminRequestItem } from "@matinee/contracts"
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
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@matinee/ui/components/popover"
import { Skeleton } from "@matinee/ui/components/skeleton"
import { toast } from "@matinee/ui/components/sonner"
import { useMediaQuery } from "@matinee/ui/hooks/use-media-query"
import { cn } from "@matinee/ui/lib/utils"
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
} from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import {
  CableIcon,
  CheckCheckIcon,
  InboxIcon,
  KeyboardIcon,
  RefreshCwIcon,
  SearchIcon,
  SearchXIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react"
import { type ReactNode, useEffect, useRef, useState } from "react"

import { chipClass, chipRow } from "@/components/chips"
import { ShowMore } from "@/components/library/library-states"
import { PageHeader, useDocumentTitle } from "@/components/page-header"
import { ConfirmDialog } from "@/components/settings/user-dialogs"
import { tr } from "@/i18n"
import { formatCount } from "@/lib/format"
import { client, errorMessage, orpc, queryClient } from "@/lib/rpc"
import { useOpenSettings } from "@/lib/settings"
import {
  useHiddenRequests,
  useRequestActionsStore,
  useSendHeldOnLeave,
} from "@/stores/request-actions"

import type { Answer } from "./decline-popover"
import { Key, KeyTip } from "./key-tip"
import {
  addAction,
  askers,
  formatNames,
  type QueueList,
  QUEUE_LISTS,
  titleLink,
  useRequestQueue,
} from "./request-queue"
import { RequestRow } from "./request-row"

/** Rows of Done a page of it brings. */
const DONE_PAGE = 40

// The pause in typing before Done's search goes out.
const DEBOUNCE_MS = 250

/** A key press the queue shouldn't take: typing, or inside a popup. */
function ignoredKey(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey)
    return true
  const target = event.target
  if (!(target instanceof Element)) return false
  if (
    target.closest(
      "input, textarea, select, [contenteditable=''], [contenteditable='true']",
    )
  )
    return true
  return (
    target.closest(
      "[role=dialog], [role=alertdialog], [role=menu], [role=listbox], [data-slot=popover-content]",
    ) !== null
  )
}

export function QueuePage({
  list,
  query,
  onList,
  onQuery,
}: {
  list: QueueList
  query: string | undefined
  onList: (list: QueueList) => void
  onQuery: (query: string | undefined) => void
}) {
  useDocumentTitle(tr("requests.title"))
  const queue = useRequestQueue()
  const connections = useQuery(orpc.admin.fulfilment.connections.queryOptions())
  const hidden = useHiddenRequests()
  const hold = useRequestActionsStore((state) => state.hold)
  const navigate = useNavigate()
  const openSettings = useOpenSettings()
  // Shortcuts are listed unless the screen is touch first. A browser that
  // reports no pointer at all, as some keyboard setups do, still gets them.
  const keyboard = !useMediaQuery("(pointer: coarse)")

  // Held actions go out as the page is left, not when their toast ends.
  useSendHeldOnLeave()

  const done = useInfiniteQuery(
    orpc.admin.requests.queue.infiniteOptions({
      input: (cursor: string | undefined) => ({
        limit: DONE_PAGE,
        cursor,
        query,
      }),
      initialPageParam: undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
      placeholderData: keepPreviousData,
      enabled: list === "done",
    }),
  )

  // Done is read page by page, not followed. The stream carries its count
  // and its latest row, so when either changes, as when a title arrives,
  // the pages already open load again.
  const doneMark = queue.data
    ? `${queue.data.counts.done} ${queue.data.done[0]?.id ?? ""}`
    : null
  const seenDoneMark = useRef(doneMark)
  useEffect(() => {
    if (doneMark === null || doneMark === seenDoneMark.current) return
    const first = seenDoneMark.current === null
    seenDoneMark.current = doneMark
    if (!first) {
      void queryClient.invalidateQueries({
        queryKey: orpc.admin.requests.queue.key(),
      })
    }
  }, [doneMark])

  const rows: AdminRequestItem[] =
    list === "done"
      ? (done.data?.pages.flatMap((page) => page.done) ?? [])
      : (queue.data?.[list] ?? [])
  const visible = rows.filter((item) => !hidden.has(item.id))
  const waiting = (queue.data?.waiting ?? []).filter(
    (item) => !hidden.has(item.id),
  )

  // The row J and K are on. Kept by id, with its place for when it goes.
  const [active, setActive] = useState<{ id: string | null; index: number }>({
    id: null,
    index: 0,
  })
  const found = visible.findIndex((item) => item.id === active.id)
  const activeIndex =
    found >= 0 ? found : Math.min(active.index, visible.length - 1)
  const activeItem = visible[activeIndex]
  const [declining, setDeclining] = useState<string | null>(null)
  const [removing, setRemoving] = useState<AdminRequestItem | null>(null)
  const rowRefs = useRef(new Map<string, HTMLElement>())
  const listRef = useRef<HTMLUListElement>(null)
  const chipsRef = useRef<HTMLDivElement>(null)
  // Where focus goes once a decline closes its popover: the row that takes
  // the declined one's place. Null while no decline was sent, so a popover
  // closed without one hands focus back to its button.
  const afterDecline = useRef<HTMLElement | null>(null)

  const focusRow = (index: number) => {
    const item = visible[index]
    if (!item) return
    setActive({ id: item.id, index })
    rowRefs.current.get(item.id)?.focus()
  }
  /** The row after `index` once it collapses, or before it at the end. */
  const neighbour = (index: number) => visible[index + 1] ?? visible[index - 1]
  /**
   * Moves J and K on from a row that's leaving, and returns what focus
   * should go to: the next row, or with none left, the list's chip.
   */
  const moveOn = (index: number): HTMLElement | null => {
    const next = neighbour(index)
    if (next) {
      setActive({ id: next.id, index })
      return rowRefs.current.get(next.id) ?? null
    }
    return (
      chipsRef.current?.querySelector<HTMLElement>("[aria-pressed=true]") ??
      null
    )
  }

  const add = (item: AdminRequestItem, index: number) => {
    hold(addAction([item]))
    moveOn(index)?.focus()
  }
  const answer = (item: AdminRequestItem, index: number, why: Answer) => {
    const next = moveOn(index)
    afterDecline.current = next
    setDeclining(null)
    hold({ ...why, ids: [item.id], names: [item.title.name] })
  }
  const reopen = (
    item: AdminRequestItem,
    index: number,
    kind: "allowAgain" | "addAfterAll",
  ) => {
    hold({ kind, ids: [item.id], names: [item.title.name] })
    moveOn(index)?.focus()
  }
  const addAll = () => {
    if (waiting.length === 0) return
    hold(addAction(waiting))
    // The button goes with the rows, so focus waits on the list's chip.
    chipsRef.current?.querySelector<HTMLElement>("[aria-pressed=true]")?.focus()
  }
  const undo = () => {
    const action = useRequestActionsStore.getState().undo()
    const id = action?.ids[0]
    if (!id) return
    setActive({ id, index: activeIndex })
    // Back in the list on the next frame, once it's no longer inert.
    requestAnimationFrame(() => rowRefs.current.get(id)?.focus())
  }

  const retry = useMutation({
    mutationFn: (item: AdminRequestItem) =>
      client.admin.requests.retry({ id: item.id }),
    onSuccess: (_result, item) =>
      toast.success(tr("requests.retried", { name: item.title.name })),
    onError: (error, item) =>
      toast.error(tr("requests.retryFailed", { name: item.title.name }), {
        description: errorMessage(error),
      }),
  })
  const remove = useMutation({
    mutationFn: (item: AdminRequestItem) =>
      client.requests.cancel({ id: item.id }),
    onSuccess: async (_result, item) => {
      setRemoving(null)
      toast.success(tr("requests.removed", { name: item.title.name }))
      await queryClient.invalidateQueries({
        queryKey: orpc.admin.requests.queue.key(),
      })
    },
    onError: (error) =>
      toast.error(tr("requests.removeFailed"), {
        description: errorMessage(error),
      }),
  })

  // The queue's keys, for the whole page while it's open.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (ignoredKey(event)) return
      const inList =
        document.activeElement instanceof Element &&
        listRef.current?.contains(document.activeElement)
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
      if (key === "u") {
        event.preventDefault()
        undo()
        return
      }
      if (!activeItem) return
      if (key === "j" || (inList && key === "ArrowDown")) {
        event.preventDefault()
        focusRow(
          inList ? Math.min(activeIndex + 1, visible.length - 1) : activeIndex,
        )
      } else if (key === "k" || (inList && key === "ArrowUp")) {
        event.preventDefault()
        focusRow(inList ? Math.max(activeIndex - 1, 0) : activeIndex)
      } else if (key === "a" && event.shiftKey && list === "waiting") {
        event.preventDefault()
        addAll()
      } else if (key === "a" && list === "waiting") {
        event.preventDefault()
        add(activeItem, activeIndex)
      } else if (key === "d" && list === "waiting") {
        event.preventDefault()
        afterDecline.current = null
        setDeclining(activeItem.id)
      } else if (
        key === "g" &&
        (list === "needsAttention" || list === "onTheWay")
      ) {
        event.preventDefault()
        afterDecline.current = null
        setDeclining(activeItem.id)
      } else if (key === "r" && list === "needsAttention") {
        event.preventDefault()
        retry.mutate(activeItem)
      } else if (
        key === "Enter" &&
        event.target === rowRefs.current.get(activeItem.id)
      ) {
        event.preventDefault()
        void navigate(titleLink(activeItem))
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  })

  const counts = queue.data?.counts
  const countOf = (entry: QueueList) => {
    if (!counts || entry === "done") return null
    if (entry === "waiting") return waiting.length
    return counts[entry]
  }
  const noConnection = connections.data?.length === 0

  const addAllButton = (size: "sm" | "default") =>
    list === "waiting" && waiting.length > 1 ? (
      <KeyTip label={tr("requests.keys.addAll")} keys="Shift A">
        <Button
          variant="outline"
          size={size}
          aria-keyshortcuts="Shift+A"
          onClick={addAll}
        >
          <CheckCheckIcon />
          {tr("requests.addAll", { count: waiting.length })}
        </Button>
      </KeyTip>
    ) : null

  // Done keeps room for a declined row's buttons in every row, so its
  // columns line up.
  const reserveReopen =
    list === "done" && visible.some((item) => item.status === "declined")

  let body: ReactNode
  const loading = list === "done" ? done.isPending : queue.isPending
  const error = list === "done" ? done.error : queue.data ? null : queue.error
  if (loading && !error) {
    body = <QueueSkeleton />
  } else if (error) {
    body = (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3">
        <p className="text-muted-foreground text-sm">
          {tr("requests.loadFailed", { error: errorMessage(error) })}
        </p>
        <Button
          variant="outline"
          onClick={() =>
            void (list === "done" ? done.refetch() : queue.refetch())
          }
        >
          <RefreshCwIcon />
          {tr("requests.reload")}
        </Button>
      </div>
    )
  } else if (visible.length === 0 && noConnection && list !== "done") {
    body = (
      <QueueEmpty
        icon={<CableIcon />}
        title={tr("requests.empty.setup.title")}
        description={tr("requests.empty.setup.description")}
        action={
          <Button variant="outline" onClick={() => openSettings("requests")}>
            {tr("requests.empty.setup.action")}
          </Button>
        }
      />
    )
  } else if (visible.length === 0) {
    body =
      list === "done" && query ? (
        <QueueEmpty
          icon={<SearchXIcon />}
          title={tr("requests.done.noMatch", { query })}
          action={
            <Button variant="outline" onClick={() => onQuery(undefined)}>
              {tr("requests.done.clearSearch")}
            </Button>
          }
        />
      ) : (
        <QueueEmpty icon={<InboxIcon />} title={tr(`requests.empty.${list}`)} />
      )
  } else {
    body = (
      <div className="bg-foreground/[0.02] overflow-hidden rounded-xl border">
        <ul
          ref={listRef}
          aria-label={tr(`requests.list.${list}`)}
          className="-mb-px flex flex-col"
        >
          {rows.map((item) => {
            const index = visible.indexOf(item)
            return (
              <RequestRow
                key={item.id}
                item={item}
                list={list}
                collapsed={index < 0}
                focusable={index === activeIndex}
                reserveReopen={reserveReopen}
                rowRef={(element) => {
                  if (element) rowRefs.current.set(item.id, element)
                  else rowRefs.current.delete(item.id)
                }}
                declineOpen={declining === item.id}
                onDeclineOpenChange={(open) => {
                  if (open) afterDecline.current = null
                  setDeclining(open ? item.id : null)
                }}
                // After a decline, focus moves on once the popover is gone,
                // not as it starts to close: the popover would pick the
                // row's first button, as the row isn't in the tab order yet.
                declineFinalFocus={() => afterDecline.current === null}
                onDeclineClosed={() => {
                  afterDecline.current?.focus()
                  afterDecline.current = null
                }}
                onFocusRow={() => setActive({ id: item.id, index })}
                onAdd={() => add(item, index)}
                onAnswer={(why) => answer(item, index, why)}
                onRetry={() => retry.mutate(item)}
                onReopen={(kind) => reopen(item, index, kind)}
                onRemove={() => setRemoving(item)}
              />
            )
          })}
        </ul>
      </div>
    )
  }

  return (
    <div className="flex flex-col pb-6">
      {/* As the statistics page has it: the lists and the page's actions
          beside the title. Phones keep the header as the page's bar, so
          the lists go under it. */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-x-8 gap-y-4 max-sm:contents">
        <PageHeader
          title={tr("requests.title")}
          phoneActions={addAllButton("sm")}
          className="mb-0 md:mb-0"
        />
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-3 max-sm:mb-4">
          <div
            ref={chipsRef}
            role="group"
            aria-label={tr("requests.lists")}
            className={chipRow}
          >
            {QUEUE_LISTS.map((entry) => {
              const selected = entry === list
              const count = countOf(entry)
              return (
                <button
                  key={entry}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    setActive({ id: null, index: 0 })
                    onList(entry)
                  }}
                  className={chipClass(selected, "gap-1.5")}
                >
                  {tr(`requests.list.${entry}`)}
                  {count !== null && count > 0 && (
                    <span
                      className={cn(
                        "tabular-nums",
                        selected
                          ? "text-background/70"
                          : entry === "needsAttention"
                            ? "text-warning"
                            : "text-muted-foreground",
                      )}
                    >
                      {formatCount(count)}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          {list === "done" && <DoneSearch query={query} onQuery={onQuery} />}
          <div className="flex items-center gap-1 max-sm:hidden">
            {addAllButton("default")}
            {keyboard && <KeysButton list={list} />}
          </div>
        </div>
      </div>

      {noConnection && visible.length > 0 && list !== "done" && (
        <p className="text-muted-foreground mb-3 flex items-center gap-1.5 text-[13px]">
          <TriangleAlertIcon
            aria-hidden
            className="text-warning size-3.5 shrink-0"
          />
          {tr("requests.empty.setup.title")}
          <button
            type="button"
            className="text-foreground focus-visible:ring-ring ml-1 rounded-sm underline-offset-4 outline-none hover:underline focus-visible:ring-2"
            onClick={() => openSettings("requests")}
          >
            {tr("requests.empty.setup.action")}
          </button>
        </p>
      )}

      {body}

      {list === "done" && done.hasNextPage && (
        <ShowMore
          fetching={done.isFetchingNextPage}
          failed={done.isFetchNextPageError}
          onClick={() => void done.fetchNextPage()}
          className="mt-6"
        />
      )}

      <ConfirmDialog
        open={removing !== null}
        title={tr("requests.remove.title", {
          name: removing?.title.name ?? "",
        })}
        description={
          removing && askers(removing).first
            ? tr("requests.remove.description", {
                names: formatNames(
                  removing.followers.filter((f) => f.asked).map((f) => f.name),
                ),
              })
            : tr("requests.remove.descriptionNobody")
        }
        confirmLabel={tr("requests.remove.confirm")}
        destructive
        pending={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing)}
        onClose={() => setRemoving(null)}
      />
    </div>
  )
}

/** Searches Done, as a library's search box searches it. */
function DoneSearch({
  query,
  onQuery,
}: {
  query: string | undefined
  onQuery: (query: string | undefined) => void
}) {
  const [text, setText] = useState(query ?? "")
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  // A query from outside, like Back, replaces what's in the field. One
  // that came from typing here already matches it.
  const [seen, setSeen] = useState(query)
  if (query !== seen) {
    setSeen(query)
    if ((query ?? "") !== text.trim()) setText(query ?? "")
  }
  const change = (next: string, wait = DEBOUNCE_MS) => {
    setText(next)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => onQuery(next.trim() || undefined), wait)
  }
  return (
    <div className="relative w-full sm:w-72">
      <SearchIcon
        aria-hidden
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
      />
      <Input
        type="search"
        value={text}
        aria-label={tr("requests.done.search")}
        placeholder={tr("requests.done.search")}
        className="px-8 [&::-webkit-search-cancel-button]:appearance-none"
        onChange={(event) => change(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && text) change("", 0)
        }}
      />
      {text && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={tr("requests.done.clearSearch")}
          className="absolute top-1/2 right-1 -translate-y-1/2 [@media(pointer:coarse)]:size-11"
          onClick={() => change("", 0)}
        >
          <XIcon />
        </Button>
      )}
    </div>
  )
}

/** Nothing to list, as a library with nothing in it says so. */
function QueueEmpty({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <Empty className="py-16">
      <EmptyHeader>
        <EmptyMedia variant="icon" className="mb-4 size-9 [&_svg]:size-5">
          {icon}
        </EmptyMedia>
        <EmptyTitle className="text-base font-semibold">{title}</EmptyTitle>
        {description && <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  )
}

function QueueSkeleton() {
  return (
    <div className="divide-y overflow-hidden rounded-xl border">
      {[0, 1, 2, 3, 4].map((index) => (
        <div key={index} className="flex items-center gap-4 px-4 py-1.5">
          <Skeleton className="aspect-[2/3] w-8 rounded-[4px]" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-48 max-w-full" />
            <Skeleton className="h-3 w-24 max-w-full" />
          </div>
        </div>
      ))}
    </div>
  )
}

/** The queue's keys, behind a button rather than on a line of their own. */
function KeysButton({ list }: { list: QueueList }) {
  const keys: { keys: string[]; label: string }[] = [
    { keys: ["J", "K"], label: tr("requests.keys.move") },
    { keys: ["Enter"], label: tr("requests.keys.open") },
  ]
  if (list === "waiting") {
    keys.push(
      { keys: ["A"], label: tr("requests.keys.add") },
      { keys: ["Shift", "A"], label: tr("requests.keys.addAll") },
      { keys: ["D"], label: tr("requests.keys.decline") },
    )
  }
  if (list === "needsAttention" || list === "onTheWay") {
    keys.push({ keys: ["G"], label: tr("requests.keys.giveUp") })
  }
  if (list === "needsAttention") {
    keys.push({ keys: ["R"], label: tr("requests.retry") })
  }
  keys.push({ keys: ["U"], label: tr("requests.keys.undo") })
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={tr("requests.keys")}
            className="text-muted-foreground hover:text-foreground data-popup-open:text-foreground"
          />
        }
      >
        <KeyboardIcon />
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} className="w-60 gap-0 p-0">
        <PopoverHeader>
          <PopoverTitle className="font-semibold">
            {tr("requests.keys")}
          </PopoverTitle>
        </PopoverHeader>
        <dl className="flex flex-col gap-2 p-3 text-[13px]">
          {keys.map((entry) => (
            <div
              key={entry.label}
              className="flex items-center justify-between gap-3"
            >
              <dt className="text-foreground/85">{entry.label}</dt>
              <dd className="flex gap-1">
                {entry.keys.map((key) => (
                  <Key key={key}>{key}</Key>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </PopoverContent>
    </Popover>
  )
}
