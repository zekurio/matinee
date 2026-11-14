import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@matinee/ui/components/dropdown-menu"
import { CheckIcon } from "lucide-react"
import { type ReactElement, useState } from "react"

import { usePhone } from "@/components/sheet-menu"

import { AskSheet } from "./ask-sheet"

/**
 * Which library something goes to, picked from `trigger`: a menu on
 * wider screens, a drawer on phones. Picking the one it's on does nothing.
 */
export function LibraryChooser({
  libraries,
  value,
  onChange,
  title,
  trigger,
}: {
  libraries: readonly { id: string; name: string }[]
  value: string
  onChange: (id: string) => void
  /** The drawer's heading on phones. */
  title: string
  trigger: ReactElement
}) {
  const phone = usePhone()
  const [open, setOpen] = useState(false)
  if (phone) {
    return (
      <AskSheet
        open={open}
        onOpenChange={setOpen}
        title={title}
        trigger={trigger}
      >
        <div role="radiogroup" className="-mx-2 flex flex-col">
          {libraries.map((library) => (
            <button
              key={library.id}
              type="button"
              role="radio"
              aria-checked={library.id === value}
              onClick={() => {
                setOpen(false)
                if (library.id !== value) onChange(library.id)
              }}
              className="active:bg-foreground/[0.06] flex min-h-12 items-center justify-between gap-3 rounded-lg px-2 text-left font-medium"
            >
              {library.name}
              {library.id === value && (
                <CheckIcon aria-hidden className="text-primary size-5" />
              )}
            </button>
          ))}
        </div>
      </AskSheet>
    )
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={trigger} />
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(id: string) => {
            if (id !== value) onChange(id)
          }}
        >
          {libraries.map((library) => (
            <DropdownMenuRadioItem
              key={library.id}
              value={library.id}
              closeOnClick
            >
              {library.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
