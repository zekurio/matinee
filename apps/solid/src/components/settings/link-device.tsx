import type { JSX } from "@solidjs/web"
import { LogIn } from "lucide"
import { Show } from "solid-js"

import { DeviceApproval, DeviceCodeForm } from "@/components/device-link"
import { tr } from "@/i18n"
import { Button } from "@/kit/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/kit/dialog"
import { Icon } from "@/kit/icon"
import { createSettingsLinkDeviceStore } from "@/stores/settings-link-device"

/**
 * The sessions list's button for signing in a TV or app by its code, the
 * same steps as the /link page in a dialog. `onClosed` runs once it shuts.
 */
export function LinkDeviceButton(props: { onClosed: () => void }) {
  const store = createSettingsLinkDeviceStore()
  const close = () => {
    store.close()
    props.onClosed()
  }

  return (
    <>
      <Button variant="outline" onClick={() => store.start()}>
        <Icon icon={LogIn} />
        {tr("link.device.title")}
      </Button>
      <Dialog
        open={store.open()}
        onOpenChange={(next) => {
          if (!next) close()
        }}
      >
        <DialogContent class="gap-5 p-6 sm:max-w-md">
          <Show
            when={store.code()}
            keyed
            fallback={
              <DialogFrame
                title={tr("link.device.title")}
                description={tr("link.device.enterCodeOrScan")}
              >
                <DeviceCodeForm onSubmit={(code) => store.setCode(code)} />
              </DialogFrame>
            }
          >
            {(code) => (
              <DeviceApproval
                userCode={code}
                Frame={DialogFrame}
                done={
                  <Button
                    variant="outline"
                    size="lg"
                    class="w-full"
                    onClick={close}
                  >
                    {tr("link.device.done")}
                  </Button>
                }
                again={
                  <Button
                    variant="outline"
                    size="lg"
                    class="w-full"
                    onClick={() => store.setCode(null)}
                  >
                    {tr("link.device.anotherCode")}
                  </Button>
                }
              />
            )}
          </Show>
        </DialogContent>
      </Dialog>
    </>
  )
}

function DialogFrame(props: {
  title: string
  description?: JSX.Element
  children: JSX.Element
}) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>{props.title}</DialogTitle>
        <Show when={props.description}>
          <DialogDescription>{props.description}</DialogDescription>
        </Show>
      </DialogHeader>
      {props.children}
    </>
  )
}
