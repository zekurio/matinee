import type { CatalogRef } from "@matinee/contracts"
import { toast } from "@matinee/ui/components/sonner"
import { useMutation, useQueryClient } from "@tanstack/react-query"

import { tr } from "@/i18n"
import { client, errorMessage, orpc } from "@/lib/rpc"

import { applyAvailability } from "./catalog-data"

// How long a toast offers Undo. The server holds an ask that needs no
// approval for ten seconds before it sends it, so Undo still works then.
const UNDO_MS = 6000

/** Reload what the stream may not have caught up with yet. */
function refresh(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: orpc.catalog.key() })
  // The lists of what the viewer asked for, on Home and the profile.
  void queryClient.invalidateQueries({ queryKey: orpc.requests.mine.key() })
}

/**
 * Takes an ask back, from Undo or the state's sheet. Works while someone
 * still has to say yes, and for an ask that needs no approval until the
 * server sends it on.
 */
export function useCancel() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id }: { id: string; name: string }) =>
      client.requests.cancel({ id }),
    onSuccess: () => refresh(queryClient),
    onError: (cause, { name }) =>
      toast.error(tr("ask.toast.cancelFailed", { name }), {
        description: errorMessage(cause),
      }),
  })
}

/**
 * Asks for a title: the whole film, or a show's seasons in `scope`, the
 * server's default when it's left out. The card or button changes in
 * place, and a toast offers Undo while the ask can still be taken back.
 */
export function useAsk() {
  const queryClient = useQueryClient()
  const cancel = useCancel()
  return useMutation({
    mutationFn: (input: {
      ref: CatalogRef
      name: string
      libraryId?: string
      scope?: { seasons: number[]; future: boolean }
      /**
       * Whether Undo may take the whole ask back. Not for more seasons of a
       * show the viewer already asked for, where it would take back the
       * seasons asked for before too.
       */
      undo?: boolean
    }) =>
      client.requests.ask({
        ref: input.ref,
        libraryId: input.libraryId,
        scope: input.scope,
      }),
    onSuccess: (item, { name, undo = true }) => {
      applyAvailability(queryClient, item.title.ref, item.availability)
      refresh(queryClient)
      toast.success(tr("ask.toast.asked", { name }), {
        duration: UNDO_MS,
        action:
          undo &&
          (item.availability.action === "cancel" ||
            item.season?.action === "cancel")
            ? {
                label: tr("ask.toast.undo"),
                onClick: () => cancel.mutate({ id: item.id, name }),
              }
            : undefined,
      })
    },
    onError: (cause, { name }) =>
      toast.error(tr("ask.toast.failed", { name }), {
        description: errorMessage(cause),
      }),
  })
}

/** "Notify me" on a title someone else asked for, and taking it back. */
export function useFollow() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) =>
      on ? client.requests.follow({ id }) : client.requests.unfollow({ id }),
    // The button says the new state; a toast would only repeat it.
    onSuccess: () => refresh(queryClient),
    onError: (cause) =>
      toast.error(tr("ask.toast.followFailed"), {
        description: errorMessage(cause),
      }),
  })
}
