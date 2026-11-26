import type { TitleKind, User } from "@matinee/contracts"
import type { JSX } from "@solidjs/web"
import { Film, Heart, House, type IconNode, Search, Settings, Tv } from "lucide"
import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onSettled,
} from "solid-js"

import { forgetPictures } from "../api/images"
import { Actions } from "../app/actions"
import { Chrome, ChromeContext } from "../app/chrome"
import { keepRoutes, keptRoutes } from "../app/history"
import { type Entry, Navigator, type Route } from "../app/navigator"
import { AppContext, type AppScope, PageContext, Toasts } from "../app/scope"
import { nameOf, session } from "../auth/session"
import { locale, tr } from "../i18n"
import { focused, focusOn } from "../input/focus"
import { startGamepads } from "../input/gamepad"
import { refocus, useBack } from "../input/navigation"
import { cx, Icon, Tap } from "../kit/base"
import { Avatar, Picture } from "../kit/cards"
import { useObserved } from "../lib/observable"
import { Viewer } from "../model/viewer"
import { platform } from "../platform/runtime"
import { ActionsPanel } from "./actions"

type DrawerEntry = {
  key: string
  label: string
  icon: IconNode | null
  route: Route
}

/** The drawer entry a page belongs to, if any. */
function entryKey(route: Route): string | null {
  switch (route.page) {
    case "home":
    case "search":
    case "favorites":
    case "settings":
      return route.page
    case "profile":
    case "recent":
      return "profile"
    case "kind":
      return `kind-${route.kind}`
    default:
      return null
  }
}

/** The time at the top right of every TV page, in the TV's 12 or 24 hour style. */
function Clock(props: { away: boolean }) {
  const [now, setNow] = createSignal(new Date())
  const format = createMemo(
    () =>
      new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }),
  )
  onSettled(() => {
    let timer = 0
    const tick = () => {
      const current = new Date()
      setNow(current)
      // Wake at the turn of the next minute.
      timer = window.setTimeout(tick, 60_000 - (current.getTime() % 60_000))
    }
    tick()
    return () => window.clearTimeout(timer)
  })
  return (
    <div class={cx("clock t-clock", props.away && "away")}>
      {format().format(now())}
    </div>
  )
}

/** How long focus has to rest before the backdrop follows it. */
const SETTLE_MS = 350

const NO_PICTURES: readonly string[] = []

/**
 * The picture behind a page, dimmed from the left and the bottom where a
 * page's text and rows sit, fading in when it changes. A change on the
 * same page waits for focus to rest, so a held arrow doesn't load every
 * picture it passes; a new page's shows at once, and one that asks for
 * none gets the plain background.
 */
function Backdrop(props: { chrome: Chrome; page: number }) {
  const chrome = useObserved(props.chrome)
  const backdrop = () =>
    chrome().backdropPage === props.page ? chrome().backdrop : NO_PICTURES
  const wanted = () => `${chrome().backdropPage} ${backdrop().join(" ")}`
  const [shown, setShown] = createSignal({
    page: chrome().backdropPage,
    sources: chrome().backdrop,
  })
  createEffect(
    () => wanted(),
    () => {
      const current = chrome()
      const sources = backdrop()
      const show = () => setShown({ page: current.backdropPage, sources })
      const before = shown()
      const rests =
        before.page === current.backdropPage &&
        before.sources.length > 0 &&
        sources.length > 0
      if (!rests) {
        show()
        return
      }
      const timer = window.setTimeout(show, SETTLE_MS)
      return () => window.clearTimeout(timer)
    },
  )
  const key = () => shown().sources.join(" ")
  return (
    <div class="backdrop fill">
      <Show when={key()} keyed>
        {(_key) => (
          <div class="backdrop-picture fill">
            <Picture sources={shown().sources} class="top-end" />
            <div class="backdrop-scrim fill" />
          </div>
        )}
      </Show>
    </div>
  )
}

/**
 * The TV's navigation, as Wholphin's: a rail of icons at the left edge
 * that grows into a labelled drawer over the page while it has focus. The
 * current page's entry is marked. Left from a page's first column comes
 * in; Right or Back hands focus back to the page.
 */
