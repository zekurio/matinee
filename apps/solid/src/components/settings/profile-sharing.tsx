import type { ProfileSharing } from "@matinee/contracts"
import { useMutation, useQueryClient } from "@tanstack/solid-query"

import { tr } from "@/i18n"
import { Switch } from "@/kit/switch"
import { toast } from "@/kit/toast"
import { client, errorMessage, orpc } from "@/lib/rpc"

import { SettingRow, SettingRows } from "./settings-panel"

/** Change what the signed-in user's profile shows to others. */
function useUpdateSharing() {
  const queryClient = useQueryClient()
  return useMutation(() => ({
    mutationFn: (sharing: Partial<ProfileSharing>) =>
      client.account.profile.update({ sharing }),
    onSuccess: async (user) => {
      queryClient.setQueryData(orpc.auth.session.queryKey(), { user })
      await queryClient.invalidateQueries({ queryKey: orpc.profiles.key() })
    },
    onError: (error) =>
      toast.error(tr("account.sharing.failed"), {
        description: errorMessage(error),
      }),
  }))
}

/** A switch for each part of the profile others can see. */
export function SharingRows(props: { sharing: ProfileSharing }) {
  const update = useUpdateSharing()
  // The switch moves at once; a failure puts it back.
  const pending = () => (update.isPending ? update.variables : undefined)
  const shown = (key: keyof ProfileSharing) =>
    pending()?.[key] ?? props.sharing[key]
  return (
    <SettingRows>
      <SettingRow title={tr("account.sharing.favorites")}>
        {(ids) => (
          <Switch
            id={ids.controlId}
            aria-labelledby={ids.labelId}
            checked={shown("favorites")}
            onCheckedChange={(favorites) => update.mutate({ favorites })}
          />
        )}
      </SettingRow>
      <SettingRow title={tr("account.sharing.stats")}>
        {(ids) => (
          <Switch
            id={ids.controlId}
            aria-labelledby={ids.labelId}
            checked={shown("stats")}
            onCheckedChange={(stats) => update.mutate({ stats })}
          />
        )}
      </SettingRow>
    </SettingRows>
  )
}
