import type { ReactNode } from "react"

import { LogoMark } from "./brand"

/**
 * Centered column for the sign-in and setup screens. The extra padding below
 * lifts it a little above the true middle, where centered content looks
 * right; a fixed top offset left short forms sitting high.
 */
export function AuthScreen({
  title,
  description,
  children,
}: {
  title: string
  description?: ReactNode
  children: ReactNode
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 pt-12 pb-[calc(3rem+8vh)]">
      <div className="w-full max-w-[360px]">
        <LogoMark className="size-10" />
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">{title}</h1>
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
