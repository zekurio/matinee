import type { MediaItem } from "@matinee/contracts"
import { DropdownMenuItem } from "@matinee/ui/components/dropdown-menu"
import { toast } from "@matinee/ui/components/sonner"
import { useMutation } from "@tanstack/react-query"
import { ListPlusIcon } from "lucide-react"

import { tr } from "@/i18n"
import type { PartyRole } from "@/lib/party"
import { client, errorMessage } from "@/lib/rpc"

/**
 * A file's menu item while the viewer is in a watch party: the owner
 * queues the file, anyone else proposes it. The server tells the two
 * apart; the wording here only says which it will be.
 */
export function PartyMenuItem({
  item,
  name,
  role,
}: {
  item: MediaItem
  /** Names the file in the toast. */
  name: string
  role: PartyRole
}) {
  const add = useMutation({
    mutationFn: () => client.party.queue.add({ itemId: item.id }),
    onSuccess: () =>
      toast.success(
        role === "owner"
          ? tr("party.queued", { name })
          : tr("party.proposed", { name }),
      ),
    onError: (cause) =>
      toast.error(tr("party.failed"), { description: errorMessage(cause) }),
  })
  return (
    <DropdownMenuItem disabled={add.isPending} onClick={() => add.mutate()}>
      <ListPlusIcon />
      {role === "owner" ? tr("party.menu.queue") : tr("party.menu.propose")}
    </DropdownMenuItem>
  )
}
