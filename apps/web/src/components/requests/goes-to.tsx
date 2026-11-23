import type { AdminRequestItem } from "@matinee/contracts"
import type { ReactElement } from "react"

import { LibraryChooser } from "@/components/catalog/library-chooser"
import { tr } from "@/i18n"
import { useRequestActionsStore } from "@/stores/request-actions"

/**
 * Where a request goes now, and the connection that fills it: for a
 * waiting one, the library chosen under "Goes to" or its own; for the
 * rest, the library it's in.
 */
export function useGoesTo(item: AdminRequestItem) {
  const current = useGoesToLibrary(item)
  if (current)
    return {
      id: current.id,
      library: current.name,
      connection: current.connection,
    }
  return {
    id: item.library.id,
    library: item.library.name,
    connection: item.connection?.name ?? null,
  }
}

/** The library chosen under "Goes to", else the one it's in. */
function useGoesToLibrary(item: AdminRequestItem) {
  const chosen = useRequestActionsStore((state) => state.moves.get(item.id))
  return (
    item.destinations.find((library) => library.id === chosen) ??
    item.destinations.find((library) => library.selected)
  )
}

/**
 * Whether a waiting request could go to another library than its own,
 * so "Goes to" offers a choice.
 */
export function choosesLibrary(item: AdminRequestItem): boolean {
  return item.destinations.length > 1
}

/**
 * The menu of libraries a waiting request could go to, from `trigger`,
 * with the one chosen checked. The choice is kept by request and only
 * sent with Add, from here or the queue.
 */
export function GoesToChooser({
  item,
  trigger,
}: {
  item: AdminRequestItem
  trigger: ReactElement
}) {
  const move = useRequestActionsStore((state) => state.move)
  const current = useGoesToLibrary(item)
  return (
    <LibraryChooser
      libraries={item.destinations}
      value={current?.id ?? item.library.id}
      onChange={(id) =>
        move(
          item.id,
          item.destinations.find((entry) => entry.id === id)?.selected
            ? null
            : id,
        )
      }
      title={tr("requests.goesTo.title")}
      trigger={trigger}
    />
  )
}
