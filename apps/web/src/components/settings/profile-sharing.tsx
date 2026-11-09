import type { ProfileSharing } from "@matinee/contracts"
import { toast } from "@matinee/ui/components/sonner"
import { Switch } from "@matinee/ui/components/switch"
import { useMutation, useQueryClient } from "@tanstack/react-query"

import { tr } from "@/i18n"
import { client, errorMessage, orpc } from "@/lib/rpc"

import { SettingRow, SettingRows } from "./settings-panel"

/** Change what the signed-in user's profile shows to others. */
export function useUpdateSharing() {
  const queryClient = useQueryClient()
  return useMutation({
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
  })
}

/** A switch for each part of the profile others can see. */
export function SharingRows({ sharing }: { sharing: ProfileSharing }) {
  const update = useUpdateSharing()
  // The switch moves at once; a failure puts it back.
  const pending = update.isPending ? update.variables : undefined
  const shown = {
    favorites: pending?.favorites ?? sharing.favorites,
    stats: pending?.stats ?? sharing.stats,
  }
  return (
    <SettingRows>
      <SettingRow title={tr("account.sharing.favorites")}>
        {({ controlId, labelId }) => (
          <Switch
            id={controlId}
            aria-labelledby={labelId}
            checked={shown.favorites}
            onCheckedChange={(favorites) => update.mutate({ favorites })}
          />
        )}
      </SettingRow>
      <SettingRow title={tr("account.sharing.stats")}>
        {({ controlId, labelId }) => (
          <Switch
            id={controlId}
            aria-labelledby={labelId}
            checked={shown.stats}
            onCheckedChange={(stats) => update.mutate({ stats })}
          />
        )}
      </SettingRow>
    </SettingRows>
  )
}
