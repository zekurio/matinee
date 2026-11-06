import type { SubtitleTrack } from "@matinee/contracts"
import {
  Drawer,
  DrawerContent,
  DrawerHandle,
  DrawerTitle,
  DrawerTrigger,
} from "@matinee/ui/components/drawer"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@matinee/ui/components/dropdown-menu"
import { Spinner } from "@matinee/ui/components/spinner"
import { useMediaQuery } from "@matinee/ui/hooks/use-media-query"
import { cn } from "@matinee/ui/lib/utils"
import { CaptionsIcon, CheckIcon } from "lucide-react"
import { type RefObject, useEffect, useState } from "react"

import { trackDetail } from "@/lib/subtitles"

const OFF = "off"

type Choice = {
  id: string
  label: string
  detail: string
  disabled: boolean
}

const sheetRowClass =
  "flex min-h-12 w-full items-center rounded-lg px-3 text-left text-sm outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"

/**
 * The subtitles button in the player's control bar: Off plus each track.
 * A dropdown with a mouse, a bottom sheet on touch screens. Adapted from
 * alloy's player settings menu.
 */
export function SubtitlesMenu({
  tracks,
  selectedId,
  loading,
  onSelect,
  onOpenChange,
  container,
  triggerClassName,
}: {
  tracks: SubtitleTrack[]
  selectedId: string | null
  /** The selected track is still on its way, as while the server extracts it. */
  loading: boolean
  onSelect: (trackId: string | null) => void
  /** Keeps the controls shown while the menu is open. */
  onOpenChange: (open: boolean) => void
  /** The player, which may be the full-screen element. */
  container: RefObject<HTMLDivElement | null>
  triggerClassName: string
}) {
  const sheet = useMediaQuery("(pointer: coarse)")
  const [open, setOpen] = useState(false)
  // The cleanup also reports a close when the menu unmounts while open, so
  // the controls are never left pinned.
  useEffect(() => {
    if (!open) return
    onOpenChange(true)
    return () => onOpenChange(false)
  }, [open])

  const value = selectedId ?? OFF
  const choices: Choice[] = [
    { id: OFF, label: "Off", detail: "", disabled: false },
    ...tracks.map((track) => ({
      id: track.id,
      label: track.label,
      detail: trackDetail(track, tracks),
      disabled: !track.available,
    })),
  ]
  const choose = (id: string) => onSelect(id === OFF ? null : id)

  const trigger = (
    <button
      type="button"
      aria-label="Subtitles"
      title="Subtitles (c)"
      className={cn(triggerClassName, "relative")}
    >
      {loading ? <Spinner className="size-5" /> : <CaptionsIcon />}
      {selectedId !== null && (
        <span
          aria-hidden
          className="absolute bottom-1.5 left-1/2 h-0.5 w-5 -translate-x-1/2 rounded-full bg-white"
        />
      )}
    </button>
  )

  if (sheet) {
    return (
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerTrigger render={trigger} />
        <DrawerContent container={container}>
          <DrawerHandle />
          <DrawerTitle className="px-4 pt-3 pb-2 text-base">
            Subtitles
          </DrawerTitle>
          <div
            role="radiogroup"
            aria-label="Subtitles"
            className="min-h-0 overflow-y-auto px-2 pb-[max(1rem,env(safe-area-inset-bottom))]"
          >
            {choices.map((choice) => (
              <button
                key={choice.id}
                type="button"
                role="radio"
                aria-checked={choice.id === value}
                disabled={choice.disabled}
                className={sheetRowClass}
                onClick={() => {
                  choose(choice.id)
                  setOpen(false)
                }}
              >
                <span className="min-w-0 truncate">{choice.label}</span>
                {choice.detail && (
                  <span className="text-muted-foreground ml-auto pl-3 text-xs">
                    {choice.detail}
                  </span>
                )}
                {choice.id === value && (
                  <CheckIcon
                    className={cn(
                      "size-4 shrink-0",
                      choice.detail ? "ml-3" : "ml-auto",
                    )}
                  />
                )}
              </button>
            ))}
          </div>
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger render={trigger} />
      <DropdownMenuContent
        side="top"
        align="end"
        sideOffset={8}
        portalContainer={container}
        // Wide enough for the longest label and its detail.
        className="w-max max-w-(--available-width) min-w-56"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel>Subtitles</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={value} onValueChange={choose}>
            {choices.map((choice) => (
              <DropdownMenuRadioItem
                key={choice.id}
                value={choice.id}
                disabled={choice.disabled}
                closeOnClick
              >
                <span className="min-w-0 truncate">{choice.label}</span>
                {choice.detail && (
                  <span className="text-muted-foreground ml-auto pl-3 text-xs">
                    {choice.detail}
                  </span>
                )}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
