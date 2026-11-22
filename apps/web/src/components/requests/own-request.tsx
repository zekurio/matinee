import { Button } from "@matinee/ui/components/button"
import { XIcon } from "lucide-react"

import type { AskedItem } from "@/components/asked/asked"
import { tr } from "@/i18n"
import { useRequestActionsStore } from "@/stores/request-actions"

import { RequestCard, RequestStateBadge, requestProgress } from "./request-card"
import { AskedWhen, OwnLine } from "./request-lines"

/**
 * One of the viewer's requests, as the server says it stands: its
 * state, the state's line, when they asked, and Cancel while the server
 * allows it. Cancel holds the call for Undo as the queue's answers do.
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
  const rail = size === "rail"
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
      line={<OwnLine item={item} />}
      who={<AskedWhen item={item} />}
      actions={
        cancellable && (
          <Button
            variant={rail ? "secondary" : "ghost"}
            size="sm"
            onClick={() =>
              hold({
                kind: "cancel",
                ids: [item.id],
                names: [item.title.name],
              })
            }
            className={
              rail
                ? // Long words, like German's, wrap rather than cut off.
                  "h-auto min-h-8 w-full py-1.5 leading-tight whitespace-normal"
                : "hover:bg-foreground/10"
            }
          >
            <XIcon aria-hidden strokeWidth={2.5} />
            <span className="text-balance">{tr("ask.cancel")}</span>
          </Button>
        )
      }
    />
  )
}
