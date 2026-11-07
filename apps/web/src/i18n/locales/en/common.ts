import { defineMessages } from "../../catalog"

export default defineMessages("common", {
  // The save bar of a settings panel, in settings-panel.tsx.
  "common.saveBar.unsaved": "Unsaved changes",
  "common.saveBar.saved": "Changes saved",
  "common.saveBar.failed": "Couldn't save.",
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
})
