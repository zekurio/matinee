import type { Library, User } from "@matinee/contracts"
import { cn } from "@matinee/ui/lib/utils"
import type { JSX } from "@solidjs/web"
import { useQuery } from "@tanstack/solid-query"
import { Link, useMatch, useNavigate } from "@tanstack/solid-router"
import {
  ChartColumn,
  ChevronLeft,
  ChevronRight,
  Compass,
  Film,
  House,
  Inbox,
  LogOut,
  Search,
  Settings,
  Shield,
  TvMinimal,
  UserRound,
} from "lucide"
import { createSignal, For, onSettled, type ParentProps, Show } from "solid-js"

import { useDiscoverEnabled } from "@/components/discover/discover-data"
import { useNeedsYou } from "@/components/requests/request-queue"
import { tr } from "@/i18n"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/kit/dropdown-menu"
import { Icon, type IconNode } from "@/kit/icon"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/kit/tooltip"
import { formatCount } from "@/lib/format"
import { useHistorySteps } from "@/lib/history-steps"
import { can, runsQueue } from "@/lib/permissions"
import { orpc } from "@/lib/rpc"
import { useSignOut } from "@/lib/sign-out"
import { isPhone } from "@/lib/viewport"

import { Logo, LogoMark } from "./brand"
import { AvatarWithDot, UserAvatar } from "./user-avatar"

/*
 * The signed-in frame. From `sm` up it's a desktop app's: a rail of
 * destinations down the left, the Flutter app's tab bar turned on its side,
 * and a bar along the top with Back and Forward, search, and the account.
 * Both stay put while the page scrolls under the bar. Phones get the
 * Flutter phone's frame: a header band with the logo, search and the
 * avatar, and the tabs along the bottom.
 *
 * The page scrolls the window rather than a box of its own, so the
 * browser's scroll restoration, Space and Page Down, and find-in-page all
 * work as they do on any page.
 */

/**
 * The page's side margin, which rows, grids and Home's showcase start at:
 * 16 on a phone as in the Flutter app, 24 beside the rail, 32 once the
 * window is wide enough that cards gain more than margin would.
 * `showcaseGutter` in the showcase reads the same steps.
 */
export const pageGutter = "px-4 sm:px-6 xl:px-8"

export const libraryIcons = {
  movies: Film,
  shows: TvMinimal,
} satisfies Record<Library["kind"], IconNode>

/** A place the rail and the phone's tabs lead to. */
type Destination = {
  to: "/" | "/movies" | "/shows" | "/discover"
  icon: IconNode
  label: string
  /** Only the address itself, not the pages under it. */
  exact?: boolean
}

/**
 * Home, then Movies and Shows, each across every library of its kind and
 * only when there's a library of it, then Explore when this viewer gets
 * Discover. Read from what's cached without waiting on it, so the rail
 * never holds the page; the libraries are asked for before the app renders.
 */
function useDestinations(): () => Destination[] {
  const libraries = useQuery(() => orpc.libraries.list.queryOptions())
  const discover = useDiscoverEnabled()
  const has = (kind: Library["kind"]) =>
    libraries.isSuccess &&
    libraries.data.some((library) => library.kind === kind)
  return () => [
    { to: "/", icon: House, label: tr("shell.home"), exact: true },
    ...(has("movies")
      ? [
          {
            to: "/movies" as const,
            icon: libraryIcons.movies,
            label: tr("shell.movies"),
          },
        ]
      : []),
    ...(has("shows")
      ? [
          {
            to: "/shows" as const,
            icon: libraryIcons.shows,
            label: tr("shell.shows"),
          },
        ]
      : []),
    ...(discover()
      ? [
          {
            to: "/discover" as const,
            icon: Compass,
            label: tr("shell.explore"),
          },
        ]
      : []),
  ]
}

/**
 * A destination's look, shared by the rail and the phone's tabs, as the
 * Flutter tab bar draws it: the icon in a 32 tall box with the label under
 * it, the open one in the foreground and the rest muted. A pill grows out
 * from under the open one's icon; a pointer over another shows it faintly.
 * A press shrinks the icon a little. Keyboard focus rings the pill, not the
 * whole target.
 *
 * The rail shows the icon alone, on a rounded square where the tabs have
 * the wide pill, which is a shape for an icon with a word under it. A word under each icon had to fit 80
 * pixels in every language, and "Einstellungen" doesn't. Its label comes
 * out beside the icon for a pointer or keyboard focus, drawn as the kit's
 * tooltip is, and stays the link's name for a screen reader.
 */
