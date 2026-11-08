import { defineMessages } from "../../catalog"

export default defineMessages("auth", {
  // Sign-in and first-run setup.
  "auth.username": "Username",
  "auth.usernameHint": "Your browser or password manager stores the passkey.",
  "auth.signIn.title": "Sign in to Matinee",
  "auth.signIn.passkey": "Sign in with a passkey",
  "auth.signIn.oidc": "Continue with {provider}",
  "auth.signIn.errorHint":
    "Use a passkey from this server, or ask the admin for access.",
  "auth.signIn.errorHintSso": "Ask the admin for access.",
  // Passkeys are off and single sign-on isn't set up.
  "auth.signIn.noMethod":
    "There's no way to sign in to this server right now. Ask the admin.",
  "auth.signIn.newHere": "New to this server?",
  "auth.signIn.createAccount": "Create account with a passkey",
  "auth.setup.title": "Set up Matinee",
  "auth.setup.createAdmin": "Create the admin account.",
  "auth.setup.oidc":
    "Sign in with {provider} to create the admin account. Only an admin there can.",
  "auth.setup.enterToken": "Enter the setup token to claim this server.",
  "auth.setup.token": "Setup token",
  "auth.setup.tokenHint": "The server prints it to its log on start.",
  "auth.setup.continue": "Continue",
  "auth.setup.adminPasskey": "Create admin with a passkey",
  "auth.setup.adminOidc": "Create admin with {provider}",
  "auth.setup.noMethod":
    "Passkeys are off and single sign-on isn't set up, so nothing can create the admin account.",
  "auth.setup.noMethodHint":
    "Set MATINEE_PASSKEYS_ENABLED=true or the MATINEE_OIDC_* variables, then restart the server.",

  // The steps after the admin account exists.
  "auth.setup.step": "Step {current} of {total}",
  "auth.setup.back": "Back",
  "auth.setup.skip": "Skip",
  "auth.setup.transcoding.title": "Transcoding",
  "auth.setup.transcoding.description":
    "When a browser can't play a file as it is, Matinee converts it as it plays. A GPU does that faster and leaves the CPU free. The rest is under Settings → Transcoding.",
  "auth.setup.libraries.title": "Libraries",
  "auth.setup.libraries.description":
    "Add the folders that hold your movies and shows. Matinee scans them and fetches posters and details. You can add more under Settings → Libraries.",
  "auth.setup.done.title": "Matinee is ready",
  "auth.setup.done.description":
    "Scans and metadata keep going in the background. Everything set up here can change later under Settings.",
  "auth.setup.finish": "Go to Home",
})
