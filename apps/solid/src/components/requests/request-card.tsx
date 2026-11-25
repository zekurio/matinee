import type { AdminRequestItem, RequestState } from "@matinee/contracts"
import { cn } from "@matinee/ui/lib/utils"
import type { JSX } from "@solidjs/web"
import { Link } from "@tanstack/solid-router"
import { Check, ChevronDown, CircleSlash, Clock, TriangleAlert } from "lucide"
import {
  children,
  createMemo,
  createSignal,
  createUniqueId,
  For,
  onSettled,
  type ParentProps,
  Show,
} from "solid-js"

import { ProgressRing } from "@/components/catalog/catalog-card"
import { Picture } from "@/components/picture"
import { tr } from "@/i18n"
import { badgeVariants } from "@/kit/badge"
import { Icon } from "@/kit/icon"
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/kit/popover"
import { Skeleton } from "@/kit/skeleton"
import { formatPercent } from "@/lib/format"
import { art } from "@/lib/media"

import { scopeLabel } from "./request-queue"

/*
 * The one card every list of requests draws, laid out as Seerr's: the
 * request's details on the left and the poster, sharp, on the right,
 * over the title's backdrop. The backdrop fades into the card's own
 * surface from the top left corner down to the bottom right, so the
 * words always sit on the theme's colour, light or dark, and the
 * picture only colours the card. A request without a backdrop is the
 * plain card.
 */

/**
 * One request, in one fixed anatomy whatever its state or page, exactly
 * as tall as its poster. From the top: the year, and for a show the
 * seasons asked for; the name, whole, on up to two lines; on the
 * admin's cards, who asked; and "Status" with the state's badge, which
 * opens what went wrong when something did. The actions sit on the
 * poster's bottom edge, and the space between is the only give. `menu`
 * sits beside the name, by the poster, and holds the rest.
 */
export function RequestCard(props: {
  item: Pick<
    AdminRequestItem,
    "title" | "backdrop" | "library" | "scope" | "availability"
  >
  /** `rail` in Discover's row; `wide` in the requests pages' grids. */
  size?: "rail" | "wide"
  /** A {@link RequestStateBadge}. */
  state: JSX.Element
  /**
   * Who asked, on the admin's cards. Its row is kept even when empty, so
   * passing it at all is what makes a card the admin's.
   */
  who?: JSX.Element
  actions?: JSX.Element
  menu?: JSX.Element
  ref?: (element: HTMLElement) => void
  tabindex?: number
  onFocus?: () => void
  class?: string
}) {
  const id = createUniqueId()
  const admin = "who" in props
  const poster = () => art(props.item.title.poster)
  const backdrop = () => art(props.item.backdrop)
  const facts = () =>
    [
      props.item.title.year === null ? null : String(props.item.title.year),
      scopeLabel(props.item.scope),
    ]
      .filter(Boolean)
      .join(" · ")
  const actions = children(() => props.actions)
  const menu = children(() => props.menu)

  return (
    <article
      aria-labelledby={`${id}-name`}
      ref={props.ref}
      tabindex={props.tabindex}
      onFocus={() => props.onFocus?.()}
      class={cn(
        "bg-card text-foreground relative isolate flex h-full min-w-0 gap-4 overflow-hidden rounded-xl border p-4 outline-none",
        props.class,
      )}
    >
      <Show when={backdrop()}>
        {(picture) => (
          <div aria-hidden="true" class="absolute inset-0 -z-10">
            <Picture sources={[picture()]} sizes="424px" />
            <div class="from-card/50 to-card absolute inset-0 bg-linear-135 to-75%" />
          </div>
        )}
      </Show>
      {/* Sized as if empty, so the poster alone sets the row's height,
          and the column stretches to it. */}
      <div class="@container/card flex min-w-0 flex-1 flex-col [contain:size]">
        <div class="flex min-w-0 flex-col items-start gap-1">
          <div class="flex w-full min-w-0 items-start gap-2">
            <div class="flex min-w-0 flex-1 flex-col">
              <Facts text={facts()} onPicture={backdrop() !== null} />
              <TitleLink
                item={props.item}
                tabindex={props.size === "wide" ? -1 : undefined}
                title={props.item.title.name}
                class="focus-visible:ring-ring -mx-1 flex min-w-0 rounded-sm px-1 underline-offset-2 outline-none hover:underline focus-visible:ring-2"
              >
                <span
                  id={`${id}-name`}
                  class="line-clamp-2 min-w-0 text-base font-bold break-words"
                >
                  {props.item.title.name}
                </span>
              </TitleLink>
            </div>
            <Show when={menu.toArray().length > 0}>
              <div class="-mt-1 -mr-1 shrink-0">{menu()}</div>
            </Show>
          </div>
          <Show when={admin}>
            <div class="flex h-6 w-full min-w-0 items-center">{props.who}</div>
          </Show>
          {/* Both words trimmed to their capitals, so they and the badge's
              mark center on one line, whatever the zoom rounds. */}
          <div class="text-13px flex h-6 w-full min-w-0 items-center gap-2">
            <span class="text-foreground/85 shrink-0 font-semibold [text-box:trim-both_cap_alphabetic]">
              {tr("requests.statusLabel")}
            </span>
            {props.state}
          </div>
        </div>
        <Show when={actions.toArray().length > 0}>
          <div class="mt-auto flex w-full min-w-0 items-center gap-1.5 pt-1.5">
            {actions()}
          </div>
        </Show>
      </div>
      <TitleLink
        item={props.item}
        tabindex={-1}
        hidden
        class="bg-muted ring-border relative block aspect-[2/3] w-28 shrink-0 self-start overflow-hidden rounded-md shadow-md ring-1 transition-transform duration-300 hover:scale-[1.03] motion-reduce:transition-none"
      >
        <Show when={poster()}>
          {(picture) => <Picture sources={[picture()]} sizes="112px" />}
        </Show>
      </TitleLink>
    </article>
  )
}

