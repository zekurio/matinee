import { defineMessages } from "../../catalog"

export default defineMessages("common", {
  // The save bar of a settings panel, in settings-panel.tsx.
  "common.saveBar.unsaved": "Unsaved changes",
  "common.saveBar.saved": "Changes saved",
  "common.saveBar.failed": "Couldn't save your changes",
  "common.saveBar.reset": "Reset",
  "common.saveBar.save": "Save changes",
  "common.saveBar.saving": "Saving…",
  "common.saveBar.done": "Saved",
  "common.saveBar.retry": "Try again",

  // Fallbacks for a failed call, in lib/rpc.ts.
  "common.error.server": "The server ran into a problem. Check its log.",
  "common.error.passkeyClosed":
    "The passkey prompt was closed before it finished.",
  "common.error.passkeyExists":
    "This device already has a passkey for your account.",
  "common.error.unknown": "Something went wrong.",
  "common.error.invalidInput":
    "That didn't go through. Check what you entered and try again.",
  "common.error.pageDescription":
    "The page couldn't be shown. Try again, or go back home.",
  "common.error.retry": "Try again",
  "common.notFound.title": "Page not found",
  "common.notFound.description":
    "The address may be mistyped, or the page may have moved.",
  "common.backHome": "Back home",
})