function Drawer(props: {
  user: User
  kinds: { movie: number; show: number } | null
  current: string
  shown: string | null
  nav: Navigator
  open: boolean
  onOpen: (open: boolean) => void
  onLeave: () => void
}) {
  const kind = (
    which: TitleKind,
    label: string,
    icon: IconNode,
  ): DrawerEntry => ({
    key: `kind-${which}`,
    label,
    icon,
    route: { page: "kind", kind: which },
  })
  const entries = (): DrawerEntry[] => [
    {
      key: "search",
      label: tr("searchTitle"),
      icon: Search,
      route: { page: "search" },
    },
    {
      key: "home",
      label: tr("tabHome"),
      icon: House,
      route: { page: "home" },
    },
    {
      key: "favorites",
      label: tr("favoritesTitle"),
      icon: Heart,
      route: { page: "favorites" },
    },
    // Only the kinds the server has.
    ...(props.kinds && props.kinds.movie > 0
      ? [kind("movie", tr("browseKindMovie"), Film)]
      : []),
    ...(props.kinds && props.kinds.show > 0
      ? [kind("show", tr("browseKindShow"), Tv)]
      : []),
  ]
  const profile = (): DrawerEntry => ({
    key: "profile",
    label: nameOf(props.user),
    icon: null,
    route: { page: "profile" },
  })
  const settings = (): DrawerEntry => ({
    key: "settings",
    label: tr("shellSettings"),
    icon: Settings,
    route: { page: "settings" },
  })
  const pick = (entry: DrawerEntry) => {
    // The page on screen already: back to it rather than open it again.
    if (entry.key === props.shown) props.onLeave()
    else props.nav.drawer(entry.route)
  }
  const draw = (entry: DrawerEntry) => (
    <Tap
      fid={entry.key}
      class={cx("ctl drawer-entry", entry.key === props.current && "current")}
      label={entry.label}
      onPress={() => pick(entry)}
    >
      <span class="drawer-icon center">
        {entry.icon ? (
          <Icon icon={entry.icon} size={24} />
        ) : (
          <Avatar name={entry.label} url={props.user.avatarUrl} size={32} />
        )}
      </span>
      <span class="drawer-label t-facts one-line">{entry.label}</span>
    </Tap>
  )
  return (
    <div
      class={cx("drawer", props.open && "open")}
      data-ft=""
      data-drawer=""
      onFocusIn={() => props.onOpen(true)}
      onFocusOut={(event: FocusEvent) => {
        const next = event.relatedTarget
        if (!(next instanceof Node) || !event.currentTarget) props.onOpen(false)
        else if (
          event.currentTarget instanceof Node &&
          !event.currentTarget.contains(next)
        ) {
          props.onOpen(false)
        }
      }}
      onKeyDown={(event: KeyboardEvent) => {
        // Right leaves, whichever entry has focus.
        if (event.keyCode === 39) {
          event.preventDefault()
          props.onLeave()
        }
      }}
    >
      <div class="drawer-entries" data-fg="drawer" data-fk="col">
        {draw(profile())}
        <For each={entries()}>{(entry) => draw(entry)}</For>
        <span class="drawer-space" />
        {draw(settings())}
      </div>
    </div>
  )
}

function Toast(props: { toasts: Toasts }) {
  const toasts = useObserved(props.toasts)
  return (
    <Show when={toasts().message} keyed>
      {(message) => (
        <div class="toast t-body" role="status">
          {message}
        </div>
      )}
    </Show>
  )
}

/**
 * The signed-in app on a TV: its pages, under a drawer at the left edge,
 * over the backdrop the page picks, with the clock at the top right. The
 * player takes the whole screen, with none of that around it.
 */
