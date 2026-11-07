import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@matinee/ui/components/dialog"
import { cn } from "@matinee/ui/lib/utils"
import { useLayoutEffect, useRef, useState } from "react"

import { tr } from "@/i18n"

/** The lines a description shows on phones, where it sits under the poster. */
const PHONE_LINES = 3

type Fit = {
  /** The lines shown. */
  lines: number
  /** Whether the text runs past them, which offers More. */
  truncated: boolean
}

/**
 * Fits a paragraph to whole lines of its box. From `sm` up the box is
 * size-contained, so the header row sets its height, not the text: the
 * text gets the lines that fit, less one for More when it doesn't all fit.
 * Phones show {@link PHONE_LINES}.
 */
function useFitLines(text: string) {
  const boxRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLParagraphElement>(null)
  const [fit, setFit] = useState<Fit>({ lines: PHONE_LINES, truncated: false })

  // Before paint, so the text doesn't jump from three lines to the fit.
  useLayoutEffect(() => {
    const box = boxRef.current
    const paragraph = textRef.current
    if (!box || !paragraph) return
    const measure = () => {
      const lineHeight = Number.parseFloat(
        getComputedStyle(paragraph).lineHeight,
      )
      if (!lineHeight) return
      // A clamped paragraph still scrolls to its full height.
      const total = Math.round(paragraph.scrollHeight / lineHeight)
      const contained = getComputedStyle(box)
        .contain.split(" ")
        .includes("size")
      const room = contained
        ? Math.floor(box.clientHeight / lineHeight)
        : PHONE_LINES
      const truncated = total > room
      // More is one line tall, and only takes room from the text where the
      // box can't grow.
      const lines = Math.max(1, truncated && contained ? room - 1 : room)
      setFit((prev) =>
        prev.lines === lines && prev.truncated === truncated
          ? prev
          : { lines, truncated },
      )
    }
    measure()
    const resize = new ResizeObserver(measure)
    resize.observe(box)
    resize.observe(paragraph)
    // The web font changes the wrapping, but neither element's size.
    let live = true
    void document.fonts.ready.then(() => {
      if (live) measure()
    })
    return () => {
      live = false
      resize.disconnect()
    }
  }, [text])

  return { boxRef, textRef, ...fit }
}

/**
 * A header's tagline and description, as one paragraph. From `sm` up it
 * fills the room the poster leaves beside the other details and shows the
 * lines that fit, so a long description never pushes Play below the
 * poster. More opens the whole text in a dialog, so the header never
 * changes size.
 */
export function HeaderOverview({
  name,
  tagline,
  overview,
  className,
}: {
  /** What the text describes, as the dialog's title. */
  name: string
  tagline?: string | null
  overview: string | null
  className?: string
}) {
  const { boxRef, textRef, lines, truncated } = useFitLines(
    `${tagline ?? ""}\n${overview ?? ""}`,
  )
  if (!tagline && !overview) return null
  return (
    <div
      ref={boxRef}
      className={cn(
        "max-w-4xl",
        // At least a line and More, or the row grows to make room.
        "sm:min-h-12 sm:flex-1 sm:[contain:size]",
        className,
      )}
    >
      <p
        ref={textRef}
        style={{ WebkitLineClamp: lines }}
        className="text-foreground/85 line-clamp-3 text-sm leading-6 whitespace-pre-line sm:text-[15px]"
      >
        {tagline && (
          <span className="text-foreground font-medium">{tagline}</span>
        )}
        {tagline && overview && "\n"}
        {overview}
      </p>
      {truncated && (
        <Dialog>
          <DialogTrigger
            // One line of the text tall, which the fit counts on.
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring block h-6 rounded text-sm leading-6 font-medium outline-none focus-visible:ring-2"
          >
            {tr("title.more")}
          </DialogTrigger>
          <DialogContent className="max-h-[calc(100dvh-4rem)] grid-rows-[auto_minmax(0,1fr)] gap-4 p-6 sm:max-w-xl">
            <DialogHeader className="pr-8">
              <DialogTitle className="text-lg leading-snug font-semibold">
                {name}
              </DialogTitle>
              {tagline && (
                <p className="text-foreground text-[15px] font-medium">
                  {tagline}
                </p>
              )}
            </DialogHeader>
            {overview && (
              <div className="-mx-6 min-h-0 overflow-y-auto px-6">
                <p className="text-foreground/85 text-[15px] leading-6 whitespace-pre-line">
                  {overview}
                </p>
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
