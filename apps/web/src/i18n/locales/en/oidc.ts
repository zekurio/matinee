import { defineMessages, plural } from "../../catalog"

export default defineMessages("oidc", {
  // The single sign-on settings under Settings → Authentication.
  "oidc.loadFailed": "Couldn't load the sign-in settings. {error}",
  "oidc.checkField": "Check {field}.",
  "oidc.checkFields": "Check the fields.",
  // A check followed by the schema's reason, like "Check CRF. Use 0 to 51."
  "oidc.checkFieldIssue": "{check} {issue}",
  "oidc.field.displayName": "Display name",
  "oidc.field.issuerUrl": "Issuer URL",
  "oidc.field.clientId": "Client ID",
  "oidc.field.scopes": "Scopes",
  "oidc.field.usernameClaim": "Username claim",
  "oidc.field.roleClaim": "Role claim",
  "oidc.field.clientSecret": "Client secret",
  "oidc.field.groupsClaim": "Groups claim",
  "oidc.field.policyClaim": "Policy claim",

  // The passkeys section, above single sign-on.
  "oidc.passkeys.title": "Passkeys",
  "oidc.passkeys.unlinked": plural({
    one: "{count} account isn't linked to {provider}, so it can't sign in while passkeys are off. While still signed in, it can link {provider} under Settings → Account.",
    other:
      "{count} accounts aren't linked to {provider}, so they can't sign in while passkeys are off. While still signed in, they can link {provider} under Settings → Account.",
  }),
  "oidc.passkeys.allowSignUp": "Create accounts",
  "oidc.passkeys.allowSignUpHint":
    "Anyone who can reach this server can create an account with a passkey. While this is off, a new person needs an invite link from Settings → Users.",

  // The single sign-on section.
  "oidc.title": "Single sign-on",
  "oidc.enabled": "Enabled",
  "oidc.ssoOnly": plural({
    one: "{count} account signs in only through {provider}. It can't sign in again until this is back on.",
    other:
      "{count} accounts sign in only through {provider}. They can't sign in again until this is back on.",
  }),
  "oidc.allowSignUp": "Create accounts",
  "oidc.issuerUrl.override":
    "Overrides MATINEE_OIDC_ISSUER_URL. Changing it unlinks every linked account.",
  "oidc.issuerUrl.description":
    "Changing it later unlinks every linked account.",

  // The client secret's row.
  "oidc.clientSecret.saved": "Saved. Type to replace it.",
  "oidc.clientSecret.fromEnvironment": "Set by MATINEE_OIDC_CLIENT_SECRET",
  "oidc.clientSecret.none": "None",
  "oidc.clientSecret.useEnvironment": "Use the secret from the environment",
  "oidc.clientSecret.remove": "Remove the saved secret",
  "oidc.clientSecret.keep": "Keep the saved secret",
  "oidc.clientSecret.environmentApplies":
    "The environment's secret applies after you save.",
  "oidc.clientSecret.removed": "The secret is removed when you save.",

  // The redirect URI's row.
  "oidc.redirectUri": "Redirect URI",
  "oidc.copy": "Copy",
  "oidc.copied": "Copied",

  // What the provider's claims say about access, under single sign-on.
  "oidc.access.title": "Groups and access",
  // A claim's placeholder while none is set here or in the environment.
  "oidc.claim.off": "Off",
  "oidc.groupsClaim.description":
    "The claim that lists an account's groups at the provider. At each sign-in, an access group holds the accounts in the provider group named in its settings. An account without the claim is in no provider groups.",
  "oidc.policyClaim.description":
    "The claim that holds one account's limits, an object with any of libraries, maxBitrate, transcode, downloads, and maxStreams. At each sign-in it replaces what's set on the account under Users.",
  "oidc.signOutRefused": "Sign out accounts the provider refuses",
  "oidc.signOutRefused.description":
    "Ends every session of an account once the provider refuses to renew its sign-in, as it does for one it disabled or deleted. This reaches only accounts with a refresh token, which takes the offline_access scope.",

  // The advanced section.
  "oidc.advanced": "Advanced",
  "oidc.advanced.show": "Show",
  "oidc.advanced.hide": "Hide",
  "oidc.scopes.description": "Separated by spaces. Must include openid.",
})
