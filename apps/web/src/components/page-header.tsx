import type { ReactNode } from "react"

export function PageHeader({
  title,
  breadcrumb,
  description,
  actions,
}: {
  title: string
  /** A link back to the parent page, shown above the title. */
  breadcrumb?: ReactNode
  description?: ReactNode
  /**
   * Controls beside the title from `sm` up. Phones don't show them; pages
   * put their phone controls in the tab bar instead.
   */
  actions?: ReactNode
}) {
  return (
    <header className="mb-4 flex items-end justify-between gap-4 md:mb-6">
      <div className="min-w-0">
        {breadcrumb && (
          <nav aria-label="Breadcrumb" className="mb-1 text-sm">
            {breadcrumb}
          </nav>
        )}
        <h1
          title={title}
          className="line-clamp-2 text-[26px] leading-8 font-semibold tracking-tight text-balance break-words md:text-[32px] md:leading-10"
        >
          {title}
        </h1>
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
