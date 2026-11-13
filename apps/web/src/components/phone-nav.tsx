import type { User } from "@matinee/contracts"
import { cn } from "@matinee/ui/lib/utils"
import {
  Link,
  useNavigate,
  useRouteContext,
  useRouter,
  useRouterState,
} from "@tanstack/react-router"
import {
  ArrowLeftIcon,
  HouseIcon,
  LibraryBigIcon,
  type LucideIcon,
  SearchIcon,
} from "lucide-react"
import { type ReactNode, useEffect } from "react"

import { tr } from "@/i18n"

import { UserAvatar } from "./user-avatar"

/*
 * Phones lay the app out as the Android app does: Home, Media, and the
 * profile in a floating tab bar on their first pages, search in a circle
 * beside it, and a bar with Back at the top of every page opened from them.
 * Title, season, and episode pages float Back and Home over their art.
 */

/** A tab, named by the page it opens on. */
export type PhoneTab = "home" | "media" | "profile" | "search"

/** The tab whose first page `pathname` is, if it is one. */
function tabAt(pathname: string, username: string): PhoneTab | null {
  if (pathname === "/") return "home"
  // Settings opened fresh sit over Home.
  if (pathname === "/settings" || pathname.startsWith("/settings/")) {
    return "home"
  }
  if (pathname === "/media") return "media"
  if (pathname === "/search") return "search"
  const profile = "/profiles/"
  if (
    pathname.startsWith(profile) &&
    decodeURIComponent(pathname.slice(profile.length)) === username
  ) {
    return "profile"
  }
  return null
}

/** The tab whose first page is open, or null on a page opened from one. */
export function usePhoneTab(): PhoneTab | null {
  const { user } = useRouteContext({ from: "/_authed/_shell" })
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  return tabAt(pathname, user.username)
}

/**
 * What the tab bar takes from the bottom of a page, above the home
 * indicator: the bar, the gap under it, and a gap over it so a page's last
 * row and a toast clear it.
 */
const TAB_BAR_SPACE = "5rem"

/** Bottom padding for a tab's first page, so its end clears the tab bar. */
export const tabBarPadding =
  "max-sm:pb-[calc(env(safe-area-inset-bottom)+6.5rem)]"

/** The bar's surfaces: frosted, with a faint rim, lifted off the page. */
const floating =
  "pointer-events-auto rounded-full border border-foreground/[0.08] bg-popover/85 p-1 shadow-[0_10px_32px_-6px_rgb(0_0_0/0.55)] backdrop-blur-xl backdrop-saturate-150"

/** A tab's touch target: a pill behind the open one, and a little give when pressed. */
const tabItem =
  "focus-visible:ring-ring inline-flex h-13 min-w-14 items-center justify-center gap-2 rounded-full outline-none transition-[color,background-color,padding,scale] duration-200 select-none focus-visible:ring-2 active:scale-[0.92] motion-reduce:transition-none [&_svg]:size-[22px] [&_svg]:shrink-0"

function tabLook(open: boolean) {
  return open
    ? "bg-foreground/10 px-[18px] text-foreground"
    : "text-muted-foreground hover:text-foreground"
}

/**
 * The tabs, floating over the bottom of a tab's first page, which scrolls
 * on under them: a capsule of the tabs, and search in a circle beside it.
 * The open tab shows its name beside its icon; the rest only their icons.
 */
