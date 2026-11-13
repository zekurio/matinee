import { cn } from "@matinee/ui/lib/utils"
import type { ReactNode } from "react"

import { Logo } from "./brand"

/**
 * Centered column for the sign-in and setup screens. The extra padding below
 * lifts it a little above the true middle, where centered content looks
 * right; a fixed top offset left short forms sitting high.
 */
export function AuthScreen({
  title,
  eyebrow,
  description,
  wide = false,
  backdrop,
  contained = false,
  children,
}: {
  title: string
  /** A line above the title, such as the step of a longer flow. */
  eyebrow?: string
  description?: ReactNode
  /** Room for settings, as setup's steps after the admin account show. */
  wide?: boolean
  /** Behind everything, such as the login backdrop. */
  backdrop?: ReactNode
  /** Fill the parent rather than the window, as a preview does. */
  contained?: boolean
  children: ReactNode
}) {
  return (
    <main
      className={cn(
        "relative isolate flex flex-col items-center justify-center overflow-hidden px-4",
        contained ? "h-full py-16" : "min-h-dvh pt-24 pb-[calc(3rem+8vh)]",
      )}
    >
      {backdrop}
      <header className="absolute top-8 left-6 sm:left-10">
        <Logo className="text-2xl" />
      </header>
      <div
        className={cn("relative w-full", wide ? "max-w-2xl" : "max-w-[360px]")}
      >
        {eyebrow && (
          <p className="text-muted-foreground mb-2 text-sm">{eyebrow}</p>
        )}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="text-muted-foreground mt-2 text-sm leading-5">
            {description}
          </p>
        )}
        <div className="mt-8">{children}</div>
      </div>
    </main>
  )
}
