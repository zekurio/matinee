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
  "auth.signIn.newHere": "New to this server?",
  "auth.signIn.createAccount": "Create account with a passkey",
  "auth.setup.title": "Set up Matinee",
  "auth.setup.createAdmin": "Create the admin account.",
  "auth.setup.enterToken": "Enter the setup token to claim this server.",
  "auth.setup.token": "Setup token",
  "auth.setup.tokenHint": "The server prints it to its log on start.",
  "auth.setup.continue": "Continue",
  "auth.setup.adminPasskey": "Create admin with a passkey",
  "auth.setup.or": "or",
  "auth.setup.adminOidc": "Create admin with {provider}",
})