/** A link to where the request's title opens, as `titleLink` says. */
function TitleLink(
  props: ParentProps<{
    item: Pick<AdminRequestItem, "title" | "library" | "availability">
    tabindex?: number
    title?: string
    /** For the second link to it, the poster beside its name. */
    hidden?: boolean
    class: string
  }>,
) {
  return (
    <Show
      when={props.item.availability.libraryTitleId}
      fallback={
        <Link
          to="/catalog/$kind/$provider/$providerId"
          params={{
            kind: props.item.title.ref.kind,
            provider: props.item.title.ref.provider,
            providerId: props.item.title.ref.providerId,
          }}
          search={{ library: props.item.library.id }}
          tabindex={props.tabindex}
          title={props.title}
          aria-hidden={props.hidden ? "true" : undefined}
          class={props.class}
        >
          {props.children}
        </Link>
      }
    >
      {(titleId) => (
        <Link
          to="/titles/$titleId"
          params={{ titleId: titleId() }}
          tabindex={props.tabindex}
          title={props.title}
          aria-hidden={props.hidden ? "true" : undefined}
          class={props.class}
        >
          {props.children}
        </Link>
      )}
    </Show>
  )
}

/**
 * The year and a show's seasons, one line. Seasons can run long; when the
 * line is cut, it opens the whole of it in a popover.
 */
function Facts(props: { text: string; onPicture: boolean }) {
  const [cut, setCut] = createSignal(false)
  let watched: HTMLElement | undefined
  const observer = new ResizeObserver(() => {
    if (watched) setCut(watched.scrollWidth > watched.clientWidth + 1)
  })
  onSettled(() => () => observer.disconnect())
  // Each branch draws its own line, and the observer follows the one shown.
  const line = () => (
    <span
      ref={(node) => {
        if (watched) observer.unobserve(watched)
        watched = node
        observer.observe(node)
      }}
      class={cn(
        "block h-4 min-w-0 truncate text-xs leading-4 font-medium",
        // Over the backdrop's lightest corner, the muted colour fades
        // into it.
        props.onPicture ? "text-foreground/85" : "text-muted-foreground",
      )}
    >
      {props.text}
    </span>
  )
  return (
    <Show when={cut()} fallback={line()}>
      <Popover>
        <PopoverTrigger class="focus-visible:ring-ring hover:bg-foreground/[0.06] data-popup-open:bg-foreground/[0.06] -mx-1 flex min-w-0 rounded-sm px-1 text-left outline-none focus-visible:ring-2">
          {line()}
        </PopoverTrigger>
        <PopoverContent align="start" class="w-auto max-w-80 text-sm">
          {props.text}
        </PopoverContent>
      </Popover>
    </Show>
  )
}

type Look = {
  icon: () => JSX.Element
  label: string
  class: string
}

/**
 * Each state's mark and colour, filled as Seerr's are: waiting in the
 * warning colour, on its way in the accent, here in green, and declined
 * or needing attention in red.
 */
