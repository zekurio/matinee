import type { CatalogRef } from "@matinee/contracts"
import { toast } from "@matinee/ui/components/sonner"
import type { QueryClient } from "@tanstack/react-query"
import { create } from "zustand"

import { refKey } from "@/components/catalog/catalog-data"
import { tr } from "@/i18n"
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

/** The titles hidden from the viewer's recommendations on this page. */
export const useDismissedStore = create<DismissedState>()((set, get) => {
  const show = (key: string) => {
    const hidden = new Set(get().hidden)
    hidden.delete(key)
    set({ hidden })
  }
  const send = (ref: CatalogRef, dismissed: boolean) =>
    client.recommendations.dismiss({ ref, dismissed })
  return {
    hidden: new Set(),
    dismiss: (queryClient, ref, name) => {
      const key = refKey(ref)
      set({ hidden: new Set(get().hidden).add(key) })
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
    },
  }
})
