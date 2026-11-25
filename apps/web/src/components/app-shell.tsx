import type { User } from "@matinee/contracts"
import { cn } from "@matinee/ui/lib/utils"
import type { JSX } from "@solidjs/web"
import { Link, useNavigate } from "@tanstack/solid-router"
import {
  ChartColumn,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Search,
  Settings,
  Shield,
  UsersRound,
} from "lucide"
import { createSignal, For, onSettled, type ParentProps, Show } from "solid-js"

import { tr } from "@/i18n"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/kit/dropdown-menu"
import { Icon, type IconNode } from "@/kit/icon"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/kit/tooltip"
import { useHistorySteps } from "@/lib/history-steps"
import { usePartyRole } from "@/lib/party"
import { useOpenSettings } from "@/lib/settings"
import { useSignOut } from "@/lib/sign-out"
import { isPhone } from "@/lib/viewport"
import { focusSearch, resetSearch } from "@/stores/search"

import { Logo, LogoMark } from "./brand"
import { DestinationLink, useDestinations } from "./destinations"
import { PageScrollbar } from "./page-scrollbar"
import { PartyDialog } from "./party/party-panel"
import {
  PhoneAvatar,
  TabBar,
  tabBarPadding,
  tabsCovered,
  usePhoneTab,
} from "./phone-nav"
import { SearchField } from "./search/search-field"
import { UserAvatar } from "./user-avatar"

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

export { libraryIcons } from "./destinations"

/** The rail's width, which the bar and the page start after. */
const RAIL = "w-16"

/**
 * The rail: the destinations under the logo's cell. Solid, with a hairline
 * on its page side, as the Flutter tab bar has one on its top.
 */
function NavRail() {
  const destinations = useDestinations()
  const railItem = "relative w-full py-1.5"
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
              <DestinationLink {...destination()} rail class={railItem} />
            </li>
          )}
        </For>
      </ul>
    </nav>
  )
}

const barButton =
  "text-foreground/75 enabled:hover:text-foreground focus-visible:outline-ring grid size-9 place-items-center rounded-full transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid disabled:opacity-35 motion-reduce:transition-none"

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
          onPointerDown={(event) => {
            if (event.currentTarget.matches(":focus-visible")) {
              event.currentTarget.blur()
            }
          }}
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
 * Cmd or Ctrl and K, from anywhere in the shell: the bar's field on a
 * desktop, and the search page on a phone, which has no bar to put a caret
 * in.
 */
function useSearchShortcut() {
  const navigate = useNavigate()
  onSettled(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat) return
      if (!(event.metaKey || event.ctrlKey)) return
      if (event.key.toLowerCase() !== "k") return
      event.preventDefault()
      if (isPhone()) void navigate({ to: "/search" })
      else focusSearch()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  })
}