const destinationLink =
  "group/tab flex min-w-0 flex-col items-center gap-1 outline-none select-none"

/**
 * The destination's color, on the icon and the label rather than on the
 * link: `color` is inherited, so a fade on the link restyles everything
 * inside it on every frame, where these two are the only parts showing it.
 */
const destinationColor =
  "text-muted-foreground transition-colors duration-200 group-hover/tab:text-foreground group-data-[status=active]/tab:text-foreground motion-reduce:transition-none"

/** The rail's label: out of the rail, to the right of its icon. */
const railLabel =
  "bg-foreground text-background pointer-events-none absolute top-1/2 left-full z-50 ml-1.5 -translate-x-1 -translate-y-1/2 rounded-md px-3 py-1.5 text-xs font-medium whitespace-nowrap opacity-0 transition-[opacity,translate] duration-150 group-hover/tab:translate-x-0 group-hover/tab:opacity-100 group-focus-visible/tab:translate-x-0 group-focus-visible/tab:opacity-100 motion-reduce:transition-none"

function DestinationFace(props: {
  icon: IconNode
  label: string
  rail?: boolean
}) {
  return (
    <>
      <span
        class={[
          "relative grid place-items-center transition-transform duration-200 group-active/tab:scale-[0.92] motion-reduce:transition-none",
          props.rail ? "size-10" : "h-8 w-16",
        ]}
      >
        <span
          aria-hidden="true"
          // Grows by scale, not width: a width would lay the rail out
          // again on every frame of the change.
          class={[
            "bg-foreground/10 absolute inset-0 opacity-0 transition-[scale,opacity] duration-200 ease-out group-hover/tab:opacity-40 group-data-[status=active]/tab:opacity-100 motion-reduce:transition-none",
            props.rail
              ? "scale-75 rounded-xl group-hover/tab:scale-100 group-data-[status=active]/tab:scale-100"
              : "scale-x-50 rounded-full group-hover/tab:scale-x-[0.875] group-data-[status=active]/tab:scale-x-100",
          ]}
        />
        <span
          aria-hidden="true"
          class={[
            "ring-ring absolute inset-0 hidden ring-2 group-focus-visible/tab:block",
            props.rail ? "rounded-xl" : "rounded-full",
          ]}
        />
        <Icon icon={props.icon} class={["relative size-6", destinationColor]} />
      </span>
      <span
        class={
          props.rail
            ? railLabel
            : ["max-w-full truncate px-1 text-xs font-medium", destinationColor]
        }
      >
        {props.label}
      </span>
    </>
  )
}

function DestinationLink(
  props: Destination & { class?: string; rail?: boolean },
) {
  return (
    <Link
      to={props.to}
      activeOptions={{ exact: props.exact ?? false, includeSearch: false }}
      class={cn(destinationLink, props.class)}
    >
      <DestinationFace
        icon={props.icon}
        label={props.label}
        rail={props.rail}
      />
    </Link>
  )
}

/** The rail's width, which the bar and the page start after. */
const RAIL = "w-16"

/**
 * The rail: the destinations under the logo's cell, and Settings at the
 * foot, where a desktop app keeps it. Solid, with a hairline on its page
 * side, as the Flutter tab bar has one on its top.
 */
function NavRail() {
  const destinations = useDestinations()
  return (
    <nav
      aria-label={tr("shell.mainNav")}
      class={cn(
        RAIL,
        "bg-background border-border fixed top-16 bottom-0 left-0 z-30 flex flex-col items-stretch border-r pt-2 pb-3",
      )}
    >
      <ul class="flex flex-col gap-1">
        <For each={destinations()} keyed={(destination) => destination.to}>
          {(destination) => (
            <li>
              <DestinationLink
                {...destination()}
                rail
                class="relative w-full py-1.5"
              />
            </li>
          )}
        </For>
      </ul>
      <Link
        to="/settings/$"
        params={{ _splat: "" }}
        class={cn(destinationLink, "relative mt-auto w-full py-1.5")}
      >
        <DestinationFace icon={Settings} label={tr("shell.settings")} rail />
      </Link>
    </nav>
  )
}

