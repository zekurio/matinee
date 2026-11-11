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
  children,
}: {
  title: string
  /** A line above the title, such as the step of a longer flow. */
  eyebrow?: string
  description?: ReactNode
  /** Room for settings, as setup's steps after the admin account show. */
  wide?: boolean
  children: ReactNode
}) {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center px-4 pt-24 pb-[calc(3rem+8vh)]">
      <header className="absolute top-8 left-6 sm:left-10">
        <Logo className="text-2xl" />
      </header>
      <div className={cn("w-full", wide ? "max-w-2xl" : "max-w-[360px]")}>
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