function TopBar(props: { user: User }) {
  const steps = useHistorySteps()
  return (
    <header class="fixed inset-x-0 top-0 z-40 flex h-16">
      <Link
        to="/"
        aria-label={tr("shell.homeLink")}
        class={cn(
          RAIL,
          "group/logo bg-background supports-backdrop-filter:bg-background/85 [@media(prefers-reduced-transparency:reduce)]:bg-background border-border grid h-full shrink-0 place-items-center border-r outline-none supports-backdrop-filter:backdrop-blur-xl",
        )}
      >
        <span class="group-focus-visible/logo:ring-ring grid size-11 place-items-center rounded-full transition-transform duration-200 group-focus-visible/logo:ring-2 group-active/logo:scale-[0.92] motion-reduce:transition-none">
          <LogoMark class="size-7" />
        </span>
      </Link>
      <div class="bg-background supports-backdrop-filter:bg-background/85 [@media(prefers-reduced-transparency:reduce)]:bg-background grid min-w-0 flex-1 grid-cols-[1fr_minmax(0,30rem)_1fr] items-center gap-3 px-3 supports-backdrop-filter:backdrop-blur-xl">
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
          <SearchField />
        </div>
        <div class="flex items-center justify-end gap-1">
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
 * profile, the watch party, statistics, settings, and signing out.
 */
function AccountMenu(props: { user: User; class?: string }) {
  const signOut = useSignOut()
  const navigate = useNavigate()
  const openSettings = useOpenSettings()
  const name = () => props.user.displayName ?? props.user.username
  const role = usePartyRole()
  const [partyOpen, setPartyOpen] = createSignal(false)
  const accountLabel = () => tr("shell.account", { name: name() })
  const separateUsername = () => {
    const displayName = props.user.displayName?.trim()
    return (
      displayName !== undefined &&
      displayName.length > 0 &&
      displayName.toLowerCase() !== props.user.username.toLowerCase()
    )
  }
  const item = (icon: IconNode, label: string): JSX.Element => (
    <>
      <Icon icon={icon} />
      {label}
    </>
  )
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={accountLabel()}
          class={cn(
            "hover:brightness-110 aria-expanded:brightness-110 focus-visible:outline-ring grid size-12 shrink-0 place-items-center rounded-full transition-[filter] outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-solid motion-reduce:transition-none sm:size-10",
            props.class,
          )}
        >
          <UserAvatar user={props.user} class="size-8 text-sm" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={6} class="w-56">
          <DropdownMenuItem
            aria-label={tr("shell.openProfile", { name: name() })}
            class="gap-3 py-2"
            onSelect={() =>
              void navigate({
                to: "/profiles/$username",
                params: { username: props.user.username },
              })
            }
          >
            <UserAvatar user={props.user} class="size-8 text-sm" />
            <span class="min-w-0 flex-1">
              <span class="text-foreground flex items-center gap-1.5 truncate text-sm font-medium">
                <AccountName user={props.user} />
              </span>
              <Show when={separateUsername()}>
                <span class="text-muted-foreground block truncate text-xs">
                  @{props.user.username}
                </span>
              </Show>
            </span>
            <Icon
              icon={ChevronRight}
              class="text-muted-foreground ml-auto size-4"
            />
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setPartyOpen(true)}>
            {item(UsersRound, tr("party.title"))}
            <Show when={role()}>
              <span
                aria-hidden="true"
                class="bg-primary ml-auto size-2 rounded-full"
              />
            </Show>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void navigate({ to: "/stats" })}>
            {item(ChartColumn, tr("shell.statistics"))}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => openSettings()}>
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
      <PartyDialog open={partyOpen()} onOpenChange={setPartyOpen} />
    </>
  )
}

/**
 * A phone's Home band, the Flutter phone's: the logo at the start, search
 * as a bare icon, and the avatar at the end, which opens the profile. It
 * stays put while the page scrolls, on the page's own color. The row sits 8
 * under the top, as the Flutter band's does, within a thumb's reach. Other
 * tab roots draw their own `TabHeader`.
 */
function PhoneHeader() {
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
        <PhoneAvatar />
      </div>
    </header>
  )
}

export function AppShell(props: ParentProps<{ user: User }>) {
  useSearchShortcut()
  // The search goes with the account, so the next sign-in starts empty.
  onSettled(() => resetSearch)
  const tab = usePhoneTab()
  // Media and Explore draw their own tab band, as the Flutter shell does.
  const ownTabHeader = () => tab() === "media" || tab() === "explore"
  return (
    <div class="relative min-h-dvh">
      <a
        href="#main"
        class="bg-primary text-primary-foreground sr-only rounded-md px-3 py-2 text-sm font-medium focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50"
      >
        {tr("shell.skipToContent")}
      </a>
      <Show
        when={!isPhone()}
        fallback={
          <Show when={!tabsCovered() && !ownTabHeader()}>
            <PhoneHeader />
          </Show>
        }
      >
        <TopBar user={props.user} />
        <NavRail />
      </Show>
      <main
        id="main"
        tabindex="-1"
        // A page that covers the phone's chrome starts at the top of the
        // screen with its own bar, and ends clear of the home indicator.
        class={cn(
          "outline-none sm:pt-16 sm:pb-12 sm:pl-16",
          tabsCovered()
            ? "max-sm:pb-[calc(env(safe-area-inset-bottom)+2rem)]"
            : [
                ownTabHeader()
                  ? undefined
                  : "max-sm:pt-[calc(env(safe-area-inset-top)+4rem)]",
                tabBarPadding,
              ],
        )}
      >
        {props.children}
      </main>
      <Show when={isPhone() && !tabsCovered()}>
        <TabBar />
      </Show>
      <PageScrollbar />
    </div>
  )
}
