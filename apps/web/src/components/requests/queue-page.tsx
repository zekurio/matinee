import type { AdminRequestItem, RequestQueue } from "@matinee/contracts"
import { cn } from "@matinee/ui/lib/utils"
import type { JSX } from "@solidjs/web"
import {
  type InfiniteData,
  InfiniteQueryObserver,
  type InfiniteQueryObserverResult,
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/solid-query"
import {
  getRouteApi,
  useNavigate,
  useRouteContext,
} from "@tanstack/solid-router"
import { Cable, CheckCheck, Filter, Inbox, RefreshCw } from "lucide"
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  Match,
  onSettled,
  Show,
  Switch,
  from,
  untrack,
} from "solid-js"

import { pageGutter } from "@/components/app-shell"
import { ShowMore } from "@/components/library/library-states"
import { PageHeader, useDocumentTitle } from "@/components/page-header"
import { ConfirmDialog } from "@/components/settings/user-dialogs"
import { tr } from "@/i18n"
import { Button, buttonVariants } from "@/kit/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/kit/empty"
import { Icon, type IconNode } from "@/kit/icon"
import { toast } from "@/kit/toast"
import { queueActions } from "@/lib/permissions"
import { client, errorMessage, orpc } from "@/lib/rpc"
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
import { RequestGridSkeleton, requestGrid } from "./request-card"
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

type DoneResult = InfiniteQueryObserverResult<
  InfiniteData<RequestQueue, string | undefined>
