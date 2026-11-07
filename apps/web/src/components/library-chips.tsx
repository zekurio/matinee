import { cn } from "@matinee/ui/lib/utils"
import { useQuery } from "@tanstack/react-query"
import { Link, useRouterState } from "@tanstack/react-router"
import { useLayoutEffect, useRef } from "react"

import { orpc } from "@/lib/rpc"

import { chipClass } from "./chips"

/**
 * The libraries as a row of chips, the way phones move between them, as in
 * Netflix's app. The tab bar keeps the same tabs however many libraries
 * there are. The chip of the library you're in is filled, so on a library's
 * page the row names it. Sits over art on Home, so the chips are frosted.
 */
export function LibraryChips({ className }: { className?: string }) {
  const libraries = useQuery(orpc.libraries.list.queryOptions())
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const row = useRef<HTMLElement>(null)
  const list = libraries.data ?? []
  const current = list.find((library) =>
    pathname.startsWith(`/libraries/${library.id}`),
  )

  // A library far down the list would start out of view. Before paint, so
  // the row doesn't jump.
  useLayoutEffect(() => {
    const el = row.current
    const chip = el?.querySelector<HTMLElement>("[aria-current]")
    if (!el || !chip) return
    el.scrollLeft = chip.offsetLeft - (el.clientWidth - chip.offsetWidth) / 2
  }, [current?.id, list.length])

  if (list.length === 0) return null
  return (
    <nav
      ref={row}
      aria-label="Libraries"
      className={cn(
        "relative flex [scrollbar-width:none] items-center gap-1.5 overflow-x-auto [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {list.map((library) => {
        const active = library.id === current?.id
        return (
          <Link
            key={library.id}
            to="/libraries/$libraryId"
            params={{ libraryId: library.id }}
            aria-current={active ? "page" : undefined}
            className={chipClass(
              active,
              cn(
                // Lower than a tap target elsewhere, so the row costs the
                // banner less.
                "backdrop-blur-md [@media(pointer:coarse)]:h-9",
                !active && "bg-background/40",
              ),
            )}
          >
            {library.name}
          </Link>
        )
      })}
    </nav>
  )
}
