import { AUTH_ERROR_QUERY_KEY } from "@matinee/contracts"
import { toast } from "@matinee/ui/components/sonner"
import { useNavigate } from "@tanstack/react-router"
import { useEffect } from "react"

import { translateKnown } from "@/i18n"

/**
 * Toasts the error an auth redirect brought back in the URL, such as a
 * failed OIDC round trip, then drops it from the URL so a reload or a
 * back step doesn't show it again.
 */
export function useAuthErrorToast(error: string | undefined, hint?: string) {
  const navigate = useNavigate()
  useEffect(() => {
    if (error === undefined) return
    // The id keeps a second run, as in StrictMode, to the one toast.
    toast.error(translateKnown(error), {
      id: "auth-error",
      description: hint,
    })
    void navigate({
      to: ".",
      search: (prev) => ({ ...prev, [AUTH_ERROR_QUERY_KEY]: undefined }),
      replace: true,
    })
  }, [error, hint, navigate])
}