>

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
  useDocumentTitle(() => tr("requests.title"))
  const context = useRouteContext({ from: "/_authed/_shell" })
  const may = createMemo(() => queueActions(context().user))
  const navigate = useNavigate()
  const search = route.useSearch()
  // Equal filters are one filter, so the queries ask again only for a
  // new one.
  const filter = createMemo(() => requestFilter(search()), {
    equals: (a, b) =>
      a.kind === b.kind && a.states.join(",") === b.states.join(","),
  })
  const setFilter = (next: RequestFilter) =>
    void navigate({ to: ".", search: searchFor(next), replace: true })
  const filtered = () => filterCount(filter()) > 0
  const queue = useRequestQueue(() => true, filter)
  const connections = useQuery(() =>
    orpc.admin.fulfilment.connections.queryOptions(),
  )
  const hidden = useHiddenRequests()
  const openSettings = useOpenSettings()

  // Held actions go out as the page is left, not when their toast ends.
  useSendHeldOnLeave()

  // Done through one observer, which keeps the last filter's pages on
  // screen until the next one's come, as `keepPreviousData` does. Read
  // from the observer rather than the query's data, which the Solid
  // Query RC held pending through each fetch and abandoned on every
  // filter change.
  const queryClient = useQueryClient()
  const doneOptions = () => {
    // Read here, where it's tracked: `input` runs as each page loads.
    const kept = filterInput(filter())
    return orpc.admin.requests.queue.infiniteOptions({
      input: (cursor: string | undefined) => ({
        limit: DONE_PAGE,
        cursor,
        ...kept,
      }),
      initialPageParam: undefined,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
      placeholderData: keepPreviousData,
    })
  }
  const observer = new InfiniteQueryObserver(queryClient, untrack(doneOptions))
  createEffect(doneOptions, (options) => observer.setOptions(options))
  const done = createMemo(() =>
    from<DoneResult>((next) => {
      next(observer.getCurrentResult())
      return observer.subscribe(next)
    }),
  )

  const queueData = () => queue()?.data
  // What done has, without waiting on it when it has nothing yet.
  const doneData = () => done()?.data

  // Done is read page by page, not followed. The stream carries its count
  // and its latest row, so when either changes, as when a title arrives,
  // the pages already open load again.
  let seenDoneMark: string | null = null
  createEffect(
    () => {
      const data = queueData()
      return data ? `${data.doneCount} ${data.done[0]?.id ?? ""}` : null
    },
    (mark) => {
      if (mark === null || mark === seenDoneMark) return
      const first = seenDoneMark === null
      seenDoneMark = mark
      if (!first) {
        void queryClient.invalidateQueries({
          queryKey: orpc.admin.requests.queue.key(),
        })
      }
    },
  )

  const rows = createMemo(() => {
    const data = queueData()
    // Until its pages come, done is what the stream carries of it.
    const doneItems =
      doneData()?.pages.flatMap((page) => page.done) ?? data?.done ?? []
    const work = data ? workItems(data) : []
    // An id once: a request that moved on between the stream and a page
    // shows where the stream has it.
    const seen = new Set(work.map((item) => item.id))
    return [...work, ...doneItems.filter((item) => !seen.has(item.id))]
  })
  const visible = createMemo(() =>
    rows().filter((item) => !isHidden(hidden(), item)),
  )
  const visibleIndex = createMemo(
    () => new Map(visible().map((item, index) => [item.id, index])),
  )
  const waiting = createMemo(() =>
    visible().filter((item) => item.state === "waiting"),
  )

  // The card J and K are on. Kept by id, with its place for when it goes.
  const [active, setActive] = createSignal<{
    id: string | null
    index: number
  }>({ id: null, index: 0 })
  const activeIndex = createMemo(() => {
    const current = active()
    const found =
      current.id === null ? undefined : visibleIndex().get(current.id)
    return found ?? Math.min(current.index, visible().length - 1)
  })
  const activeItem = () => visible()[activeIndex()]
  const [declining, setDeclining] = createSignal<string | null>(null)
  const [removing, setRemoving] = createSignal<AdminRequestItem | null>(null)
  // Each card's element, with its row's item, read as keys need them.
  const cards = new Map<HTMLElement, () => AdminRequestItem>()
  const cardOf = (id: string) => {
    for (const [element, item] of cards)
      if (element.isConnected && item().id === id) return element
    return undefined
  }
  let list: HTMLUListElement | undefined
  // Where focus waits once no card is left to take it.
  let top: HTMLDivElement | undefined
  // Where focus goes once a decline closes its popover: the card that
  // takes the declined one's place. Null while no decline was sent, so a
  // popover closed without one hands focus back to its button.
  let afterDecline: HTMLElement | null = null

  const hold = useRequestActionsStore.getState().hold

  const focusCard = (index: number) => {
    const item = visible()[index]
    if (!item) return
    setActive({ id: item.id, index })
    cardOf(item.id)?.focus()
  }
  /** The card after `index` once it goes, or before it at the end. */
  const neighbour = (index: number) =>
    visible()[index + 1] ?? visible()[index - 1]
  /**
   * Moves J and K on from a card that's leaving, and returns what focus
   * should go to: the next card, or with none left, the list's place.
   */
  const moveOn = (index: number): HTMLElement | null => {
    const next = neighbour(index)
    if (next) {
      setActive({ id: next.id, index })
      return cardOf(next.id) ?? null
    }
    return top ?? null
  }

  const add = (item: AdminRequestItem, index: number) => {
    if (!may().approve) return
    hold(addAction([item]))
    moveOn(index)?.focus()
  }
  const answer = (item: AdminRequestItem, index: number, why: Answer) => {
    if (!may().decline) return
    afterDecline = moveOn(index)
    setDeclining(null)
    hold({ ...why, ids: [item.id], names: [item.title.name] })
  }
  const reopen = (item: AdminRequestItem, index: number, kind: Reopen) => {
    if (kind === "allowAgain" ? !may().decline : !may().approve) return
    hold({ kind, ids: [item.id], names: [item.title.name] })
    moveOn(index)?.focus()
  }
  const addAll = () => {
    const all = waiting()
    if (!may().approve || all.length === 0) return
    hold(addAction(all))
    // The cards go, so focus moves to the first one after them.
    const next = visible().find((item) => item.state !== "waiting")
    if (next) {
      setActive({ id: next.id, index: 0 })
      cardOf(next.id)?.focus()
    } else top?.focus()
  }
  const undo = () => {
    const action = useRequestActionsStore.getState().undo()
    const id = action?.ids[0]
    if (!id) return
    setActive({ id, index: activeIndex() })
    // Back in the list on the next frame, once it's no longer inert.
    requestAnimationFrame(() => cardOf(id)?.focus())
  }

  const retry = useMutation(() => ({
    mutationFn: (item: AdminRequestItem) =>
      client.admin.requests.retry({ id: item.id }),
    onSuccess: (_result, item) =>
      toast.success(tr("requests.retried", { name: item.title.name })),
    onError: (error, item) =>
      toast.error(tr("requests.retryFailed", { name: item.title.name }), {
        description: errorMessage(error),
      }),
  }))
  const remove = useMutation(() => ({
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
  }))

  // The page's keys, for as long as it's open. Each acts on the card J
  // and K are on, as its state allows.
  onSettled(() => {
    const onKey = (event: KeyboardEvent) => {
      if (ignoredKey(event)) return
      const allowed = may()
      const inList =
        document.activeElement instanceof Element &&
        list?.contains(document.activeElement) === true
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key
      if (key === "u") {
        event.preventDefault()
        undo()
        return
      }
      if (key === "a" && event.shiftKey) {
        if (!allowed.approve || waiting().length < 2) return
        event.preventDefault()
        addAll()
        return
      }
      const item = activeItem()
      if (!item) return
      const index = activeIndex()
      const state = item.state
      const next =
        key === "j" || (inList && (key === "ArrowDown" || key === "ArrowRight"))
      const previous =
        key === "k" || (inList && (key === "ArrowUp" || key === "ArrowLeft"))
      if (next) {
        event.preventDefault()
        focusCard(inList ? Math.min(index + 1, visible().length - 1) : index)
      } else if (previous) {
        event.preventDefault()
        focusCard(inList ? Math.max(index - 1, 0) : index)
      } else if (key === "a" && state === "waiting") {
        if (!allowed.approve) return
        event.preventDefault()
        add(item, index)
      } else if (key === "d" && state === "waiting") {
        if (!allowed.decline) return
        event.preventDefault()
        afterDecline = null
        setDeclining(item.id)
      } else if (
        key === "g" &&
        (state === "needsAttention" || state === "onTheWay")
      ) {
        if (!allowed.decline) return
        event.preventDefault()
        afterDecline = null
        setDeclining(item.id)
      } else if (key === "r" && state === "needsAttention") {
        if (!allowed.retry) return
        event.preventDefault()
        retry.mutate(item)
      } else if (key === "Enter" && event.target === cardOf(item.id)) {
        event.preventDefault()
        void navigate(titleLink(item))
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  })

  const noConnection = () =>
    !connections.isPending && connections.data?.length === 0
  const error = () => (queueData() ? null : (queue()?.error ?? null))

  // Add all acts on the waiting ones the filter shows, and goes when the
  // filter shows none.
  const addAllButton = (size: "sm" | "default") => (
    <Show when={may().approve && waiting().length > 1}>
      <KeyTip
        label={tr("requests.keys.addAll")}
        keys="Shift A"
        aria-keyshortcuts="Shift+A"
        class={buttonVariants({ variant: "outline", size })}
        onClick={addAll}
      >
        <Icon icon={CheckCheck} />
        {tr("requests.addAll", { count: waiting().length })}
      </KeyTip>
    </Show>
  )

  return (
    <div class={cn(pageGutter, "flex flex-col pb-6 sm:pt-8")}>
      <PageHeader
        title={tr("requests.title")}
        actions={
          <div class="flex items-center gap-2">
            <RequestFilterPanel filter={filter()} onChange={setFilter} />
            {addAllButton("default")}
          </div>
        }
        phoneActions={
          <>
            <RequestFilterPanel
              filter={filter()}
              onChange={setFilter}
              compact
            />
            {addAllButton("sm")}
          </>
        }
        class="mb-5 md:mb-6"
      />

      <div
        ref={(element) => {
          top = element
        }}
        tabindex={-1}
        class="outline-none"
      >
        <Switch>
          <Match when={!queueData() && !error()}>
            <RequestGridSkeleton admin />
          </Match>
          <Match when={error()}>
            {(failure) => (
              <div class="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3">
                <p class="text-muted-foreground text-sm">
                  {tr("requests.loadFailed", {
                    error: errorMessage(failure()),
                  })}
                </p>
                <Button
                  variant="outline"
                  onClick={() => void queue()?.refetch()}
                >
                  <Icon icon={RefreshCw} />
                  {tr("requests.reload")}
                </Button>
              </div>
            )}
          </Match>
          <Match when={visible().length === 0 && filtered()}>
            <QueueEmpty
              icon={Filter}
              title={tr("requests.filter.none")}
              description={tr("requests.filter.noneHint")}
              action={
                <Button
                  variant="outline"
                  onClick={() => setFilter({ states: [] })}
                >
                  {tr("library.clearFilters")}
                </Button>
              }
            />
          </Match>
          <Match when={visible().length === 0 && noConnection()}>
            <QueueEmpty
              icon={Cable}
              title={tr("requests.empty.setup.title")}
              description={tr("requests.empty.setup.description")}
              action={
                <Button
                  variant="outline"
                  onClick={() => openSettings("requests")}
                >
                  {tr("requests.empty.setup.action")}
                </Button>
              }
            />
          </Match>
          <Match when={visible().length === 0}>
            <QueueEmpty
              icon={Inbox}
              title={tr("requests.empty.none")}
              description={tr("requests.empty.noneHint")}
            />
          </Match>
          <Match when={true}>
            <ul
              ref={(element) => {
                list = element
              }}
              aria-label={tr("requests.title")}
              class={requestGrid}
            >
              <For each={rows()} keyed={(item) => item.id}>
                {(item) => {
                  const index = () => visibleIndex().get(item().id) ?? -1
                  return (
                    <QueueCard
                      item={item()}
                      collapsed={index() < 0}
                      focusable={index() === activeIndex()}
                      cardRef={(element) => {
                        cards.set(element, item)
                      }}
                      declineOpen={declining() === item().id}
                      onDeclineOpenChange={(open) => {
                        if (open) afterDecline = null
                        setDeclining(open ? item().id : null)
                      }}
                      // After a decline, focus moves on as the popover
                      // closes, to the card that takes its place.
                      declineFinalFocus={() => afterDecline}
                      onDeclineClosed={() => {
                        afterDecline?.focus()
                        afterDecline = null
                      }}
                      onFocusCard={() =>
                        setActive({ id: item().id, index: index() })
                      }
                      onAdd={() => add(item(), index())}
                      onAnswer={(why) => answer(item(), index(), why)}
                      onRetry={() => retry.mutate(item())}
                      onReopen={(kind) => reopen(item(), index(), kind)}
                      onRemove={() => setRemoving(item())}
                      may={may()}
                    />
                  )
                }}
              </For>
            </ul>
          </Match>
        </Switch>
      </div>

      <Show when={visible().length > 0 && done()?.hasNextPage}>
        <ShowMore
          fetching={done()?.isFetchingNextPage ?? false}
          paused={done()?.fetchStatus !== "idle" && !done()?.isFetchingNextPage}
          failed={done()?.isFetchNextPageError ?? false}
          onLoad={() => {
            if (!done()?.isFetching) void observer.fetchNextPage()
          }}
        />
      </Show>

      <ConfirmDialog
        open={removing() !== null}
        title={tr("requests.remove.title", {
          name: removing()?.title.name ?? "",
        })}
        description={removeDescription(removing())}
        confirmLabel={tr("requests.remove.confirm")}
        destructive
        pending={remove.isPending}
        onConfirm={() => {
          const item = removing()
          if (item) remove.mutate(item)
        }}
        onClose={() => setRemoving(null)}
      />
    </div>
  )
}

function removeDescription(item: AdminRequestItem | null): string {
  return item && askers(item).first
    ? tr("requests.remove.description", {
        names: formatNames(item.followers.map((follower) => follower.name)),
      })
    : tr("requests.remove.descriptionNobody")
}

/** Nothing to list, as a library with nothing in it says so. */
function QueueEmpty(props: {
  icon: IconNode
  title: string
  description?: string
  action?: JSX.Element
}) {
  return (
    <Empty class="py-16">
      <EmptyHeader>
        <EmptyMedia variant="icon" class="mb-4 size-9 [&_svg]:size-5">
          <Icon icon={props.icon} />
        </EmptyMedia>
        <EmptyTitle class="text-base font-semibold">{props.title}</EmptyTitle>
        <Show when={props.description}>
          <EmptyDescription>{props.description}</EmptyDescription>
        </Show>
      </EmptyHeader>
      <Show when={props.action}>
        {(action) => <EmptyContent>{action()}</EmptyContent>}
      </Show>
    </Empty>
  )
}
