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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate, useRouterState } from "@tanstack/react-router"
import {
  CheckIcon,
  ChevronDownIcon,
  FilmIcon,
  FolderIcon,
  HouseIcon,
  LibraryBigIcon,
  LogOutIcon,
  SettingsIcon,
  TvIcon,
} from "lucide-react"
import {
  type ComponentProps,
  type ComponentType,
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import { createPortal } from "react-dom"

import { client, orpc } from "@/lib/rpc"
import { useOpenSettings } from "@/lib/settings"

import { LogoMark } from "./brand"

export const libraryIcons = {
  movies: FilmIcon,
  shows: TvIcon,
  other: FolderIcon,
} satisfies Record<Library["kind"], ComponentType<{ className?: string }>>

// Past this many libraries, the bar folds them into one menu.
const INLINE_LIBRARIES = 3

/** Shared look for everything that sits inside the bar. */
export const pillItem =
  "inline-flex h-9 min-w-9 shrink-0 items-center justify-center gap-0 rounded-full px-2.5 sm:gap-1.5 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:min-w-11 text-sm font-medium text-foreground/70 outline-none transition-colors hover:bg-white/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring sm:px-3 [&_svg]:size-4 [&_svg]:shrink-0"
const pillActive = "bg-white/10 text-foreground"

/** The translucent capsule the bar and its phone accessories sit in. */
export const glass =
  "bg-background/60 rounded-full border border-white/10 p-1 shadow-lg shadow-black/40 backdrop-blur-xl backdrop-saturate-150"

type BarSlot = {
  node: HTMLElement | null
  /** Hides the tabs so an accessory can take the whole bar. */
  setExpanded: (expanded: boolean) => void
}

const BarSlotContext = createContext<BarSlot | null>(null)

/**
 * Renders page controls, like search, in the phone tab bar beside the tabs.
 * Renders nothing from `sm` up, where pages keep them in their header.
 */
export function BarAccessory({
  expanded = false,
  children,
}: {
  /** Take the whole bar, hiding the tabs. */
  expanded?: boolean
  children: ReactNode
}) {
  const slot = useContext(BarSlotContext)
  const setExpanded = slot?.setExpanded
  useEffect(() => {
    if (!setExpanded) return
    setExpanded(expanded)
    return () => setExpanded(false)
  }, [expanded, setExpanded])
  return slot?.node ? createPortal(children, slot.node) : null
}

/**
 * Tracks the on-screen keyboard in `--keyboard-inset`, so the phone bar can
 * sit on top of it instead of behind it. Browsers that shrink the layout
 * viewport for the keyboard report 0 and need no help.
 */
function useKeyboardInset() {
  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    const root = document.documentElement
    const update = () => {
      // Pinch zoom shrinks the visual viewport too; that isn't a keyboard.
      const inset =
        Math.abs(viewport.scale - 1) > 0.01
          ? 0
          : window.innerHeight - viewport.height - viewport.offsetTop
      root.style.setProperty(
        "--keyboard-inset",
        `${Math.max(0, Math.round(inset))}px`,
      )
    }
    update()
    viewport.addEventListener("resize", update)
    viewport.addEventListener("scroll", update)
    return () => {
      viewport.removeEventListener("resize", update)
      viewport.removeEventListener("scroll", update)
      root.style.removeProperty("--keyboard-inset")
    }
  }, [])
}

function useSignOut() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return useMutation({
    mutationFn: () => client.auth.signOut(),
    onSuccess: async () => {
      queryClient.clear()
      await navigate({ to: "/login" })
    },
  })
}

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

/**
 * A tab's name. On phones only the active tab shows it, expanding beside the
 * icon like an iOS tab bar; collapsed names stay readable to screen readers.
 */
function NavLabel({
  active,
  children,
  className,
}: {
  active: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        "overflow-hidden text-ellipsis whitespace-nowrap",
        "max-sm:transition-[max-width,opacity,margin] max-sm:duration-300 motion-reduce:transition-none",
        active
          ? "max-sm:ml-1.5 max-sm:max-w-36 max-sm:opacity-100"
          : "max-sm:max-w-0 max-sm:opacity-0",
        className,
      )}
    >
      {children}
    </span>
  )
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
      className={pillItem}
    >
      {({ isActive }) => (
        <>
          <Icon />
          <NavLabel active={isActive}>{children}</NavLabel>
        </>
      )}
    </Link>
  )
}

