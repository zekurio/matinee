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
import { toast } from "@matinee/ui/components/sonner"
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
} from "@tanstack/react-query"
import { getRouteApi, useNavigate } from "@tanstack/react-router"
import {
  CableIcon,
  CheckCheckIcon,
  FilterIcon,
  InboxIcon,
  RefreshCwIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { type ReactNode, useEffect, useRef, useState } from "react"

import { ShowMore } from "@/components/library/library-states"
import { PageHeader, useDocumentTitle } from "@/components/page-header"
import { ConfirmDialog } from "@/components/settings/user-dialogs"
import { tr } from "@/i18n"
import { client, errorMessage, orpc, queryClient } from "@/lib/rpc"
import { useOpenSettings } from "@/lib/settings"
import {
  isHidden,
  useHiddenRequests,
  useRequestActionsStore,
  useSendHeldOnLeave,
} from "@/stores/request-actions"

import type { Answer } from "./decline-popover"
import { KeyTip } from "./key-tip"
import { QueueCard, type Reopen } from "./queue-card"
import { RequestCardSkeleton, requestGrid } from "./request-card"
import {
  filterCount,
  type RequestFilter,
  RequestFilterPanel,
  requestFilter,
  searchFor,
} from "./request-filter"
import {
  addAction,
  askers,
  filterInput,
  formatNames,
  titleLink,
  useRequestQueue,
  workItems,
} from "./request-queue"

const route = getRouteApi("/_authed/_shell/requests")

/** Cards of done a page of it brings. */
const DONE_PAGE = 40

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

/**
 * Everyone's requests in one list, as the server orders its lists:
 * waiting, needs attention, on the way, then done, which loads more as
 * it's read. The Filter panel keeps it to some states or one kind, which
 * the server does, so done pages the same. Each card shows its state and
 * what that state lets an admin do, and the keys act on the focused card
 * by its own state.
 */
export function QueuePage() {
  useDocumentTitle(tr("requests.title"))
  const navigate = useNavigate()
  const filter = requestFilter(route.useSearch())
  const setFilter = (next: RequestFilter) =>
    void navigate({ to: ".", search: searchFor(next), replace: true })
  const filtered = filterCount(filter) > 0
  const queue = useRequestQueue(true, filter)
  const connections = useQuery(orpc.admin.fulfilment.connections.queryOptions())
  const hidden = useHiddenRequests()
  const hold = useRequestActionsStore((state) => state.hold)
  const openSettings = useOpenSettings()

  // Held actions go out as the page is left, not when their toast ends.
  useSendHeldOnLeave()

  const done = useInfiniteQuery(
    orpc.admin.requests.queue.infiniteOptions({
      input: (cursor: string | undefined) => ({
        limit: DONE_PAGE,
        cursor,
        ...filterInput(filter),
      }),
      initialPageParam: undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
      placeholderData: keepPreviousData,
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

  // Until its pages come, done is what the stream carries of it.
  const doneItems =
    done.data?.pages.flatMap((page) => page.done) ?? queue.data?.done ?? []
  const work = queue.data ? workItems(queue.data) : []
  // An id once: a request that moved on between the stream and a page
  // shows where the stream has it.
  const seen = new Set(work.map((item) => item.id))
  const rows = [...work, ...doneItems.filter((item) => !seen.has(item.id))]
  const visible = rows.filter((item) => !isHidden(hidden, item))
  const waiting = visible.filter((item) => item.state === "waiting")

  // The card J and K are on. Kept by id, with its place for when it goes.
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
  const cardRefs = useRef(new Map<string, HTMLElement>())
  const listRef = useRef<HTMLUListElement>(null)
  // Where focus waits once no card is left to take it.
  const topRef = useRef<HTMLDivElement>(null)
  // Where focus goes once a decline closes its popover: the card that
  // takes the declined one's place. Null while no decline was sent, so a
  // popover closed without one hands focus back to its button.
  const afterDecline = useRef<HTMLElement | null>(null)

  const focusCard = (index: number) => {
    const item = visible[index]
    if (!item) return
    setActive({ id: item.id, index })
    cardRefs.current.get(item.id)?.focus()
  }
  /** The card after `index` once it goes, or before it at the end. */
  const neighbour = (index: number) => visible[index + 1] ?? visible[index - 1]
  /**
   * Moves J and K on from a card that's leaving, and returns what focus
   * should go to: the next card, or with none left, the list's place.
   */
  const moveOn = (index: number): HTMLElement | null => {
    const next = neighbour(index)
    if (next) {
      setActive({ id: next.id, index })
      return cardRefs.current.get(next.id) ?? null
    }
    return topRef.current
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
  const reopen = (item: AdminRequestItem, index: number, kind: Reopen) => {
    hold({ kind, ids: [item.id], names: [item.title.name] })
    moveOn(index)?.focus()
  }
  const addAll = () => {
    if (waiting.length === 0) return
    hold(addAction(waiting))
    // The cards go, so focus moves to the first one after them.
    const next = visible.find((item) => item.state !== "waiting")
    if (next) {
      setActive({ id: next.id, index: 0 })
      cardRefs.current.get(next.id)?.focus()
    } else topRef.current?.focus()
  }
  const undo = () => {
    const action = useRequestActionsStore.getState().undo()
    const id = action?.ids[0]
    if (!id) return
    setActive({ id, index: activeIndex })
    // Back in the list on the next frame, once it's no longer inert.
    requestAnimationFrame(() => cardRefs.current.get(id)?.focus())
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

  // The page's keys, for as long as it's open. Each acts on the card J
  // and K are on, as its state allows.
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
      if (key === "a" && event.shiftKey) {
        if (waiting.length < 2) return
        event.preventDefault()
        addAll()
        return
      }
      if (!activeItem) return
      const state = activeItem.state
      const next =
        key === "j" || (inList && (key === "ArrowDown" || key === "ArrowRight"))
      const previous =
        key === "k" || (inList && (key === "ArrowUp" || key === "ArrowLeft"))
      if (next) {
        event.preventDefault()
        focusCard(
          inList ? Math.min(activeIndex + 1, visible.length - 1) : activeIndex,
        )
      } else if (previous) {
        event.preventDefault()
        focusCard(inList ? Math.max(activeIndex - 1, 0) : activeIndex)
      } else if (key === "a" && state === "waiting") {
        event.preventDefault()
        add(activeItem, activeIndex)
      } else if (key === "d" && state === "waiting") {
        event.preventDefault()
        afterDecline.current = null
        setDeclining(activeItem.id)
      } else if (
        key === "g" &&
        (state === "needsAttention" || state === "onTheWay")
      ) {
        event.preventDefault()
        afterDecline.current = null
        setDeclining(activeItem.id)
      } else if (key === "r" && state === "needsAttention") {
        event.preventDefault()
        retry.mutate(activeItem)
      } else if (
        key === "Enter" &&
        event.target === cardRefs.current.get(activeItem.id)
      ) {
        event.preventDefault()
        void navigate(titleLink(activeItem))
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  })

  const noConnection = connections.data?.length === 0

  // Add all acts on the waiting ones the filter shows, and goes when the
  // filter shows none.
  const addAllButton = (size: "sm" | "default") =>
    waiting.length > 1 ? (
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

  let body: ReactNode
  const error = queue.data ? null : queue.error
  if (queue.isPending && !error) {
    body = <QueueSkeleton />
  } else if (error) {
    body = (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3">
        <p className="text-muted-foreground text-sm">
          {tr("requests.loadFailed", { error: errorMessage(error) })}
        </p>
        <Button variant="outline" onClick={() => void queue.refetch()}>
          <RefreshCwIcon />
          {tr("requests.reload")}
        </Button>
      </div>
    )
  } else if (visible.length === 0 && filtered) {
    body = (
      <QueueEmpty
        icon={<FilterIcon />}
        title={tr("requests.filter.none")}
        description={tr("requests.filter.noneHint")}
        action={
          <Button variant="outline" onClick={() => setFilter({ states: [] })}>
            {tr("library.clearFilters")}
          </Button>
        }
      />
    )
  } else if (visible.length === 0 && noConnection) {
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
    body = (
      <QueueEmpty
        icon={<InboxIcon />}
        title={tr("requests.empty.none")}
        description={tr("requests.empty.noneHint")}
      />
    )
  } else {
    body = (
      <ul
        ref={listRef}
        aria-label={tr("requests.title")}
        className={requestGrid}
      >
        {rows.map((item) => {
          const index = visible.indexOf(item)
          return (
            <QueueCard
              key={item.id}
              item={item}
              collapsed={index < 0}
              focusable={index === activeIndex}
              cardRef={(element) => {
                if (element) cardRefs.current.set(item.id, element)
                else cardRefs.current.delete(item.id)
              }}
              declineOpen={declining === item.id}
              onDeclineOpenChange={(open) => {
                if (open) afterDecline.current = null
                setDeclining(open ? item.id : null)
              }}
              // After a decline, focus moves on once the popover is gone,
              // not as it starts to close: the popover would pick the
              // card's first button, as the card isn't in the tab order yet.
              declineFinalFocus={() => afterDecline.current === null}
              onDeclineClosed={() => {
                afterDecline.current?.focus()
                afterDecline.current = null
              }}
              onFocusCard={() => setActive({ id: item.id, index })}
              onAdd={() => add(item, index)}
              onAnswer={(why) => answer(item, index, why)}
              onRetry={() => retry.mutate(item)}
              onReopen={(kind) => reopen(item, index, kind)}
              onRemove={() => setRemoving(item)}
            />
          )
        })}
      </ul>
    )
  }

  return (
    <div className="flex flex-col pb-6">
      <PageHeader
        title={tr("requests.title")}
        actions={
          <div className="flex items-center gap-2">
            <RequestFilterPanel filter={filter} onChange={setFilter} />
            {addAllButton("default")}
          </div>
        }
        phoneActions={
          <>
            <RequestFilterPanel filter={filter} onChange={setFilter} compact />
            {addAllButton("sm")}
          </>
        }
        className="mb-5 md:mb-6"
      />

      {noConnection && visible.length > 0 && (
        <p className="text-muted-foreground text-13px mb-4 flex items-center gap-1.5">
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

      <div ref={topRef} tabIndex={-1} className="outline-none">
        {body}
      </div>

      {visible.length > 0 && done.hasNextPage && (
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
                names: formatNames(removing.followers.map((f) => f.name)),
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
    <div className={requestGrid}>
      {[0, 1, 2, 3].map((index) => (
        <RequestCardSkeleton key={index} size="wide" />
      ))}
    </div>
  )
}
