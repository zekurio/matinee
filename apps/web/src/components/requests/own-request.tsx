import { X } from "lucide"
import { Show } from "solid-js"

import type { AskedItem } from "@/components/asked/asked"
import { tr } from "@/i18n"
import { Button } from "@/kit/button"
import { Icon } from "@/kit/icon"
import { useRequestActionsStore } from "@/stores/request-actions"

import { RequestCard, RequestStateBadge, requestProgress } from "./request-card"
import { ownDetail } from "./request-lines"

/**
 * One of the viewer's requests, as the server says it stands: its
 * state, why it was declined if it was, and a small Cancel while the
 * server allows it. Cancel holds the call for
 * Undo as the queue's answers do.
 */
export function OwnRequest(props: { item: AskedItem; size?: "rail" | "wide" }) {
  const cancellable = () =>
    props.item.availability.action === "cancel" ||
    (props.item.season ?? props.item.availability).action === "cancel"
  return (
    <RequestCard
      item={props.item}
      size={props.size ?? "rail"}
      state={
        <RequestStateBadge
          state={props.item.state}
          progress={requestProgress(props.item)}
          detail={ownDetail(props.item)}
        />
      }
      actions={
        <Show when={cancellable()}>
          <Button
            variant="ghost"
            size="sm"
            aria-label={tr("requests.cancelNamed", {
              name: props.item.title.name,
            })}
            onClick={() =>
              useRequestActionsStore.getState().hold({
                kind: "cancel",
                ids: [props.item.id],
                names: [props.item.title.name],
              })
            }
            class="hover:bg-foreground/10 text-foreground/85 hover:text-foreground -ml-1 px-2 [@media(pointer:coarse)]:h-10"
          >
            {/* Where the card is too narrow for both, the time keeps
                its words and Cancel drops its mark. */}
            <Icon
              icon={X}
              stroke-width={2.5}
              class="@max-[14rem]/card:hidden"
            />
            {tr("requests.cancel")}
          </Button>
        </Show>
      }
    />
  )
}
