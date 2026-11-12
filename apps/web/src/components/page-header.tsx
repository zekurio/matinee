import { cn } from "@matinee/ui/lib/utils"
import { type ReactNode, useEffect } from "react"

import { tr } from "@/i18n"

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

export function PageHeader({
  title,
  breadcrumb,
  description,
  actions,
  phoneTitle,
  phoneActions,
  className,
}: {
  title: string
  /** A link back to the parent page, shown above the title. */
  breadcrumb?: ReactNode
  description?: ReactNode
  /**
   * Controls beside the title from `sm` up. Phones don't show them; pages
   * give phones theirs in `phoneActions`.
   */
  actions?: ReactNode
  /**
   * Stands in for the title on phones, like the library chips, which name
   * the page by the one that's filled. The heading stays for screen readers.
   */
  phoneTitle?: ReactNode
  /** Controls at the end of the title's row on phones only. */
  phoneActions?: ReactNode
  className?: string
}) {
  return (
    <header
      className={cn(
        "mb-4 flex items-end justify-between gap-4 md:mb-6",
        className,
      )}
    >
      <div className="min-w-0 flex-1">
        {breadcrumb && (
          <nav aria-label={tr("browse.breadcrumb")} className="mb-1 text-sm">
            {breadcrumb}
          </nav>
        )}
        {/* An open phone filter (`data-filter-open`) takes the whole row. */}
        <div className="group/title-row flex items-center gap-2">
          {phoneTitle && (
            <div className="min-w-0 flex-1 group-has-data-filter-open/title-row:hidden sm:hidden">
              {phoneTitle}
            </div>
          )}
          <h1
            title={title}
            className={cn(
              "line-clamp-2 min-w-0 text-[26px] leading-8 font-semibold tracking-tight text-balance break-words md:text-[32px] md:leading-10",
              phoneTitle
                ? "max-sm:sr-only"
                : "max-sm:group-has-data-filter-open/title-row:sr-only",
            )}
          >
            {title}
          </h1>
          {phoneActions && (
            <div className="-mr-2 ml-auto flex shrink-0 items-center gap-1 group-has-data-filter-open/title-row:ml-0 group-has-data-filter-open/title-row:min-w-0 group-has-data-filter-open/title-row:flex-1 sm:hidden">
              {phoneActions}
            </div>
          )}
        </div>
        {description && (
          <p className="text-muted-foreground mt-1 text-sm">{description}</p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 max-sm:hidden">{actions}</div>
      )}
    </header>
  )
}
