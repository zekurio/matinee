import { type AuthConfig, oidcStartPath } from "@matinee/contracts"
import { useMutation, useQueryClient } from "@tanstack/solid-query"
import { useNavigate } from "@tanstack/solid-router"
import { KeyRound, LogIn } from "lucide"
import { Show } from "solid-js"

import { tr } from "@/i18n"
import { Button, buttonVariants } from "@/kit/button"
import { Icon } from "@/kit/icon"
import { Separator } from "@/kit/separator"
import { Spinner } from "@/kit/spinner"
import { toast } from "@/kit/toast"
import { signInWithPasskey, signUpWithPasskey } from "@/lib/passkey"
import { errorMessage, orpc } from "@/lib/rpc"

import { FormAlert } from "./form-alert"
import { UsernamePasskeyForm } from "./username-passkey-form"

/** The ways in the server offers. Signing in continues to `target`. */
export function SignInForm(props: { config: AuthConfig; target: string }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const signedIn = async (
    user: Awaited<ReturnType<typeof signInWithPasskey>>,
  ) => {
    queryClient.setQueryData(orpc.auth.session.queryKey(), { user })
    await navigate({ href: props.target })
  }

  const passkey = useMutation(() => ({
    mutationFn: signInWithPasskey,
    onSuccess: signedIn,
    onError: (error) => toast.error(errorMessage(error)),
  }))
  const signUp = useMutation(() => ({
    mutationFn: (username: string) => signUpWithPasskey(username),
    onSuccess: signedIn,
    onError: (error) => toast.error(errorMessage(error)),
  }))

  return (
    <div class="flex flex-col gap-3">
      <Show when={props.config.passkeys}>
        <Button
          size="lg"
          disabled={passkey.isPending}
          onClick={() => {
            void passkey.mutate()
          }}
        >
          <Show when={passkey.isPending} fallback={<Icon icon={KeyRound} />}>
            <Spinner />
          </Show>
          {tr("auth.signIn.passkey")}
        </Button>
      </Show>
      <Show when={props.config.oidc}>
        {(provider) => (
          <a
            href={oidcStartPath("sign-in", props.target)}
            class={buttonVariants({
              variant: props.config.passkeys ? "outline" : "default",
              size: "lg",
            })}
          >
            <Icon icon={LogIn} />
            {tr("auth.signIn.oidc", { provider: provider().displayName })}
          </a>
        )}
      </Show>
      <Show when={!props.config.passkeys && !props.config.oidc}>
        <FormAlert message={tr("auth.signIn.noMethod")} />
      </Show>

      <Show when={props.config.passkeySignUp}>
        <div class="text-muted-foreground my-4 flex items-center gap-3 text-xs">
          <Separator class="flex-1" />
          {tr("auth.signIn.newHere")}
          <Separator class="flex-1" />
        </div>
        <UsernamePasskeyForm
          submitLabel={tr("auth.signIn.createAccount")}
          onSubmit={async (username) => {
            // The mutation already displays the error in a toast.
            await signUp.mutate(username).catch(() => undefined)
          }}
        />
      </Show>
    </div>
  )
}