/** Libraries inline while there are few, one menu once there are many. */
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
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          pillItem,
          current && pillActive,
          "data-popup-open:bg-white/10",
        )}
      >
        <LibraryBigIcon />
        <NavLabel active={current !== undefined}>
          {current?.name ?? "Libraries"}
        </NavLabel>
        <ChevronDownIcon className="text-muted-foreground !size-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" sideOffset={8} className="min-w-52">
        {list.map((library) => {
          const Icon = libraryIcons[library.kind]
          return (
            <CurrentItem
              key={library.id}
              current={library.id === current?.id}
              onClick={() =>
                void navigate({
                  to: "/libraries/$libraryId",
                  params: { libraryId: library.id },
                })
              }
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

function AccountMenu({ user }: { user: User }) {
  const signOut = useSignOut()
  const openSettings = useOpenSettings()
  const name = user.displayName ?? user.username
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Account: ${name}`}
        className={cn(
          pillItem,
          "gap-2 pl-1 sm:pl-1",
          "data-popup-open:bg-white/10",
        )}
      >
        <span
          aria-hidden
          className="bg-secondary text-secondary-foreground grid size-7 place-items-center rounded-full text-xs font-semibold"
        >
          {name.slice(0, 1).toUpperCase()}
        </span>
        <NavLabel active={false} className="sm:max-w-32">
          {name}
        </NavLabel>
        <ChevronDownIcon className="text-muted-foreground !size-3.5 max-sm:hidden" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="min-w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-normal">
            <span className="text-foreground block truncate text-sm font-medium">
              {name}
            </span>
            <span className="text-muted-foreground block truncate text-xs">
              {user.role === "admin" ? "Admin" : `@${user.username}`}
            </span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        {user.role === "admin" && (
          <DropdownMenuItem onClick={() => openSettings("libraries")}>
            <LibraryBigIcon />
            Manage libraries
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => openSettings()}>
          <SettingsIcon />
          Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => signOut.mutate()}>
          <LogOutIcon />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * The floating bar: a translucent pill centred over the content, so pages
 * use the full width instead of sharing it with a sidebar. On phones it sits
 * at the bottom, with room beside it for a page's accessory.
 */
function NavBar({
  user,
  expanded,
  onSlot,
}: {
  user: User
  expanded: boolean
  onSlot: (node: HTMLElement | null) => void
}) {
  return (
    <>
      {/* Content fades out as it scrolls under the bar. */}
      <div
        aria-hidden
        className="from-background/90 via-background/50 pointer-events-none fixed inset-x-0 top-0 z-30 h-24 bg-gradient-to-b to-transparent max-sm:hidden"
      />
      <div
        aria-hidden
        className="from-background via-background/70 pointer-events-none fixed inset-x-0 bottom-0 z-30 h-28 bg-gradient-to-t to-transparent sm:hidden"
      />
      <div
        // Phones: a floating tab bar above the home indicator, or above the
        // keyboard while it's open. Wider screens: the same pill at the top.
        className="pointer-events-none fixed inset-x-0 bottom-[max(calc(env(safe-area-inset-bottom)+12px),calc(var(--keyboard-inset,0px)+8px))] z-40 flex justify-center gap-2 px-3 sm:top-4 sm:bottom-auto"
      >
        <nav
          aria-label="Main"
          className={cn(
            glass,
            "pointer-events-auto flex max-w-full min-w-0 items-center gap-0.5",
            expanded && "max-sm:hidden",
          )}
        >
          <Link
            to="/"
            aria-label="Matinee home"
            className="focus-visible:ring-ring grid size-9 shrink-0 place-items-center rounded-full outline-none focus-visible:ring-2 max-sm:hidden [@media(pointer:coarse)]:size-11"
          >
            <LogoMark className="size-6" />
          </Link>
          <span
            aria-hidden
            className="mx-1 h-5 w-px shrink-0 bg-white/10 max-sm:hidden"
          />
          <div className="flex min-w-0 [scrollbar-width:none] items-center gap-0.5 overflow-x-auto">
            <PillLink to="/" exact icon={HouseIcon}>
              Home
            </PillLink>
            <LibraryLinks />
          </div>
          <span
            aria-hidden
            className="mx-1 h-5 w-px shrink-0 bg-white/10 max-sm:hidden"
          />
          <AccountMenu user={user} />
        </nav>
        <div ref={onSlot} className="pointer-events-auto contents sm:hidden" />
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
  const [node, setNode] = useState<HTMLElement | null>(null)
  const [expanded, setExpanded] = useState(false)
  const slot = useMemo(() => ({ node, setExpanded }), [node])
  useKeyboardInset()
  return (
    // Clips the full-bleed hero's 100vw width so it never adds a
    // horizontal scrollbar.
    <div className="min-h-dvh overflow-x-clip">
      <a
        href="#main"
        className="bg-primary text-primary-foreground sr-only rounded-md px-3 py-2 text-sm font-medium focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50"
      >
        Skip to content
      </a>
      <NavBar user={user} expanded={expanded} onSlot={setNode} />
      {/* Padding clears the bar: bottom on phones, top from sm up. */}
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto w-full max-w-6xl px-4 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-[calc(env(safe-area-inset-bottom)+7rem)] outline-none sm:px-6 sm:pt-24 sm:pb-12 lg:px-8"
      >
        <BarSlotContext value={slot}>{children}</BarSlotContext>
      </main>
    </div>
  )
}
