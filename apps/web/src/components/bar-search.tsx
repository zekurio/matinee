import { cn } from "@matinee/ui/lib/utils"
import { SearchIcon, XIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { flushSync } from "react-dom"

import { BarAccessory, glass, pillItem } from "./app-shell"

/**
 * Search for phones, in the tab bar where a thumb reaches it. A button
 * beside the tabs opens a field that takes over the bar, as on iOS. Closing
 * it clears the search.
 */
export function BarSearch({
  value,
  onChange,
  label,
}: {
  value: string
  onChange: (value: string) => void
  label: string
}) {
  const [opened, setOpened] = useState(false)
  const container = useRef<HTMLElement>(null)
  const input = useRef<HTMLInputElement>(null)
  // A search restored from the URL comes back open.
  const open = opened || value !== ""

  const show = () => {
    // Mount and focus the field within the tap, or iOS won't raise the
    // keyboard.
    flushSync(() => setOpened(true))
    input.current?.focus()
  }
  const close = () => {
    onChange("")
    setOpened(false)
  }

  // Dragging the page puts the keyboard away, as in a native list.
  useEffect(() => {
    if (!open) return
    const dismiss = (event: TouchEvent) => {
      const field = input.current
      if (!field || document.activeElement !== field) return
      if (
        event.target instanceof Node &&
        container.current?.contains(event.target)
      ) {
        return
      }
      field.blur()
    }
    document.addEventListener("touchmove", dismiss, { passive: true })
    return () => document.removeEventListener("touchmove", dismiss)
  }, [open])

  if (!open) {
    return (
      <BarAccessory>
        <div className={cn(glass, "shrink-0")}>
          <button
            type="button"
            aria-label={label}
            onClick={show}
            className={pillItem}
          >
            <SearchIcon />
          </button>
        </div>
      </BarAccessory>
    )
  }

  return (
    <BarAccessory expanded>
      <search
        ref={container}
        className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-right-6 flex min-w-0 flex-1 items-center gap-2"
      >
        <label
          className={cn(glass, "flex min-w-0 flex-1 items-center gap-2 px-3")}
        >
          <SearchIcon className="text-muted-foreground size-4 shrink-0" />
          <input
            ref={input}
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            aria-label={label}
            placeholder={label}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur()
              if (event.key === "Escape") {
                if (value) onChange("")
                else close()
              }
            }}
            // 16px keeps iOS from zooming in on focus.
            className="placeholder:text-muted-foreground h-9 min-w-0 flex-1 bg-transparent text-base outline-none [&::-webkit-search-cancel-button]:appearance-none [@media(pointer:coarse)]:h-11"
          />
          {value && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                onChange("")
                input.current?.focus()
              }}
              className="focus-visible:ring-ring -mr-2 grid size-9 shrink-0 place-items-center rounded-full outline-none focus-visible:ring-2"
            >
              <span className="bg-foreground/30 text-background grid size-5 place-items-center rounded-full">
                <XIcon className="size-3 stroke-3" />
              </span>
            </button>
          )}
        </label>
        <div className={cn(glass, "shrink-0")}>
          <button
            type="button"
            aria-label="Close search"
            onClick={close}
            className={pillItem}
          >
            <XIcon />
          </button>
        </div>
      </search>
    </BarAccessory>
  )
}
