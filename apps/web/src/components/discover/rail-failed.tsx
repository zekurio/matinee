import { RefreshCw } from "lucide"

import { tr } from "@/i18n"
import { Button } from "@/kit/button"
import { Icon } from "@/kit/icon"

/** In a row's place, when its cards didn't load. */
export function RailFailed(props: { onRetry: () => void }) {
  return (
    <li class="text-muted-foreground flex w-full flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed p-6 text-sm">
      {tr("discover.railFailed")}
      <Button variant="outline" size="sm" onClick={() => props.onRetry()}>
        <Icon icon={RefreshCw} />
        {tr("discover.retry")}
      </Button>
    </li>
  )
}