const mac = /mac|iphone|ipad/i.test(globalThis.navigator?.platform ?? "")

/**
 * Cmd or Ctrl and K, from anywhere in the shell, opens search, as the
 * React app's spotlight does.
 */
function useSearchShortcut() {
  const navigate = useNavigate()
  onSettled(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return
      if (event.key.toLowerCase() !== "k") return
      event.preventDefault()
      void navigate({ to: "/search" })
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  })
}

/**
 * Search, shaped like the Flutter kit's search pill when it's open: a field
 * on a faint wash with a hairline, the icon at its start. It's the way to
 * the search page rather than a field of its own, and names its shortcut.
 */
function SearchPill() {
  return (
    <Link
      to="/search"
      aria-keyshortcuts={mac ? "Meta+K" : "Control+K"}
      class="group/search border-foreground/12 bg-foreground/[0.06] text-muted-foreground hover:border-foreground/20 hover:bg-foreground/[0.08] hover:text-foreground focus-visible:outline-ring data-[status=active]:border-foreground/20 flex h-10 w-full max-w-[30rem] min-w-0 items-center gap-2.5 rounded-full border pr-2 pl-3.5 text-sm transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid motion-reduce:transition-none"
    >
      <Icon icon={Search} class="text-foreground size-[18px] shrink-0" />
      <span class="min-w-0 flex-1 truncate">{tr("search.field")}</span>
      <kbd
        aria-hidden="true"
        class="border-foreground/10 bg-background/60 text-11px text-muted-foreground shrink-0 rounded-md border px-1.5 font-sans font-medium max-md:hidden"
      >
        {mac ? "⌘K" : tr("search.shortcut")}
      </kbd>
    </Link>
  )
}

const barButton =
  "text-foreground/75 hover:bg-surface-hover hover:text-foreground focus-visible:outline-ring grid size-9 place-items-center rounded-full transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid disabled:opacity-35 motion-reduce:transition-none"

/**
 * A round button in the bar, with its name in a tooltip. One that leads
 * nowhere yet is dimmed and out of the Tab order, as a desktop app's Back
 * is, and has nothing to explain, so no tooltip.
 */
function BarButton(props: {
  label: string
  icon: IconNode
  disabled: boolean
  onClick: () => void
}) {
  return (
    <Show
      when={!props.disabled}
      fallback={
        <button
          type="button"
          aria-label={props.label}
          disabled
          class={barButton}
        >
          <Icon icon={props.icon} class="size-5" />
        </button>
      }
    >
      <Tooltip>
        <TooltipTrigger
          aria-label={props.label}
          onClick={() => props.onClick()}
          class={barButton}
        >
          <Icon icon={props.icon} class="size-5" />
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={6}>
          {props.label}
        </TooltipContent>
      </Tooltip>
    </Show>
  )
}

/**
 * Whether the page has left its top, watched through a marker at the top of
 * the document. A scroll listener has to read the scroll offset on every
 * event, and that read lays the page out again when a grid has just changed
 * its rows.
 */
function usePageScrolled() {
  const [scrolled, setScrolled] = createSignal(false)
  let top: HTMLSpanElement | undefined
  onSettled(() => {
    if (!top) return
    // The observer's first callback comes a frame after this; start from the
    // position a reload put the page at.
    setScrolled(window.scrollY > 0)
    const observer = new IntersectionObserver(
      (entries) => {
        const last = entries[entries.length - 1]
        // A marker that only touches the top still counts as showing; the
        // page has left the top once any part of it is hidden.
        if (last) setScrolled(last.intersectionRatio < 1)
      },
      { threshold: 0.5 },
    )
    observer.observe(top)
    return () => observer.disconnect()
  })
  return {
    scrolled,
    top: (element: HTMLSpanElement) => (top = element),
  }
}

/**
 * The bar along the top, as tall as the Flutter header band: the logo's
 * cell over the rail, Back and Forward, search in the middle, and the
 * account at the end. It's the page's color while the page is at its top,
 * so the two read as one; once the page scrolls under it, it frosts as the
 * Flutter tab bar does and draws a hairline along its foot.
 */
