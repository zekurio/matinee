import type { CatalogRef } from "@matinee/contracts"
import type { QueryClient } from "@tanstack/solid-query"
import { createSignal } from "solid-js"

import { refKey } from "@/components/catalog/catalog-data"
import { tr } from "@/i18n"
import { toast } from "@/kit/toast"
import { client, errorMessage, orpc } from "@/lib/rpc"

type DismissedState = {
  /**
   * Titles marked "Not interested" since the page loaded, by `refKey`.
   * Rows leave them out at once; the server's next answer does too.
   */
  hidden: ReadonlySet<string>
  /** Hides the title, tells the server, and offers to undo it. */
  dismiss: (queryClient: QueryClient, ref: CatalogRef, name: string) => void
}

/** What the recommendation rows read again after a title leaves them. */
function refresh(queryClient: QueryClient) {
  void queryClient.invalidateQueries({
    queryKey: orpc.recommendations.home.key(),
  })
  void queryClient.invalidateQueries({ queryKey: orpc.discover.key() })
}

const [hidden, setHidden] = createSignal<ReadonlySet<string>>(new Set())

function show(key: string) {
  setHidden((previous) => {
    const next = new Set(previous)
    next.delete(key)
    return next
  })
}

const send = (ref: CatalogRef, dismissed: boolean) =>
  client.recommendations.dismiss({ ref, dismissed })

const dismiss: DismissedState["dismiss"] = (queryClient, ref, name) => {
  const key = refKey(ref)
  setHidden((previous) => new Set(previous).add(key))
  send(ref, true).then(
    () => {
      refresh(queryClient)
      toast.success(tr("discover.dismissed", { name }), {
        action: {
          label: tr("discover.undo"),
          onClick: () => {
            show(key)
            void send(ref, false)
              .catch((cause: unknown) => toast.error(errorMessage(cause)))
              .finally(() => refresh(queryClient))
          },
        },
      })
    },
    (cause: unknown) => {
      show(key)
      toast.error(tr("discover.dismissFailed", { name }), {
        description: errorMessage(cause),
      })
    },
  )
}

/** A shared store. Calling it with a selector returns an accessor. */
export function useDismissedStore<Value>(
  select: (state: DismissedState) => Value,
) {
  return () => select({ hidden: hidden(), dismiss })
}
