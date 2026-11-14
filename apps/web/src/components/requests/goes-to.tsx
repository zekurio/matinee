import type { AdminRequestItem } from "@matinee/contracts"
import { cn } from "@matinee/ui/lib/utils"
import { ChevronDownIcon } from "lucide-react"

import { LibraryChooser } from "@/components/catalog/library-chooser"
import { tr } from "@/i18n"
import { useRequestActionsStore } from "@/stores/request-actions"

/**
 * Where a request goes now, and the connection that fills it: for a
 * waiting one, the library chosen under "Goes to" or its own; for the
 * rest, the library it's in.
 */
export function useGoesTo(item: AdminRequestItem) {
  const chosen = useRequestActionsStore((state) => state.moves.get(item.id))
  const current =
    item.destinations.find((library) => library.id === chosen) ??
    item.destinations.find((library) => library.selected)
  if (current) return { library: current.name, connection: current.connection }
  return {
    library: item.library.name,
    connection: item.connection?.name ?? null,
  }
}

/**
 * The library a request goes to. While it waits and could go to another,
 * it's a menu of them; the choice is only sent with Add.
 */
export function GoesToLibrary({
  item,
  className,
}: {
  item: AdminRequestItem
  className?: string
}) {
  const move = useRequestActionsStore((state) => state.move)
  const chosen = useRequestActionsStore((state) => state.moves.get(item.id))
  const current =
    item.destinations.find((library) => library.id === chosen) ??
    item.destinations.find((library) => library.selected)

  if (!current || item.destinations.length < 2) {
    return (
      <span className={cn("truncate", className)}>
        {current?.name ?? item.library.name}
      </span>
    )
  }

  return (
    <LibraryChooser
      libraries={item.destinations}
      value={current.id}
      onChange={(id) =>
        move(
          item.id,
          item.destinations.find((entry) => entry.id === id)?.selected
            ? null
            : id,
        )
      }
      title={tr("requests.goesTo.title")}
      trigger={
        <button
          type="button"
          aria-label={tr("requests.goesTo.change", {
            name: item.title.name,
            library: current.name,
          })}
          className={cn(
            "hover:text-foreground focus-visible:ring-ring data-popup-open:text-foreground relative -mx-1 inline-flex min-w-0 items-center gap-0.5 rounded-md px-1 outline-none focus-visible:ring-2",
            "hover:bg-foreground/[0.06] data-popup-open:bg-foreground/[0.06]",
            // A finger's worth to press on phones, without making the
            // line taller.
            "[@media(pointer:coarse)]:after:absolute [@media(pointer:coarse)]:after:-inset-x-1 [@media(pointer:coarse)]:after:-inset-y-2.5 [@media(pointer:coarse)]:after:content-['']",
            !current.selected && "text-foreground font-medium",
            className,
          )}
        >
          <span className="truncate">{current.name}</span>
          <ChevronDownIcon
            aria-hidden
            className="text-muted-foreground size-3.5 shrink-0"
          />
        </button>
      }
    />
  )
}