function TopBar(props: { user: User; scrolled: boolean }) {
  const steps = useHistorySteps()
  // A title's art runs up under the bar, which lets it show until the page
  // scrolls.
  const overArt = useMatch({
    from: "/_authed/_shell/titles/$titleId",
    shouldThrow: false,
  })
  return (
    <header class="fixed inset-x-0 top-0 z-40 flex h-16">
      <Link
        to="/"
        aria-label={tr("shell.homeLink")}
        class={cn(
          RAIL,
          "group/logo bg-background border-border grid h-full shrink-0 place-items-center border-r outline-none",
        )}
      >
        <span class="group-focus-visible/logo:ring-ring grid size-11 place-items-center rounded-full transition-transform duration-200 group-focus-visible/logo:ring-2 group-active/logo:scale-[0.92] motion-reduce:transition-none">
          <LogoMark class="size-7" />
        </span>
      </Link>
      <div
        class={cn(
          "grid min-w-0 flex-1 grid-cols-[1fr_minmax(0,30rem)_1fr] items-center gap-3 border-b px-3 transition-[background-color,border-color] duration-200 motion-reduce:transition-none",
          props.scrolled
            ? "bg-background/80 border-border backdrop-blur-[20px] backdrop-saturate-150"
            : overArt()
              ? "border-transparent bg-transparent"
              : "bg-background border-transparent",
        )}
      >
        <div class="flex items-center gap-1">
          <BarButton
            label={tr("shell.back")}
            icon={ChevronLeft}
            disabled={!steps.canGoBack()}
            onClick={steps.back}
          />
          <BarButton
            label={tr("shell.forward")}
            icon={ChevronRight}
            disabled={!steps.canGoForward()}
            onClick={steps.forward}
          />
        </div>
        <div class="flex justify-center">
          <SearchPill />
        </div>
        <div class="flex justify-end">
          <AccountMenu user={props.user} />
        </div>
      </div>
    </header>
  )
}

/** The account's name, with a shield for admins. */
function AccountName(props: { user: User }) {
  return (
    <>
      <span class="truncate">
        {props.user.displayName ?? props.user.username}
      </span>
      <Show when={props.user.role === "admin"}>
        <Icon
          icon={Shield}
          aria-label={tr("shell.admin")}
          class="text-muted-foreground size-3.5 shrink-0"
        />
      </Show>
    </>
  )
}

/**
 * The avatar at the bar's end, and the account's menu from it: the
 * profile, the request queue for those who may read it, with a count for
 * those who answer it, statistics, settings, and signing out.
 */
function AccountMenu(props: { user: User; class?: string }) {
  const signOut = useSignOut()
  const navigate = useNavigate()
  const name = () => props.user.displayName ?? props.user.username
  // Anyone who may look at the queue gets the way to it; the count is for
  // those who answer it.
  const readsQueue = () => can(props.user, "adminRequest.read")
  const needsYou = useNeedsYou(() => runsQueue(props.user))
  const accountLabel = () => tr("shell.account", { name: name() })
  const item = (icon: IconNode, label: string): JSX.Element => (
    <>
      <Icon icon={icon} />
      {label}
    </>
  )
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={
          needsYou() > 0
            ? tr("requests.labelled", { label: accountLabel() })
            : accountLabel()
        }
        class={cn(
          "hover:bg-surface-hover aria-expanded:bg-surface-hover focus-visible:outline-ring grid size-12 shrink-0 place-items-center rounded-full transition-colors outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-solid motion-reduce:transition-none sm:size-10",
          props.class,
        )}
      >
        <AvatarWithDot dot={needsYou() > 0}>
          <UserAvatar user={props.user} class="size-8 text-sm" />
        </AvatarWithDot>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6} class="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel class="flex items-center gap-3 py-2 font-normal">
            <UserAvatar user={props.user} class="size-9 text-sm" />
            <span class="min-w-0">
              <span class="text-foreground flex items-center gap-1.5 text-sm font-medium">
                <AccountName user={props.user} />
              </span>
              <span class="text-muted-foreground block truncate text-xs">
                @{props.user.username}
              </span>
            </span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() =>
            void navigate({
              to: "/profiles/$username",
              params: { username: props.user.username },
            })
          }
        >
          {item(UserRound, tr("shell.profile"))}
        </DropdownMenuItem>
        <Show when={readsQueue()}>
          <DropdownMenuItem
            aria-label={
              needsYou() > 0
                ? tr("requests.menuWaiting", { count: needsYou() })
                : undefined
            }
            onSelect={() => void navigate({ to: "/requests" })}
          >
            {item(Inbox, tr("requests.menu"))}
            <Show when={needsYou() > 0}>
              <span class="text-primary ml-auto text-xs font-medium tabular-nums">
                {formatCount(needsYou())}
              </span>
            </Show>
          </DropdownMenuItem>
        </Show>
        <DropdownMenuItem onSelect={() => void navigate({ to: "/stats" })}>
          {item(ChartColumn, tr("shell.statistics"))}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() =>
            void navigate({ to: "/settings/$", params: { _splat: "" } })
          }
        >
          {item(Settings, tr("shell.settings"))}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => signOut.mutate()}
        >
          {item(LogOut, tr("shell.signOut"))}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * A phone's header band, the Flutter phone's: the logo at the start,
 * search as a bare icon, and the avatar at the end. It stays put while the
 * page scrolls, on the page's own color. The row sits 8 under the top, as
 * the Flutter band's does, within a thumb's reach.
 */