export function TabBar({ user, current }: { user: User; current: PhoneTab }) {
  // Toasts rise over the bar while it shows.
  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty("--tab-bar-space", TAB_BAR_SPACE)
    return () => {
      root.style.removeProperty("--tab-bar-space")
    }
  }, [])

  // Home stays under the other tabs, so Back from one goes Home rather
  // than through every tab picked on the way.
  const replace = current !== "home"
  return (
    <nav
      aria-label={tr("shell.tabs")}
      // The page fades out under the bar, so rows passing beneath don't
      // fight its labels.
      className="from-background/0 via-background/85 to-background pointer-events-none fixed inset-x-0 bottom-0 z-30 flex items-center justify-center gap-2.5 bg-gradient-to-b via-55% pt-7 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:hidden"
    >
      <div className={cn(floating, "flex items-center")}>
        <TabLink
          to="/"
          icon={HouseIcon}
          label={tr("shell.home")}
          open={current === "home"}
          replace={replace}
        />
        <TabLink
          to="/media"
          icon={LibraryBigIcon}
          label={tr("shell.media")}
          open={current === "media"}
          replace={replace}
        />
        <Link
          to="/profiles/$username"
          params={{ username: user.username }}
          replace={replace}
          aria-label={tr("shell.profile")}
          aria-current={current === "profile" ? "page" : undefined}
          className={cn(tabItem, tabLook(current === "profile"))}
        >
          {current === "profile" ? (
            <span className="border-foreground grid size-7 place-items-center rounded-full border-[1.5px]">
              <UserAvatar user={user} className="size-[22px] text-[10px]" />
            </span>
          ) : (
            <UserAvatar user={user} className="size-7 text-xs" />
          )}
          {current === "profile" && (
            <span className="text-sm font-medium">{tr("shell.profile")}</span>
          )}
        </Link>
      </div>
      <div className={floating}>
        <Link
          to="/search"
          replace={replace}
          aria-label={tr("search.title")}
          aria-current={current === "search" ? "page" : undefined}
          className={cn(
            tabItem,
            "size-13 min-w-13",
            current === "search"
              ? "bg-foreground/10 text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <SearchIcon />
        </Link>
      </div>
    </nav>
  )
}

function TabLink({
  to,
  icon: Icon,
  label,
  open,
  replace,
}: {
  to: "/" | "/media"
  icon: LucideIcon
  label: string
  open: boolean
  replace: boolean
}) {
  return (
    <Link
      to={to}
      replace={replace}
      aria-label={label}
      aria-current={open ? "page" : undefined}
      className={cn(tabItem, tabLook(open))}
    >
      <Icon aria-hidden />
      {open && (
        <span aria-hidden className="text-sm font-medium">
          {label}
        </span>
      )}
    </Link>
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
  "focus-visible:ring-ring text-foreground grid size-12 shrink-0 place-items-center rounded-full outline-none transition-colors hover:bg-foreground/[0.06] focus-visible:ring-2 active:bg-foreground/10 [&_svg]:size-6"

export function BackButton({ className }: { className?: string }) {
  const back = useBack()
  return (
    <button
      type="button"
      aria-label={tr("shell.back")}
      onClick={back}
      className={cn(barButton, className)}
    >
      <ArrowLeftIcon />
    </button>
  )
}

function HomeButton({ className }: { className?: string }) {
  return (
    <Link
      to="/"
      aria-label={tr("shell.homeLink")}
      className={cn(barButton, "[&_svg]:size-[22px]", className)}
    >
      <HouseIcon />
    </Link>
  )
}

/**
 * The top of a page opened from a tab, on phones: Back, the page's name,
 * and what the page can do. Stays put while the page scrolls. Pages with
 * a `PageHeader` get theirs from it.
 */
export function PhoneTopBar({
  title,
  home = false,
  actions,
}: {
  /** Shown in the bar; the page's own heading stays its `h1`. */
  title?: string
  /** Home beside Back, for a page with no name in the bar. */
  home?: boolean
  actions?: ReactNode
}) {
  return (
    <div className="bg-background sticky top-0 z-20 -mx-4 pt-[env(safe-area-inset-top)] sm:hidden">
      <div className="flex h-16 items-center pr-1 pl-1">
        <BackButton />
        {home && <HomeButton />}
        <p
          aria-hidden
          className="min-w-0 flex-1 truncate pl-1 text-xl font-semibold tracking-tight"
        >
          {title}
        </p>
        {actions}
      </div>
    </div>
  )
}

/** The page's color veiling the art behind a floating button. */
const floatingButton =
  "bg-background/60 grid size-11 shrink-0 place-items-center rounded-full backdrop-blur-md outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-[22px]"

/**
 * Back and Home over a title's, season's, or episode's art on phones, with
 * the page above it, like the show of a season, in a pill. Pinned to the
 * top while the page scrolls under it, so the way back is always there.
 */
export function ItemTopBar({
  parent,
}: {
  /** A link to the page above this one, styled with {@link parentLink}. */
  parent?: ReactNode
}) {
  const back = useBack()
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-30 sm:hidden">
      {/* Keeps the status bar readable over bright art, in an installed
          app that draws under it. */}
      <div
        aria-hidden
        className="from-background/90 absolute inset-x-0 top-0 h-[calc(env(safe-area-inset-top)*1.5)] bg-gradient-to-b to-transparent"
      />
      <div className="relative flex items-center gap-1.5 px-2 pt-[calc(env(safe-area-inset-top)+0.375rem)] *:pointer-events-auto">
        <button
          type="button"
          aria-label={tr("shell.back")}
          onClick={back}
          className={floatingButton}
        >
          <ArrowLeftIcon />
        </button>
        <Link
          to="/"
          aria-label={tr("shell.homeLink")}
          className={cn(floatingButton, "[&_svg]:size-5")}
        >
          <HouseIcon />
        </Link>
        {parent && (
          <span className="bg-background/60 flex h-11 min-w-0 items-center rounded-full text-sm font-medium backdrop-blur-md empty:hidden">
            {parent}
          </span>
        )}
      </div>
    </div>
  )
}

/** The inside of an {@link ItemTopBar}'s pill: a link filling it. */
export const parentLink =
  "focus-visible:ring-ring block h-full min-w-0 truncate rounded-full px-4 leading-11 outline-none focus-visible:ring-2"
