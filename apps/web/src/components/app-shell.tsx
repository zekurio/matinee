import type { Library, User } from "@matinee/contracts"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@matinee/ui/components/dropdown-menu"
import { cn } from "@matinee/ui/lib/utils"
import { useQuery } from "@tanstack/react-query"
import { Link, useNavigate, useRouterState } from "@tanstack/react-router"
import {
  ChartColumnIcon,
  CheckIcon,
  ChevronDownIcon,
  FilmIcon,
  HouseIcon,
  LibraryBigIcon,
  LogOutIcon,
  SettingsIcon,
  ShieldIcon,
  TvIcon,
  UserRoundIcon,
} from "lucide-react"
import {
  type ComponentProps,
  type ComponentType,
  type ReactNode,
  useEffect,
} from "react"

import { tr } from "@/i18n"
import { orpc } from "@/lib/rpc"
import { useOpenSettings } from "@/lib/settings"
import { useSignOut } from "@/lib/sign-out"
import { useSearchSpotlightStore } from "@/stores/search-spotlight"

import { LogoMark } from "./brand"
import { TabBar, tabBarPadding, usePhoneTab } from "./phone-nav"
import { SearchButton, SearchSpotlight } from "./search/search-spotlight"
import { usePhone } from "./sheet-menu"
import { UserAvatar } from "./user-avatar"

export const libraryIcons = {
  movies: FilmIcon,
  shows: TvIcon,
} satisfies Record<Library["kind"], ComponentType<{ className?: string }>>

// Past this many libraries, the bar folds them into one menu.
const INLINE_LIBRARIES = 3

/**
 * The page column: the full window with a fixed gutter, like Jellyfin, so
 * big screens fit more cards instead of more margin. Capped only on very
 * wide screens. Full-bleed sections use it to line up with the page.
 */
export const pageColumn = "mx-auto w-full max-w-[160rem] px-4 sm:px-6 lg:px-14"

/**
 * Where a page's content starts: below the floating bar from `sm` up.
 * `<main>` pads its top by this much. Phones have no bar up there; each
 * page starts with its own (`PageHeader`, `PhoneTopBar`, `ItemTopBar`), or
 * with art, under the status bar.
 */
const pageTop = "sm:pt-24"

/**
 * Breaks a page's top section out of the column to the window edges and up
 * under the bar, for a backdrop behind it. The negative margin cancels
 * `<main>`'s top padding. Negative margins, not a -50% translate, which
 * lands on a half pixel at odd window widths.
 */
export const pageBleed = "relative mx-[calc(50%-50vw)] w-screen sm:-mt-24"

/** Shared look for everything that sits inside the bar. */
const pillItem =
  "inline-flex h-9 min-w-9 shrink-0 items-center justify-center gap-1.5 rounded-full px-3 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:min-w-11 text-sm font-medium text-foreground/70 outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-4 [&_svg]:shrink-0"
const pillActive = "bg-foreground/10 text-foreground"

/** The translucent capsule the bar sits in. */
const glass =
  "bg-background/60 rounded-full border border-foreground/10 p-1 shadow-[0_6px_20px_-8px_rgb(0_0_0/0.25)] dark:shadow-[0_8px_24px_-6px_rgb(0_0_0/0.6)] backdrop-blur-xl backdrop-saturate-150"

/** A menu item that marks the page you're on with a check. */
function CurrentItem({
  current,
  className,
  children,
  ...props
}: ComponentProps<typeof DropdownMenuItem> & { current?: boolean }) {
  return (
    <DropdownMenuItem
      aria-current={current ? "page" : undefined}
      className={cn(current && "font-medium", className)}
      {...props}
    >
      {children}
      {current && <CheckIcon className="text-muted-foreground ml-auto" />}
    </DropdownMenuItem>
  )
}

