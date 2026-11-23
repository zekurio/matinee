import type { TitleKind, User } from "@matinee/contracts"
import { Film, Heart, House, type IconNode, Search, Settings, Tv } from "lucide"
import type { ComponentChildren } from "preact"
import { useEffect, useMemo, useRef, useState } from "preact/hooks"

import { forgetPictures } from "@/api/images"
import { Actions } from "@/app/actions"
import { Chrome, ChromeContext } from "@/app/chrome"
import { type Entry, Navigator, type Route } from "@/app/navigator"
import { AppContext, type AppScope, PageContext, Toasts } from "@/app/scope"
import { nameOf, session } from "@/auth/session"
import { locale, tr } from "@/i18n"
import { focused, focusOn } from "@/input/focus"
import { refocus, useBack } from "@/input/navigation"
import { cx, Icon, Tap } from "@/kit/base"
import { Avatar, Picture } from "@/kit/cards"
import { useObserved } from "@/lib/observable"
import { Viewer } from "@/model/viewer"
import { exitApp } from "@/platform/tizen"

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
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    let timer = 0
    const tick = () => {
      const current = new Date()
      setNow(current)
      // Wake at the turn of the next minute.
      timer = window.setTimeout(tick, 60_000 - (current.getTime() % 60_000))
    }
    tick()
    return () => window.clearTimeout(timer)
  }, [])
  const format = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }),
    [],
  )
  return (
    <div class={cx("clock t-clock", props.away && "away")}>
      {format.format(now)}
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
  const { backdropPage } = chrome
  // A page that asks for none leaves the last page's behind: it isn't this one's.
  const backdrop = backdropPage === props.page ? chrome.backdrop : NO_PICTURES
  const wanted = backdrop.join(" ")
  const [shown, setShown] = useState({ page: backdropPage, sources: backdrop })
  useEffect(() => {
    const show = () => setShown({ page: backdropPage, sources: backdrop })
    const rests =
      shown.page === backdropPage &&
      shown.sources.length > 0 &&
      backdrop.length > 0
    if (!rests) {
      show()
      return
    }
    const timer = window.setTimeout(show, SETTLE_MS)
    return () => window.clearTimeout(timer)
  }, [wanted, backdropPage])
  const key = shown.sources.join(" ")
  return (
    <div class="backdrop fill">
      {backdrop.length > 0 && shown.sources.length > 0 && (
        <div key={key} class="backdrop-picture fill">
          <Picture sources={shown.sources} class="top-end" />
          <div class="backdrop-scrim fill" />
        </div>
      )}
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
  const { user, kinds, current } = props
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
  const entries: DrawerEntry[] = [
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
    ...(kinds && kinds.movie > 0
      ? [kind("movie", tr("browseKindMovie"), Film)]
      : []),
    ...(kinds && kinds.show > 0
      ? [kind("show", tr("browseKindShow"), Tv)]
      : []),
  ]
  const profile: DrawerEntry = {
    key: "profile",
    label: nameOf(user),
    icon: null,
    route: { page: "profile" },
  }
  const settings: DrawerEntry = {
    key: "settings",
    label: tr("shellSettings"),
    icon: Settings,
    route: { page: "settings" },
  }
  const pick = (entry: DrawerEntry) => {
    // The page on screen already: back to it rather than open it again.
    if (entry.key === props.shown) props.onLeave()
    else props.nav.drawer(entry.route)
  }
  const draw = (entry: DrawerEntry) => (
    <Tap
      key={entry.key}
      fid={entry.key}
      class={cx("ctl drawer-entry", entry.key === current && "current")}
      label={entry.label}
      onPress={() => pick(entry)}
    >
      <span class="drawer-icon center">
        {entry.icon ? (
          <Icon icon={entry.icon} size={24} />
        ) : (
          <Avatar name={entry.label} url={user.avatarUrl} size={32} />
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
        {draw(profile)}
        <span class="drawer-gap" />
        {entries.map(draw)}
        <span class="drawer-space" />
        {draw(settings)}
      </div>
    </div>
  )
}

function Toast(props: { toasts: Toasts }) {
  const { message } = useObserved(props.toasts)
  if (!message) return null
  return (
    <div class="toast t-body" role="status">
      {message}
    </div>
  )
}

/**
 * The signed-in app on a TV: its pages, under a drawer at the left edge,
 * over the backdrop the page picks, with the clock at the top right. The
 * player takes the whole screen, with none of that around it.
 */
export function SignedInApp(props: {
  user: User
  pages: (entry: Entry) => ComponentChildren
}) {
  const { user } = props
  // A new sign-in starts the pages, and what they keep, afresh.
  const scope = useMemo<Omit<AppScope, "user">>(
    () => ({
      nav: new Navigator(),
      viewer: new Viewer(),
      toasts: new Toasts(),
      actions: new Actions(),
    }),
    [],
  )
  const chrome = useMemo(() => new Chrome(), [])
  const app = useMemo<AppScope>(() => ({ ...scope, user }), [scope, user])
  const nav = useObserved(scope.nav)
  const { panels, scrolled } = useObserved(chrome)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [kinds, setKinds] = useState<{ movie: number; show: number } | null>(
    null,
  )
  const root = useRef<HTMLDivElement>(null)

  useEffect(() => forgetPictures, [])
  // How many movies and shows there are, so the drawer offers only the kinds the server has.
  const version = useObserved(scope.viewer).version
  useEffect(() => {
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
  }, [version])

  const top = nav.top
  const playing = top.route.page === "player"
  const onHome = top.route.page === "home"
  const current =
    nav.stack
      .map((entry) => entryKey(entry.route))
      .findLast((key) => key !== null) ?? "home"
  const shown = top.route.page === "recent" ? null : entryKey(top.route)

  const toPage = () => refocus()
  const toDrawer = () => {
    const entry = root.current?.querySelector<HTMLElement>(
      `[data-drawer] [data-f="${current}"]`,
    )
    focusOn(entry ?? root.current?.querySelector<HTMLElement>("[data-drawer]"))
  }

  // Under every page's own Back: out of the drawer, back a page, and from
  // Home into the drawer, then out of the app.
  useBack(() => {
    if (drawerOpen && !onHome) toPage()
    else if (drawerOpen) exitApp()
    else if (nav.canGoBack) nav.back()
    else toDrawer()
  })

  useEffect(() => {
    const node = root.current
    if (!node || playing) return
    const listener = (event: Event) => {
      if (!(event instanceof CustomEvent) || event.detail !== "left") return
      // Only a page's own left edge opens the drawer, not a panel's.
      const from = focused()
      if (from?.closest("[data-ft]")?.hasAttribute("data-page")) toDrawer()
    }
    node.addEventListener("focusedge", listener)
    return () => node.removeEventListener("focusedge", listener)
  }, [playing, current])

  return (
    <AppContext.Provider value={app}>
      <ChromeContext.Provider value={chrome}>
        <div ref={root} class="fill">
          {!playing && <Backdrop chrome={chrome} page={top.id} />}
          <PageContext.Provider value={top} key={top.id}>
            {props.pages(top)}
          </PageContext.Provider>
          {!playing && (
            <>
              <Clock away={panels > 0 || scrolled > 0} />
              <Drawer
                user={user}
                kinds={kinds}
                current={current}
                shown={shown}
                nav={scope.nav}
                open={drawerOpen}
                onOpen={setDrawerOpen}
                onLeave={toPage}
              />
            </>
          )}
          <ActionsPanel />
          <Toast toasts={scope.toasts} />
        </div>
      </ChromeContext.Provider>
    </AppContext.Provider>
  )
}