function stateLook(state: RequestState, progress: number | null): Look {
  switch (state) {
    case "waiting":
      return {
        icon: () => <Icon icon={Clock} stroke-width={2.5} />,
        label: tr("requests.state.waiting"),
        class: "border-warning bg-warning/80",
      }
    case "needsAttention":
      return {
        icon: () => <Icon icon={TriangleAlert} stroke-width={2.5} />,
        label: tr("requests.state.needsAttention"),
        class: "border-destructive bg-destructive/80",
      }
    case "onTheWay":
      return {
        icon: () => <ProgressRing progress={progress} class="text-current" />,
        label:
          progress === null
            ? tr("requests.state.onTheWay")
            : tr("requests.state.onTheWayPercent", {
                percent: formatPercent(progress),
              }),
        class: "border-primary bg-primary/80",
      }
    case "here":
      return {
        icon: () => <Icon icon={Check} stroke-width={3} />,
        label: tr("requests.state.here"),
        class: "border-success bg-success/80",
      }
    case "declined":
      return {
        icon: () => <Icon icon={CircleSlash} stroke-width={2.5} />,
        label: tr("requests.state.declined"),
        class: "border-destructive bg-destructive/80",
      }
  }
}

/**
 * Where a request stands, as the server says: one filled pill with a
 * mark and a word, and how far along it is while it's on its way. With
 * `detail`, what went wrong or why it was declined, the pill is a button
 * with a chevron that opens it.
 */
export function RequestStateBadge(props: {
  state: RequestState
  progress?: number | null
  detail?: JSX.Element
}) {
  const look = createMemo(() => stateLook(props.state, props.progress ?? null))
  const detail = children(() => props.detail)
  const pill = () =>
    cn(
      badgeVariants(),
      "h-5 max-w-full min-w-0 gap-1 border px-2 font-semibold text-white",
      look().class,
    )
  const content = () => (
    <>
      {look().icon()}
      {/* Clipped rather than hidden, with room for a "g" to hang below
          the trimmed box. */}
      <span class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap [overflow-clip-margin:3px] [text-box:trim-both_cap_alphabetic]">
        {look().label}
      </span>
    </>
  )
  return (
    <Show
      when={detail.toArray().length > 0}
      fallback={<span class={pill()}>{content()}</span>}
    >
      <Popover>
        <PopoverTrigger
          class={cn(
            pill(),
            "focus-visible:ring-ring cursor-pointer outline-none hover:brightness-110 focus-visible:ring-2 data-popup-open:brightness-110",
          )}
        >
          {content()}
          <Icon icon={ChevronDown} stroke-width={2.5} />
        </PopoverTrigger>
        <PopoverContent
          align="start"
          class="w-80 max-w-(--available-width) gap-0 p-0"
        >
          <PopoverHeader>
            <PopoverTitle class="truncate">{look().label}</PopoverTitle>
          </PopoverHeader>
          <div class="flex max-h-80 flex-col gap-2 overflow-y-auto px-3 py-2.5 text-sm break-words">
            {detail()}
          </div>
        </PopoverContent>
      </Popover>
    </Show>
  )
}

/** How far along an admin's or a person's request is, for its badge. */
export function requestProgress(
  item: Pick<AdminRequestItem, "state" | "season" | "availability">,
): number | null {
  if (item.state !== "onTheWay") return null
  return (item.season ?? item.availability).progress
}

/** The grid the requests pages lay their wide cards out in. */
export const requestGrid =
  "grid grid-cols-1 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(min(100%,24rem),1fr))] sm:gap-4"

/** The cards on their way, in the size of the card they stand in for. */
export function RequestCardSkeleton(props: { admin?: boolean }) {
  return (
    <div class="bg-card flex gap-4 rounded-xl border p-4">
      <div class="flex min-w-0 flex-1 flex-col gap-1.5 [contain:size]">
        <Skeleton class="h-3 w-1/4" />
        <Skeleton class="h-5 w-4/5" />
        <Show when={props.admin}>
          <Skeleton class="h-6 w-2/5 rounded-full" />
        </Show>
        <Skeleton class="h-5 w-1/2 rounded-full" />
        <Skeleton class="mt-auto h-8 w-1/2" />
      </div>
      <Skeleton class="aspect-[2/3] w-28 shrink-0 rounded-md" />
    </div>
  )
}

/** Four skeleton cards in the requests grid. */
export function RequestGridSkeleton(props: { admin?: boolean }) {
  return (
    <div class={requestGrid}>
      <For each={[0, 1, 2, 3]}>
        {() => <RequestCardSkeleton admin={props.admin} />}
      </For>
    </div>
  )
}