/** A tab's name, cut short with an ellipsis when the bar runs out of room. */
function NavLabel({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return <span className={cn("min-w-0 truncate", className)}>{children}</span>
}

/** A link in the bar. */
function PillLink({
  to,
  params,
  exact,
  icon: Icon,
  children,
}: {
  to: string
  params?: Record<string, string>
  exact?: boolean
  icon: ComponentType<{ className?: string }>
  children: ReactNode
}) {
  return (
    <Link
      to={to}
      params={params}
      activeOptions={{ exact, includeSearch: false }}
      activeProps={{ className: pillActive }}
      // A clicked link keeps focus, and the first key after, like Space to
      // scroll the page, would ring it. Enter from a keyboard keeps focus.
      onClick={(event) => {
        if (event.detail > 0) event.currentTarget.blur()
      }}
      className={pillItem}
    >
      <Icon />
      <NavLabel>{children}</NavLabel>
    </Link>
  )
}

/**
 * Libraries inline while there are few, one menu once there are many.
 * Phones list them on the Media tab instead.
 */
function LibraryLinks() {
  const libraries = useQuery(orpc.libraries.list.queryOptions())
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const list = libraries.data ?? []

  if (list.length <= INLINE_LIBRARIES) {
    return list.map((library) => (
      <PillLink
        key={library.id}
        to="/libraries/$libraryId"
        params={{ libraryId: library.id }}
        icon={libraryIcons[library.kind]}
      >
        {library.name}
      </PillLink>
    ))
  }

  const current = list.find((library) =>
    pathname.startsWith(`/libraries/${library.id}`),
  )
  const open = (library: Library) =>
    void navigate({
      to: "/libraries/$libraryId",
      params: { libraryId: library.id },
    })

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          pillItem,
          current && pillActive,
          "data-popup-open:bg-foreground/10",
        )}
      >
        <LibraryBigIcon />
        <NavLabel>{current?.name ?? tr("shell.libraries")}</NavLabel>
        <ChevronDownIcon className="text-muted-foreground !size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" sideOffset={8} className="min-w-52">
        {list.map((library) => {
          const Icon = libraryIcons[library.kind]
          return (
            <CurrentItem
              key={library.id}
              current={library.id === current?.id}
              onClick={() => open(library)}
            >
              <Icon />
              {library.name}
            </CurrentItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** The account's name, with a shield for admins. */
function AccountName({ user }: { user: User }) {
  return (
    <>
      <span className="truncate">{user.displayName ?? user.username}</span>
      {user.role === "admin" && (
        <ShieldIcon
          role="img"
          aria-label={tr("shell.admin")}
          className="text-muted-foreground size-3.5 shrink-0"
        />
      )}
    </>
  )
}

function AccountMenu({ user }: { user: User }) {
  const signOut = useSignOut()
  const openSettings = useOpenSettings()
  const navigate = useNavigate()
  const name = user.displayName ?? user.username
  const actions = [
    {
      label: tr("shell.profile"),
      icon: UserRoundIcon,
      run: () =>
        void navigate({
          to: "/profiles/$username",
          params: { username: user.username },
        }),
    },
    {
      label: tr("shell.statistics"),
      icon: ChartColumnIcon,
      run: () => void navigate({ to: "/stats" }),
    },
    {
      label: tr("shell.settings"),
      icon: SettingsIcon,
      run: () => openSettings(),
    },
  ]
  const accountLabel = tr("shell.account", { name })
  const trigger = (
    <button
      type="button"
      aria-label={accountLabel}
      className={cn(pillItem, "gap-2 pl-1", "data-popup-open:bg-foreground/10")}
    >
      <UserAvatar user={user} className="size-7 text-xs" />
      <NavLabel className="max-w-32">{name}</NavLabel>
      <ChevronDownIcon className="text-muted-foreground !size-3.5" />
    </button>
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={trigger} />
      <DropdownMenuContent align="center" sideOffset={8} className="min-w-52">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-normal">
            <span className="text-foreground flex items-center gap-1.5 text-sm font-medium">
              <AccountName user={user} />
            </span>
            {user.displayName && (
              <span className="text-muted-foreground block truncate text-xs">
                @{user.username}
              </span>
            )}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {actions.map((action) => (
          <DropdownMenuItem key={action.label} onClick={action.run}>
            <action.icon />
            {action.label}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onClick={() => signOut.mutate()}
        >
          <LogOutIcon />
          {tr("shell.signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * The floating bar, from `sm` up: a translucent pill centred at the top, so
 * pages use the full width instead of sharing it with a sidebar.
 */
function NavBar({ user }: { user: User }) {
  return (
    <>
      {/* Content fades out as it scrolls under the bar. */}
      <div
        aria-hidden
        className="from-background/90 via-background/50 pointer-events-none fixed inset-x-0 top-0 z-30 h-24 bg-gradient-to-b to-transparent"
      />
      <div className="pointer-events-none fixed inset-x-0 top-4 z-40 flex justify-center px-3">
        <nav
          aria-label={tr("shell.mainNav")}
          className={cn(
            glass,
            "pointer-events-auto flex max-w-full min-w-0 items-center gap-0.5",
          )}
        >
          <Link
            to="/"
            aria-label={tr("shell.homeLink")}
            // The bar's rounded end makes the left side read tighter, so the
            // mark gets less room on the right, toward the divider.
            className="focus-visible:ring-ring inline-flex h-9 shrink-0 items-center rounded-full pr-2 pl-3 outline-none focus-visible:ring-2 [@media(pointer:coarse)]:h-11"
          >
            <LogoMark className="size-6" />
          </Link>
          <span
            aria-hidden
            className="bg-foreground/10 mx-1 h-5 w-px shrink-0"
          />
          {/* A scroller clips both ways, so it pads out the width of a
              focus ring and takes the room back with a negative margin. */}
          <div className="-m-0.5 flex min-w-0 [scrollbar-width:none] items-center gap-0.5 overflow-x-auto p-0.5">
            <PillLink to="/" exact icon={HouseIcon}>
              {tr("shell.home")}
            </PillLink>
            <LibraryLinks />
          </div>
          <span
            aria-hidden
            className="bg-foreground/10 mx-1 h-5 w-px shrink-0"
          />
          <SearchButton className={cn(pillItem, "px-0")} />
          <AccountMenu user={user} />
        </nav>
      </div>
    </>
  )
}

export function AppShell({
  user,
  children,
}: {
  user: User
  children: ReactNode
}) {
  const phone = usePhone()
  const tab = usePhoneTab()
  // A shell that mounts again, after signing out and in, starts with an
  // empty search.
  useEffect(() => () => useSearchSpotlightStore.getState().reset(), [])
  return (
    // Clips the full-bleed hero's 100vw width so it never adds a
    // horizontal scrollbar.
    <div className="relative min-h-dvh overflow-x-clip">
      <a
        href="#main"
        className="bg-primary text-primary-foreground sr-only rounded-md px-3 py-2 text-sm font-medium focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50"
      >
        {tr("shell.skipToContent")}
      </a>
      {phone ? (
        tab && <TabBar user={user} current={tab} />
      ) : (
        <NavBar user={user} />
      )}
      <SearchSpotlight />
      <main
        id="main"
        tabIndex={-1}
        className={cn(
          pageColumn,
          pageTop,
          "pb-[calc(env(safe-area-inset-bottom)+2rem)] outline-none sm:pb-12",
          tab && tabBarPadding,
        )}
      >
        {children}
      </main>
    </div>
  )
}
