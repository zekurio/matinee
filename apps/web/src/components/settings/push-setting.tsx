import { toast } from "@matinee/ui/components/sonner"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { tr } from "@/i18n"
import {
  type PushState,
  pushState,
  subscribePush,
  unsubscribePush,
} from "@/lib/push"
import { errorMessage } from "@/lib/rpc"

import { SwitchRow } from "./setting-controls"
import { SettingNote, SettingRows, SettingsSubsection } from "./settings-panel"

// The browser's own state, not the server's, so it has a key of its own.
const PUSH_STATE = ["push-state"]

/**
 * Settings → Account → Notifications: web push on this device, for
 * what the viewer asked for. The switch says plainly why it can't be
 * turned on when it can't: no HTTPS, a browser without push, or push
 * blocked for the site in the browser's settings.
 */
export function PushSetting() {
  const queryClient = useQueryClient()
  const state = useQuery({
    queryKey: PUSH_STATE,
    queryFn: pushState,
    // The person may change the site's permission in another tab.
    refetchOnWindowFocus: true,
  })
  const toggle = useMutation({
    mutationFn: async (on: boolean) => {
      if (on) await subscribePush()
      else await unsubscribePush()
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: PUSH_STATE }),
    onError: (cause) =>
      toast.error(tr("account.push.failed"), {
        description: errorMessage(cause),
      }),
  })
  const current = state.data
  const usable = current === "on" || current === "off"
  return (
    <SettingsSubsection id="notifications" title={tr("account.push.section")}>
      <SettingRows>
        <SwitchRow
          title={tr("account.push.title")}
          checked={current === "on"}
          disabled={!usable || toggle.isPending}
          onChange={(on) => toggle.mutate(on)}
          footer={current && <SettingNote>{note(current)}</SettingNote>}
        />
      </SettingRows>
    </SettingsSubsection>
  )
}

function note(state: PushState): string {
  switch (state) {
    case "insecure":
      return tr("account.push.insecure")
    case "unsupported":
      return tr("account.push.unsupported")
    case "blocked":
      return tr("account.push.blocked")
    case "off":
      return tr("account.push.off")
    case "on":
      return tr("account.push.on")
  }
}
