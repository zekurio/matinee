import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@matinee/ui/components/dialog"
import { cn } from "@matinee/ui/lib/utils"
import type { FormEvent, ReactNode } from "react"

/*
 * The settings' form dialogs: wide, with their sections side by side in
 * columns, so a long form reads across instead of down. The header and
 * the footer stay put and only the body scrolls. On a phone the columns
 * stack into one.
 */

const WIDTHS = {
  /** One or two columns, as a token or an invite. */
  md: "sm:max-w-3xl",
  /** Two columns. */
  lg: "sm:max-w-5xl",
  /** Two columns of rows with a hint beside their control. */
  xl: "sm:max-w-7xl",
  /**
   * Three columns of rows. They sit as two until the screen is wide, since
   * a row's name, hint, and control don't fit side by side in a third.
   */
  "2xl": "sm:max-w-7xl 2xl:max-w-[96rem]",
} satisfies Record<string, string>

export function FormDialogContent({
  width = "lg",
  children,
}: {
  width?: keyof typeof WIDTHS
  children: ReactNode
}) {
  return (
    <DialogContent
      showCloseButton={false}
      className={cn(
        "flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0",
        WIDTHS[width],
      )}
    >
      {children}
    </DialogContent>
  )
}

/** The dialog's form, which holds its header, body, and footer. */
export function FormDialogForm({
  onSubmit,
  children,
}: {
  onSubmit: () => void
  children: ReactNode
}) {
  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(event: FormEvent) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      {children}
    </form>
  )
}

export function FormDialogHeader({
  title,
  description,
}: {
  title: ReactNode
  description?: ReactNode
}) {
  return (
    <DialogHeader className="border-b px-6 pt-6 pb-5">
      <DialogTitle className="text-lg leading-7 font-semibold">
        {title}
      </DialogTitle>
      {description && (
        <DialogDescription className="max-w-3xl">
          {description}
        </DialogDescription>
      )}
    </DialogHeader>
  )
}

/** What scrolls between the header and the footer. */
export function FormDialogBody({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 py-5">
      {children}
    </div>
  )
}

export function FormDialogFooter({
  cancel = true,
  children,
}: {
  /** A Cancel button before the actions. */
  cancel?: boolean
  children: ReactNode
}) {
  return (
    <DialogFooter showCancelButton={cancel} className="m-0 px-6 py-4">
      {children}
    </DialogFooter>
  )
}

/**
 * Columns of sections, each a {@link FormColumn}. `count` is how many sit
 * side by side on a wide screen; fewer fit on a narrower one.
 */
export function FormColumns({
  count = 2,
  children,
}: {
  count?: 2 | 3
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        "grid items-start gap-x-8 gap-y-6",
        count === 2 ? "md:grid-cols-2" : "md:grid-cols-2 2xl:grid-cols-3",
      )}
    >
      {children}
    </div>
  )
}

export function FormColumn({
  tall = false,
  className,
  children,
}: {
  /**
   * For the longest of three columns. While they sit as two, it runs down
   * both rows, and the third column goes beside it, under the other one,
   * rather than below the pair.
   */
  tall?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-6",
        tall && "md:row-span-2 2xl:row-span-1",
        className,
      )}
    >
      {children}
    </div>
  )
}

/** A titled part of a form dialog. */
export function FormSection({
  title,
  description,
  children,
}: {
  title?: string
  /** A line under the title on what the part covers. */
  description?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="flex min-w-0 flex-col gap-2.5">
      {(title || description) && (
        <div className="flex flex-col gap-0.5">
          {title && <h3 className="text-sm font-semibold">{title}</h3>}
          {description && (
            <p className="text-muted-foreground text-13px leading-5">
              {description}
            </p>
          )}
        </div>
      )}
      {children}
    </section>
  )
}
