import { cn } from "@matinee/ui/lib/utils"
import type { JSX } from "@solidjs/web"
import {
  Link,
  useNavigate,
  useRouteContext,
  useRouter,
  useRouterState,
} from "@tanstack/solid-router"
import { ArrowLeft, House, Search } from "lucide"
import { createSignal, For, onSettled, Show } from "solid-js"

import { tr } from "@/i18n"
import { Icon } from "@/kit/icon"
import { isPhone, reducedMotion } from "@/lib/viewport"

import { DestinationLink, usePhoneDestinations } from "./destinations"
import { UserAvatar } from "./user-avatar"

/*
 * Phones get the Flutter phone's frame: the tabs along the bottom on a
 * tab's first page, and a band above it, Home's with the logo or another
 * tab's with its name and actions. A page opened from a tab covers both, as
 * a pushed Flutter page does, with a bar of its own: Back, its name and its
 * actions (`PhoneTopBar`, or `PageHeader`'s), or Back and Home floating over
 * its art (`ItemTopBar`).
 */

/** A tab, named by the page it opens on: the phone's destinations. */
export type PhoneTab = "home" | "media" | "explore"

/** The tab whose first page `pathname` is, if it is one. */
function tabAt(pathname: string): PhoneTab | null {
  if (pathname === "/") return "home"
  // Settings opened fresh sit over Home.
  if (pathname === "/settings" || pathname.startsWith("/settings/")) {
    return "home"
  }
  if (
    pathname === "/media" ||
    pathname === "/movies" ||
    pathname === "/shows"
  ) {
    return "media"
  }
  if (pathname === "/discover") return "explore"
  return null
}

/** The tab whose first page is open, or null on a page opened from one. */
export function usePhoneTab(): () => PhoneTab | null {
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  return () => tabAt(pathname())
}

const [covers, setCovers] = createSignal(0)

/**
 * Whether the open page has put up a bar of its own on a phone, which takes
 * the place of the shell's header band and tabs.
 */
export const tabsCovered = () => covers() > 0

/**
 * Covers the shell's phone header band and tabs while it's mounted. For a
 * page that draws its own bar on a phone without `PhoneTopBar` or
 * `ItemTopBar`; mount it only on phones.
 */
export function CoverTabs() {
  onSettled(() => {
    setCovers((count) => count + 1)
    return () => setCovers((count) => count - 1)
  })
  return undefined
}

/**
 * What the tab bar takes from the bottom of a page, above the home
 * indicator: the bar, and a gap over it so a toast clears it.
 */
const TAB_BAR_SPACE = "5rem"

/** Bottom padding for a tab's first page, so its end clears the tab bar. */
export const tabBarPadding =
  "max-sm:pb-[calc(env(safe-area-inset-bottom)+6.5rem)]"

/**
 * A phone's tabs, the Flutter tab bar: one row across the bottom, frosted
 * over the page, with a hairline on top, its tabs no wider together than
 * 480. Home, Media, and Explore, as the Flutter app has them. The shell
 * mounts it.
 */
export function TabBar() {
  const destinations = usePhoneDestinations()
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  // Toasts rise over the bar while it shows.
  onSettled(() => {
    const root = document.documentElement
    root.style.setProperty("--tab-bar-space", TAB_BAR_SPACE)
    return () => root.style.removeProperty("--tab-bar-space")
  })
  return (
    <nav
      aria-label={tr("shell.tabs")}
      class="bg-background/80 border-border fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur-[20px] backdrop-saturate-150"
    >
      <ul class="mx-auto flex max-w-[480px] px-2">
        <For each={destinations()} keyed={(destination) => destination.to}>
          {(destination) => (
            <li class="min-w-0 flex-1">
              <DestinationLink
                {...destination()}
                class="w-full pt-3 pb-4"
                selected={
                  pathname() === destination().to ||
                  (destination().to === "/media" &&
                    (pathname() === "/movies" || pathname() === "/shows"))
                }
                // A tap on the open tab goes back to its top, as the
                // Flutter tab bar's does.
                onClick={(event) => {
                  if (pathname() !== destination().to) return
                  event.preventDefault()
                  window.scrollTo({
                    top: 0,
                    behavior: reducedMotion() ? "auto" : "smooth",
                  })
                }}
              />
            </li>
          )}
        </For>
      </ul>
    </nav>
  )
}

/**
 * Back to the page this one was opened from, or Home when the app started
 * here, as from a shared link.
 */
export function useBack() {
  const router = useRouter()
  const navigate = useNavigate()
  return () => {
    if (router.history.canGoBack()) router.history.back()
    else void navigate({ to: "/" })
  }
}

/** A round icon button in a phone's bars. */
const barButton =
  "focus-visible:ring-ring text-foreground grid size-12 shrink-0 place-items-center rounded-full outline-none transition-[color,filter] hover:drop-shadow-[0_0_6px_currentColor] focus-visible:ring-2 active:bg-foreground/10"

/** A bare 48-box icon action, as a page bar's own actions are. */
export const phoneBarButton = barButton

