import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"

import { desktop, leaveSignedOut } from "@/lib/desktop"
import { client } from "@/lib/rpc"

/**
 * Signs out, forgets everything the server sent, and goes to the login.
 * The desktop app signs in itself, so there it takes over instead.
 */
export function useSignOut() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return useMutation({
    mutationFn: () => client.auth.signOut(),
    onSuccess: async () => {
      queryClient.clear()
      if (desktop) leaveSignedOut()
      else await navigate({ to: "/login" })
    },
  })
}
