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

import { DeviceApproval, DeviceCodeForm } from "@/components/device-link"
import { tr } from "@/i18n"

/**
 * The sessions list's button for signing in a TV or app by its code, the
 * same steps as the /link page in a dialog. `onClosed` runs once it shuts.
 */
export function LinkDeviceButton({ onClosed }: { onClosed: () => void }) {
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState<string | null>(null)
  const close = () => {
    setOpen(false)
    onClosed()
  }

  return (
    <>
      <Button
        variant="outline"
        onClick={() => {
          setCode(null)
          setOpen(true)
        }}
      >
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
