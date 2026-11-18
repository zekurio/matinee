import { cn } from "@matinee/ui/lib/utils"
import { useMemo } from "react"
import { encode } from "uqr"

/**
 * `text` as a QR code, black on a white card whatever the scheme, as the
 * Android app draws it: phones' cameras read dark on light best, and the
 * card's padding is the quiet zone they need. Size it with `className`,
 * and the padding with it for a card much larger than 14rem.
 */
export function QrCode({
  text,
  label,
  className,
}: {
  text: string
  label: string
  className?: string
}) {
  const { size, path } = useMemo(() => {
    const qr = encode(text, { ecc: "M", border: 0 })
    // One rectangle per run of dark modules in a row.
    let d = ""
    qr.data.forEach((row, y) => {
      let x = 0
      while (x < qr.size) {
        if (!row[x]) {
          x++
          continue
        }
        const start = x
        while (x < qr.size && row[x]) x++
        d += `M${start} ${y}h${x - start}v1h${start - x}z`
      }
    })
    return { size: qr.size, path: d }
  }, [text])

  return (
    <div
      role="img"
      aria-label={label}
      className={cn(
        "aspect-square rounded-2xl border bg-white p-4 text-black",
        className,
      )}
    >
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="size-full [shape-rendering:crispEdges]"
        aria-hidden
      >
        <path d={path} fill="currentColor" />
      </svg>
    </div>
  )
}
