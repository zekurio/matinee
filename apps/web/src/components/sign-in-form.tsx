import { type AuthConfig, oidcStartPath } from "@matinee/contracts"
import { Button, buttonVariants } from "@matinee/ui/components/button"
import { Separator } from "@matinee/ui/components/separator"
import { toast } from "@matinee/ui/components/sonner"
import { Spinner } from "@matinee/ui/components/spinner"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { KeyRoundIcon, LogInIcon } from "lucide-react"

import { tr } from "@/i18n"
import { signInWithPasskey, signUpWithPasskey } from "@/lib/passkey"
import { errorMessage, orpc } from "@/lib/rpc"

import { FormAlert } from "./form-alert"
import { UsernamePasskeyForm } from "./username-passkey-form"

/**
 * The ways in the server offers: a passkey, single sign-on, and passkey
 * sign-up while it's open. Signing in goes on to `target`.
 */
export function SignInForm({
  config,
  target,
}: {
  config: AuthConfig
  target: string
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const signedIn = async (
    user: Awaited<ReturnType<typeof signInWithPasskey>>,
  ) => {
    queryClient.setQueryData(orpc.auth.session.queryKey(), { user })
    await navigate({ href: target })
  }

  const passkey = useMutation({
    mutationFn: signInWithPasskey,
    onSuccess: signedIn,
    onError: (error) => toast.error(errorMessage(error)),
  })
  const signUp = useMutation({
    mutationFn: (username: string) => signUpWithPasskey(username),
    onSuccess: signedIn,
    onError: (error) => toast.error(errorMessage(error)),
  })

  return (
    <div className="flex flex-col gap-3">
      {config.passkeys && (
        <Button
          size="lg"
          disabled={passkey.isPending}
          onClick={() => passkey.mutate()}
        >
          {passkey.isPending ? <Spinner /> : <KeyRoundIcon />}
          {tr("auth.signIn.passkey")}
        </Button>
      )}
      {config.oidc && (
        <a
          href={oidcStartPath("sign-in", target)}
          className={buttonVariants({
            variant: config.passkeys ? "outline" : "default",
            size: "lg",
          })}
        >
          <LogInIcon />
          {tr("auth.signIn.oidc", { provider: config.oidc.displayName })}
        </a>
      )}
      {!config.passkeys && !config.oidc && (
        <FormAlert message={tr("auth.signIn.noMethod")} />
      )}

      {config.passkeySignUp && (
        <>
          <div className="text-muted-foreground my-4 flex items-center gap-3 text-xs">
            <Separator className="flex-1" />
            {tr("auth.signIn.newHere")}
            <Separator className="flex-1" />
          </div>
          <UsernamePasskeyForm
            submitLabel={tr("auth.signIn.createAccount")}
            pending={signUp.isPending}
            onSubmit={(username) => signUp.mutate(username)}
          />
        </>
      )}
    </div>
  )
}
