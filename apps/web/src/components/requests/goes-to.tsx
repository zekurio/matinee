import type { AdminRequestItem } from "@matinee/contracts"

import type { TriggerRender } from "@/components/catalog/ask-sheet"
import { LibraryChooser } from "@/components/catalog/library-chooser"
import { tr } from "@/i18n"
import { useRequestActionsStore } from "@/stores/request-actions"

/**
 * Where a request goes now, and the connection that fills it: for a
 * waiting one, the library chosen under "Goes to" or its own; for the
 * rest, the library it's in. An accessor, read where it's shown.
 */
export function useGoesTo(item: () => AdminRequestItem) {
  const current = useGoesToLibrary(item)
  return () => {
    const chosen = current()
    if (chosen)
      return {
        id: chosen.id,
        library: chosen.name,
        connection: chosen.connection,
      }
    const request = item()
    return {
      id: request.library.id,
      library: request.library.name,
      connection: request.connection?.name ?? null,
    }
  }
}

/** The library chosen under "Goes to", else the one it's in. */
function useGoesToLibrary(item: () => AdminRequestItem) {
  const moves = useRequestActionsStore((state) => state.moves)
  return () => {
    const request = item()
    const chosen = moves().get(request.id)
    return (
      request.destinations.find((library) => library.id === chosen) ??
      request.destinations.find((library) => library.selected)
    )
  }
}

/**
 * Whether a waiting request could go to another library than its own,
 * so "Goes to" offers a choice.
 */
export function choosesLibrary(item: AdminRequestItem): boolean {
  return item.destinations.length > 1
}

/**
 * The menu of libraries a waiting request could go to, from `renderTrigger`,
 * with the one chosen checked. The choice is kept by request and only
 * sent with Add, from here or the queue.
 */
export function GoesToChooser(props: {
  item: AdminRequestItem
  renderTrigger: TriggerRender
}) {
  const current = useGoesToLibrary(() => props.item)
  return (
    <LibraryChooser
      libraries={props.item.destinations}
      value={current()?.id ?? props.item.library.id}
      onChange={(id) =>
        useRequestActionsStore
          .getState()
          .move(
            props.item.id,
            props.item.destinations.find((entry) => entry.id === id)?.selected
              ? null
              : id,
          )
      }
      title={tr("requests.goesTo.title")}
      renderTrigger={props.renderTrigger}
    />
  )
}
