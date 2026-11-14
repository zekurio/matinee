import { cn } from "@matinee/ui/lib/utils"
import { type ReactNode, useEffect } from "react"

import { BackButton, usePhoneTab } from "./phone-nav"

/**
 * Names the browser tab after the page while it's open. Until there's a
 * name, and after the page closes, the tab says just matinee.
 */
export function useDocumentTitle(name: string | null | undefined) {
  // The tab's title lives in the document, outside React.
  useEffect(() => {
    if (name) document.title = `${name} · matinee`
    return () => {
      document.title = "matinee"
    }
  }, [name])
}

/**
 * A page's name and controls. On phones it's the bar at the top of the
 * page, as the Android app has it: Back, unless the page is a tab's first,
 * then the name and `phoneActions`. It stays put while the page scrolls.
 */
export function PageHeader({
  title,
  description,
  actions,
  phoneActions,
  className,
}: {
  title: string
  description?: ReactNode
  /**
   * Controls beside the title from `sm` up. Phones don't show them; pages
   * give phones theirs in `phoneActions`.
   */
  actions?: ReactNode
  /** Controls at the end of the bar on phones only. */
  phoneActions?: ReactNode
  className?: string
}) {
  const back = usePhoneTab() === null
  return (
    <header
      className={cn(
        "mb-4 flex items-end justify-between gap-4 md:mb-6",
        // The page's column pads its sides; the bar spans the screen.
        "max-sm:bg-background max-sm:sticky max-sm:top-0 max-sm:z-20 max-sm:-mx-4 max-sm:mb-2 max-sm:block max-sm:pt-[env(safe-area-inset-top)]",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        {/* An open phone filter (`data-filter-open`) takes the bar. */}
        <div
          className={cn(
            "group/title-row flex items-center gap-2",
            "max-sm:h-16 max-sm:gap-1 max-sm:pr-1",
            back ? "max-sm:pl-1" : "max-sm:pl-4",
            "max-sm:has-data-filter-open:pl-4",
          )}
        >
          {back && (
            <BackButton className="group-has-data-filter-open/title-row:hidden sm:hidden" />
          )}
          <h1
            title={title}
            className={cn(
              "line-clamp-2 min-w-0 text-[26px] leading-8 font-semibold tracking-tight text-balance break-words md:text-[32px] md:leading-10",
              "max-sm:line-clamp-1 max-sm:flex-1 max-sm:pl-1 max-sm:text-xl max-sm:leading-7 max-sm:group-has-data-filter-open/title-row:sr-only",
              !back && "max-sm:pl-0",
            )}
          >
            {title}
          </h1>
          {phoneActions && (
            <div className="ml-auto flex shrink-0 items-center gap-1 group-has-data-filter-open/title-row:ml-0 group-has-data-filter-open/title-row:min-w-0 group-has-data-filter-open/title-row:flex-1 sm:hidden">
              {phoneActions}
            </div>
          )}
        </div>
        {description && (
          <p className="text-muted-foreground mt-1 text-sm max-sm:-mt-2 max-sm:truncate max-sm:px-4 max-sm:pb-2 max-sm:text-[13px]">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 max-sm:hidden">{actions}</div>
      )}
    </header>
  )
}