/** The account's picture at a tab header's end, as the way to the profile. */
export function PhoneAvatar() {
  const context = useRouteContext({ from: "/_authed/_shell" })
  const user = () => context().user
  const name = () => user().displayName ?? user().username
  return (
    <Link
      to="/profiles/$username"
      params={{ username: user().username }}
      aria-label={tr("shell.openProfile", { name: name() })}
      class={barButton}
    >
      <UserAvatar user={user()} class="size-8 text-sm" />
    </Link>
  )
}

/**
 * A tab's band on a phone, as the Flutter app's `TabHeader`: the tab's name,
 * only the actions it has, then search where the tab offers it, and the
 * account's picture. The page renders it where the shell's Home band would
 * otherwise sit.
 */
export function TabHeader(props: {
  title: string
  actions?: JSX.Element
  /** Show search after the page's own actions. */
  search?: boolean
}) {
  return (
    <Show when={isPhone()}>
      <header class="bg-background sticky top-0 z-20 -mx-4 pt-[env(safe-area-inset-top)]">
        <div class="flex h-16 items-center pt-2 pr-1 pl-4">
          <h1 class="text-26px min-w-0 flex-1 truncate leading-8 font-bold tracking-tight">
            {props.title}
          </h1>
          {props.actions}
          <Show when={props.search}>
            <Link
              to="/search"
              aria-label={tr("search.title")}
              class={barButton}
            >
              <Icon icon={Search} class="size-6" />
            </Link>
          </Show>
          <PhoneAvatar />
        </div>
      </header>
    </Show>
  )
}

export function BackButton(props: { class?: string }) {
  const back = useBack()
  return (
    <button
      type="button"
      aria-label={tr("shell.back")}
      onClick={back}
      class={cn(barButton, props.class)}
    >
      <Icon icon={ArrowLeft} class="size-6" />
    </button>
  )
}

function HomeButton() {
  return (
    <Link to="/" aria-label={tr("shell.homeLink")} class={barButton}>
      <Icon icon={House} class="size-[22px]" />
    </Link>
  )
}

/**
 * The top of a page opened from a tab, on phones: Back, the page's name,
 * and what the page can do, in place of the shell's header band. Stays put
 * while the page scrolls. Pages with a `PageHeader` get theirs from it.
 */
export function PhoneTopBar(props: {
  /** Shown in the bar; the page's own heading stays its `h1`. */
  title?: string
  /** Home beside Back, for a page with no name in the bar. */
  home?: boolean
  actions?: JSX.Element
}) {
  return (
    <Show when={isPhone()}>
      <CoverTabs />
      <div class="bg-background sticky top-0 z-20 -mx-4 pt-[env(safe-area-inset-top)]">
        <div class="flex h-16 items-center pr-1 pl-1">
          <BackButton />
          <Show when={props.home}>
            <HomeButton />
          </Show>
          <p
            aria-hidden="true"
            class="min-w-0 flex-1 truncate pl-1 text-xl font-semibold tracking-tight"
          >
            {props.title}
          </p>
          {props.actions}
        </div>
      </div>
    </Show>
  )
}

/** The page's color veiling the art behind a floating button. */
const floatingButton =
  "bg-background/60 grid size-11 shrink-0 place-items-center rounded-full backdrop-blur-md outline-none focus-visible:ring-2 focus-visible:ring-ring"

/**
 * Back and Home over a title's, season's, or episode's art on phones, in
 * place of the shell's header band, with the page above it, like the show
 * of a season, in a pill. Pinned to the top while the page scrolls under
 * it, so the way back is always there.
 */
export function ItemTopBar(props: {
  /** A link to the page above this one, styled with {@link parentLink}. */
  parent?: JSX.Element
}) {
  const back = useBack()
  return (
    <Show when={isPhone()}>
      <CoverTabs />
      <div class="pointer-events-none fixed inset-x-0 top-0 z-30">
        {/* Keeps the status bar readable over bright art, in an installed
            app that draws under it. */}
        <div
          aria-hidden="true"
          class="from-background/90 absolute inset-x-0 top-0 h-[calc(env(safe-area-inset-top)*1.5)] bg-gradient-to-b to-transparent"
        />
        <div class="relative flex items-center gap-1.5 px-2 pt-[calc(env(safe-area-inset-top)+0.375rem)] *:pointer-events-auto">
          <button
            type="button"
            aria-label={tr("shell.back")}
            onClick={back}
            class={floatingButton}
          >
            <Icon icon={ArrowLeft} class="size-[22px]" />
          </button>
          <Link to="/" aria-label={tr("shell.homeLink")} class={floatingButton}>
            <Icon icon={House} class="size-5" />
          </Link>
          <Show when={props.parent}>
            <span class="bg-background/60 flex h-11 min-w-0 items-center rounded-full text-sm font-medium backdrop-blur-md empty:hidden">
              {props.parent}
            </span>
          </Show>
        </div>
      </div>
    </Show>
  )
}

/** The inside of an {@link ItemTopBar}'s pill: a link filling it. */
export const parentLink =
  "focus-visible:ring-ring block h-full min-w-0 truncate rounded-full px-4 leading-11 outline-none focus-visible:ring-2"
