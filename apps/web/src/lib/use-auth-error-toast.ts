import { AUTH_ERROR_QUERY_KEY } from "@matinee/contracts"
import { useNavigate } from "@tanstack/solid-router"
import { createEffect } from "solid-js"

import { knownMessage, tr } from "@/i18n"
import { toast } from "@/kit/toast"

/** Show the auth redirect's error once, then remove it from the URL. */
export function useAuthErrorToast(
  error: () => string | undefined,
  hint: () => string | undefined = () => undefined,
) {
  const navigate = useNavigate()
  createEffect(
    () => ({ error: error(), hint: hint() }),
    ({ error, hint }) => {
      if (error === undefined) return
      toast.error(knownMessage(error) ?? tr("auth.signIn.failed"), {
        id: "auth-error",
        description: hint,
      })
      // The router reads its match store when building the next location.
      queueMicrotask(() => {
        void navigate({
          to: ".",
          search: (prev) => ({ ...prev, [AUTH_ERROR_QUERY_KEY]: undefined }),
          replace: true,
        })
      })
    },
  )
}
