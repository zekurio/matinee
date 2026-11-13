import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"

import { client } from "@/lib/rpc"

/** Signs out, forgets everything the server sent, and goes to the login. */
export function useSignOut() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return useMutation({
    mutationFn: () => client.auth.signOut(),
    onSuccess: async () => {
      queryClient.clear()
      await navigate({ to: "/login" })
    },
  })
}