export function SignedInApp(props: {
  user: User
  pages: (entry: Entry) => JSX.Element
}) {
  // A new sign-in starts the pages, and what they keep, afresh, but a
  // reload comes back to the pages it left.
  const signedIn = session.state
  const account =
    signedIn.kind === "signedIn" ? `${signedIn.user.id} ${signedIn.server}` : ""
  const scope = {
    nav: new Navigator(keptRoutes(account)),
    viewer: new Viewer(),
    toasts: new Toasts(),
    actions: new Actions(),
  }
  const chrome = new Chrome()
  const observed = useObserved(session)
  // A saved preference replaces the session's user; the app stays mounted,
  // so its fields read the newest one.
  const currentUser = (): User => {
    const current = observed().state
    return current.kind === "signedIn" ? current.user : props.user
  }
  const liveUser: User = {
    get id() {
      return currentUser().id
    },
    get username() {
      return currentUser().username
    },
    get displayName() {
      return currentUser().displayName
    },
    get role() {
      return currentUser().role
    },
    get permissions() {
      return currentUser().permissions
    },
    get avatarUrl() {
      return currentUser().avatarUrl
    },
    get avatarSource() {
      return currentUser().avatarSource
    },
    get playback() {
      return currentUser().playback
    },
    get library() {
      return currentUser().library
    },
    get sharing() {
      return currentUser().sharing
    },
  }
  const app: AppScope = { ...scope, user: liveUser }
  const nav = useObserved(scope.nav)
  const chromeState = useObserved(chrome)
  const viewer = useObserved(scope.viewer)
  const [drawerOpen, setDrawerOpen] = createSignal(false)
  const [kinds, setKinds] = createSignal<{
    movie: number
    show: number
  } | null>(null)
  let root: HTMLDivElement | undefined

  onSettled(() => forgetPictures)
  onSettled(() => keepRoutes(scope.nav, account))
  // A browser's game controller works the remote's keys. Start plays and
  // pauses on the player, and opens the focused item's menu elsewhere.
  onSettled(() => startGamepads(() => (playing() ? "playPause" : "menu")))
  // How many movies and shows there are, so the drawer offers only the kinds the server has.
  createEffect(
    () => viewer().version,
    () => {
      let over = false
      session.api.titles.browse({ limit: 1 }).then(
        (answer) => {
          if (!over) setKinds(answer.kinds)
        },
        () => {
          // The drawer does without them until the next try.
        },
      )
      return () => {
        over = true
      }
    },
  )

  const top = () => nav().top
  const playing = () => top().route.page === "player"
  const onHome = () => top().route.page === "home"
  const current = () =>
    nav()
      .stack.map((entry) => entryKey(entry.route))
      .findLast((key) => key !== null) ?? "home"
  const shown = () =>
    top().route.page === "recent" ? null : entryKey(top().route)

  const toPage = () => refocus()
  const toDrawer = () => {
    const entry = root?.querySelector<HTMLElement>(
      `[data-drawer] [data-f="${current()}"]`,
    )
    focusOn(entry ?? root?.querySelector<HTMLElement>("[data-drawer]"))
  }

  // Under every page's own Back: out of the drawer, back a page, and from
  // Home into the drawer, then out of the app. A browser has no app to
  // leave, so there Back closes the drawer again.
  useBack(() => {
    if (drawerOpen() && !onHome()) toPage()
    else if (drawerOpen()) {
      // A TV's Back leaves the app from Home; a browser has a page under it.
      if (platform().onTv) platform().exitApp()
      else toPage()
    } else if (nav().canGoBack) nav().back()
    else toDrawer()
  })

  onSettled(() => {
    const node = root
    if (!node) return
    const listener = (event: Event) => {
      if (!(event instanceof CustomEvent) || event.detail !== "left") return
      if (playing()) return
      // Only a page's own left edge opens the drawer, not a panel's.
      const from = focused()
      if (from?.closest("[data-ft]")?.hasAttribute("data-page")) toDrawer()
    }
    node.addEventListener("focusedge", listener)
    return () => node.removeEventListener("focusedge", listener)
  })

  return (
    <AppContext value={app}>
      <ChromeContext value={chrome}>
        <div ref={(node) => (root = node)} class="fill">
          <Show when={!playing()}>
            <Backdrop chrome={chrome} page={top().id} />
          </Show>
          <Show when={top()} keyed>
            {(entry) => (
              <PageContext value={entry}>{props.pages(entry)}</PageContext>
            )}
          </Show>
          <Show when={!playing()}>
            <Clock
              away={chromeState().panels > 0 || chromeState().scrolled > 0}
            />
            <Drawer
              user={liveUser}
              kinds={kinds()}
              current={current()}
              shown={shown()}
              nav={scope.nav}
              open={drawerOpen()}
              onOpen={setDrawerOpen}
              onLeave={toPage}
            />
          </Show>
          <ActionsPanel />
          <Toast toasts={scope.toasts} />
        </div>
      </ChromeContext>
    </AppContext>
  )
}
