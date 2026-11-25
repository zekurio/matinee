import type { MediaItem } from "@matinee/contracts"
import { useMutation } from "@tanstack/solid-query"
import { ListPlus } from "lucide"

import { tr } from "@/i18n"
import { DropdownMenuItem } from "@/kit/dropdown-menu"
import { Icon } from "@/kit/icon"
import { toast } from "@/kit/toast"
import type { PartyRole } from "@/lib/party"
import { client, errorMessage } from "@/lib/rpc"

/**
 * A file's menu item while the viewer is in a watch party: the owner
 * queues the file, anyone else proposes it. The server tells the two
 * apart; the wording here only says which it will be.
 */
export function PartyMenuItem(props: {
  item: MediaItem
  /** Names the file in the toast. */
  name: string
  role: PartyRole
}) {
  const add = useMutation(() => ({
    mutationFn: () => client.party.queue.add({ itemId: props.item.id }),
    onSuccess: () =>
      toast.success(
        props.role === "owner"
          ? tr("party.queued", { name: props.name })
          : tr("party.proposed", { name: props.name }),
      ),
    onError: (cause: Error) =>
      toast.error(tr("party.failed"), { description: errorMessage(cause) }),
  }))
  return (
    <DropdownMenuItem disabled={add.isPending} onSelect={() => add.mutate()}>
      <Icon icon={ListPlus} />
      {props.role === "owner"
        ? tr("party.menu.queue")
        : tr("party.menu.propose")}
    </DropdownMenuItem>
  )
}
