import { Button } from "@matinee/ui/components/button"
import { XIcon } from "lucide-react"

import type { AskedItem } from "@/components/asked/asked"
import { tr } from "@/i18n"
import { useRequestActionsStore } from "@/stores/request-actions"

import { RequestCard, RequestStateBadge, requestProgress } from "./request-card"
import { AskedWhen, OwnLine } from "./request-lines"

/**
 * One of the viewer's requests, as the server says it stands: its
 * state, how it ended once it has, when they asked while it hasn't, and
 * a small Cancel while the server allows it. Cancel holds the call for
 * Undo as the queue's answers do.
 */
export function OwnRequest({
  item,
  size = "rail",
}: {
  item: AskedItem
  size?: "rail" | "wide"
}) {
  const hold = useRequestActionsStore((state) => state.hold)
  const availability = item.season ?? item.availability
  const cancellable =
    item.availability.action === "cancel" || availability.action === "cancel"
  const finished = item.state === "here" || item.state === "declined"
  return (
    <RequestCard
      item={item}
      size={size}
      state={
        <RequestStateBadge
          state={item.state}
          progress={requestProgress(item)}
        />
      }
      // A finished one says how it ended; one in progress, when it was asked.
      line={finished ? <OwnLine item={item} /> : null}
      who={finished ? null : <AskedWhen item={item} />}
      actions={
        cancellable && (
          <Button
            variant="ghost"
            size="sm"
            aria-label={tr("requests.cancelNamed", { name: item.title.name })}
            onClick={() =>
              hold({
                kind: "cancel",
                ids: [item.id],
                names: [item.title.name],
              })
            }
            className="hover:bg-foreground/10 text-foreground/85 hover:text-foreground -mr-1 px-2 [@media(pointer:coarse)]:h-10"
          >
            {/* Where the card is too narrow for both, the time keeps
                its words and Cancel drops its mark. */}
            <XIcon
              aria-hidden
              strokeWidth={2.5}
              className="@max-[14rem]/card:hidden"
            />
            {tr("requests.cancel")}
          </Button>
        )
      }
    />
  )
}
