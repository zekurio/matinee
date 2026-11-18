import type { SavedServer } from "@matinee/desktop-bridge"
import { Avatar, AvatarFallback } from "@matinee/ui/components/avatar"
import { Button } from "@matinee/ui/components/button"
import { Spinner } from "@matinee/ui/components/spinner"
import { cn } from "@matinee/ui/lib/utils"
import { PowerIcon } from "lucide-react"
import type { ReactNode } from "react"

import { tr } from "@/i18n"
import { hostOf } from "@/lib/format"
import { useApp } from "@/stores/app"

import { Logo } from "./brand"

/**
 * The window: the logo in the top corner, the screen in the middle, and
 * the version and a way to quit at the bottom, since full screen on a TV
 * there are no window buttons. `screen` keys the fade between screens.
 */
export function Frame({
  screen,
  quit = true,
  children,
}: {
  screen: string
  /** Off where there is no shell to quit. */
  quit?: boolean
  children: ReactNode
}) {
  const info = useApp((state) => state.info)
  const onQuit = useApp((state) => state.quit)
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="px-6 pt-8 sm:px-10">
        <Logo className="text-2xl" />
      </header>
      <main
        key={screen}
        className="animate-in fade-in-0 animation-duration-300 flex flex-1 flex-col items-center justify-center px-4 pt-12 pb-[calc(2rem+6vh)] motion-reduce:animate-none"
      >
        {children}
      </main>
      <footer className="flex min-h-14 items-center justify-between gap-4 px-6 pb-4 sm:px-10">
        <p className="text-foreground-faint text-xs">
          {info ? tr("app.version", { version: info.version }) : null}
        </p>
        {quit && (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={onQuit}
          >
            <PowerIcon />
            {tr("app.quit")}
          </Button>
        )}
      </footer>
    </div>
  )
}

/**
 * A screen's column: its title, what it's about, and what to do. Wide for
 * a code to sign in with, which has its QR code beside it.
 */
export function Page({
  title,
  description,
  wide = false,
  children,
}: {
  title: string
  description?: ReactNode
  wide?: boolean
  children?: ReactNode
}) {
  return (
    <div className={cn("w-full", wide ? "max-w-2xl" : "max-w-md")}>
      <h1 className="text-2xl font-semibold tracking-tight text-balance">
        {title}
      </h1>
      {description && (
        <p className="text-muted-foreground mt-2 text-sm leading-5 text-pretty">
          {description}
        </p>
      )}
      {children && <div className="mt-8">{children}</div>}
    </div>
  )
}

/** The first letter of a name, in the place of a picture this page can't load. */
export function Initial({
  name,
  className,
}: {
  name: string
  className?: string
}) {
  return (
    <Avatar
      aria-hidden
      className={cn("after:border-foreground/10 size-9 text-sm", className)}
    >
      <AvatarFallback className="bg-secondary text-secondary-foreground [font-size:inherit] font-semibold">
        <span className="block leading-none [text-box:trim-both_cap_alphabetic]">
          {name.slice(0, 1).toUpperCase()}
        </span>
      </AvatarFallback>
    </Avatar>
  )
}

/** Who is signed in where, for a screen about that server. */
export function ServerCard({ server }: { server: SavedServer }) {
  const name = server.displayName ?? server.username
  return (
    <div className="flex items-center gap-3 rounded-xl border px-4 py-3">
      <Initial name={name} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm leading-5 font-medium">
          {hostOf(server.url)}
        </p>
        <p className="text-muted-foreground text-13px truncate">
          {tr("servers.signedInAs", { name })}
        </p>
      </div>
    </div>
  )
}

/** Something that runs on its own, like waiting for an approval. */
export function Waiting({ children }: { children: ReactNode }) {
  return (
    <p
      role="status"
      className="text-muted-foreground flex items-center gap-2 text-sm"
    >
      <Spinner aria-hidden />
      {children}
    </p>
  )
}
