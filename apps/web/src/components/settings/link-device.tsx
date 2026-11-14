import { Button } from "@matinee/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@matinee/ui/components/dialog"
import { LogInIcon } from "lucide-react"
import { type ReactNode, useState } from "react"
import { useStore } from "zustand"

import { DeviceApproval, DeviceCodeForm } from "@/components/device-link"
import { tr } from "@/i18n"
import { createSettingsLinkDeviceStore } from "@/stores/settings-link-device"

/**
 * The sessions list's button for signing in a TV or app by its code, the
 * same steps as the /link page in a dialog. `onClosed` runs once it shuts.
 */
export function LinkDeviceButton({ onClosed }: { onClosed: () => void }) {
  const [store] = useState(createSettingsLinkDeviceStore)
  const { open, code, start, close: closeDialog, setCode } = useStore(store)
  const close = () => {
    closeDialog()
    onClosed()
  }

  return (
    <>
      <Button variant="outline" onClick={start}>
        <LogInIcon />
        {tr("link.device.title")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) close()
        }}
      >
        <DialogContent className="gap-5 p-6 sm:max-w-md">
          {code === null ? (
            <DialogFrame
              title={tr("link.device.title")}
              description={tr("link.device.enterCodeOrScan")}
            >
              <DeviceCodeForm onSubmit={setCode} />
            </DialogFrame>
          ) : (
            <DeviceApproval
              key={code}
              userCode={code}
              Frame={DialogFrame}
              done={
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full"
                  onClick={close}
                >
                  {tr("link.device.done")}
                </Button>
              }
              again={
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full"
                  onClick={() => setCode(null)}
                >
                  {tr("link.device.anotherCode")}
                </Button>
              }
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

function DialogFrame({
  title,
  description,
  children,
}: {
  title: string
  description?: ReactNode
  children: ReactNode
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        {description ? (
          <DialogDescription>{description}</DialogDescription>
        ) : null}
      </DialogHeader>
      {children}
    </>
  )
}