function PhoneHeader(props: { user: User }) {
  return (
    <header class="bg-background fixed inset-x-0 top-0 z-40 pt-[env(safe-area-inset-top)]">
      <div class="flex h-16 items-center pt-2 pr-1 pl-4">
        <Link
          to="/"
          aria-label={tr("shell.homeLink")}
          class="focus-visible:ring-ring -ml-1 rounded-md px-1 py-2 outline-none focus-visible:ring-2"
        >
          <Logo class="h-[18px]" label={tr("shell.homeLink")} />
        </Link>
        <span class="flex-1" />
        <Link
          to="/search"
          aria-label={tr("search.title")}
          class="text-foreground focus-visible:ring-ring active:bg-foreground/10 grid size-12 place-items-center rounded-full outline-none focus-visible:ring-2"
        >
          <Icon icon={Search} class="size-6" />
        </Link>
        <AccountMenu user={props.user} />
      </div>
    </header>
  )
}

/**
 * A phone's tabs, the Flutter tab bar: one row across the bottom, frosted
 * over the page, with a hairline on top, its tabs no wider together than
 * 480. They're the rail's destinations.
 */
function TabBar() {
  const destinations = useDestinations()
  return (
    <nav
      aria-label={tr("shell.tabs")}
      class="bg-background/80 border-border fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur-[20px] backdrop-saturate-150"
    >
      <ul class="mx-auto flex max-w-[480px] px-2">
        <For each={destinations()} keyed={(destination) => destination.to}>
          {(destination) => (
            <li class="min-w-0 flex-1">
              <DestinationLink {...destination()} class="w-full pt-3 pb-4" />
            </li>
          )}
        </For>
      </ul>
    </nav>
  )
}

export function AppShell(props: ParentProps<{ user: User }>) {
  useSearchShortcut()
  const pageScroll = usePageScrolled()
  return (
    <div class="relative min-h-dvh">
      <span
        ref={pageScroll.top}
        aria-hidden="true"
        class="pointer-events-none absolute top-0 left-0 size-px"
      />
      <a
        href="#main"
        class="bg-primary text-primary-foreground sr-only rounded-md px-3 py-2 text-sm font-medium focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50"
      >
        {tr("shell.skipToContent")}
      </a>
      <Show when={!isPhone()} fallback={<PhoneHeader user={props.user} />}>
        <TopBar user={props.user} scrolled={pageScroll.scrolled()} />
        <NavRail />
      </Show>
      <main
        id="main"
        tabindex="-1"
        class="pt-[calc(env(safe-area-inset-top)+4rem)] pb-[calc(env(safe-area-inset-bottom)+6.5rem)] outline-none sm:pt-16 sm:pb-12 sm:pl-16"
      >
        {props.children}
      </main>
      <Show when={isPhone()}>
        <TabBar />
      </Show>
    </div>
  )
}
