import { Button } from "@matinee/ui/components/button"
import { RotateCwIcon } from "lucide-react"

import { tr } from "@/i18n"

/** In a row's place, when its cards didn't load. */
export function RailFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <li className="text-muted-foreground flex w-full flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed p-6 text-sm">
      {tr("discover.railFailed")}
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RotateCwIcon />
        {tr("discover.retry")}
      </Button>
    </li>
  )
}
