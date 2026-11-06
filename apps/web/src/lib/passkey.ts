import { startAuthentication, startRegistration } from "@simplewebauthn/browser"

import { client } from "./rpc"

export async function signInWithPasskey() {
  const { challengeId, options } = await client.auth.passkey.signInOptions()
  const response = await startAuthentication({ optionsJSON: options })
  return client.auth.passkey.signIn({ challengeId, response })
}

export async function signUpWithPasskey(username: string) {
  const { challengeId, options } = await client.auth.passkey.signUpOptions({
    username,
  })
  const response = await startRegistration({ optionsJSON: options })
  return client.auth.passkey.signUp({ challengeId, response })
}

export async function addPasskey(name: string | null) {
  const { challengeId, options } =
    await client.account.passkeys.registerOptions()
  const response = await startRegistration({ optionsJSON: options })
  return client.account.passkeys.register({ challengeId, response, name })
}

/** Create a passkey for the account an invite or recovery link is for. */
export async function acceptInviteWithPasskey(token: string) {
  const { challengeId, options } = await client.auth.invite.registerOptions({
    token,
  })
  const response = await startRegistration({ optionsJSON: options })
  return client.auth.invite.register({ token, challengeId, response })
}
