import { render } from "@solidjs/web"

import { AlertDialog } from "@/kit/alert-dialog"
import { Dialog } from "@/kit/dialog"
import { Drawer } from "@/kit/drawer"
import { DropdownMenu } from "@/kit/dropdown-menu"
import { Popover } from "@/kit/popover"
import { ScrollArea } from "@/kit/scroll-area"
import { Select } from "@/kit/select"
import { Toaster } from "@/kit/toast"
import { Tooltip } from "@/kit/tooltip"

/**
 * Mounts a hidden copy of each ui-sdk popup kind the app uses, then throws it
 * away. A popup writes its CSS and registers its properties on its first
 * mount, and each write restyles the whole page; here they land before the
 * first screen exists. The copy never paints, so nothing is seen, focused, or
 * announced.
 */
export function warmUiSdk() {
  const host = document.createElement("div")
  host.style.display = "none"
  document.body.append(host)
  const dispose = render(
    () => (
      <>
        <AlertDialog />
        <Dialog />
        <Drawer />
        <DropdownMenu />
        <Popover />
        <Select />
        {/* A closed tooltip sleeps until its first hover, so open this one. */}
        <Tooltip defaultOpen />
        <ScrollArea />
        <Toaster />
      </>
    ),
    host,
  )
  dispose()
  host.remove()
}
