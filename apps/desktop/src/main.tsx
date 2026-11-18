import "./styles.css"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { App } from "./app"
import { applyLocale } from "./i18n"
import { installArrowNavigation } from "./lib/arrow-navigation"
import { useApp } from "./stores/app"

// A browser on the dev server has no shell; a pretend one stands in. The
// branch, and the mock with it, is gone from a build.
if (import.meta.env.DEV && !window.matineeDesktop) {
  const { installMockShell } = await import("./dev/mock-shell")
  installMockShell()
}

// Follow the system's light or dark scheme, as public/scheme.js set it first.
const dark = matchMedia("(prefers-color-scheme: dark)")
const applyScheme = () => {
  document.documentElement.classList.toggle("dark", dark.matches)
  document.documentElement.classList.toggle("light", !dark.matches)
}
applyScheme()
dark.addEventListener("change", applyScheme)

applyLocale()
installArrowNavigation()
void useApp.getState().start()

const root = document.getElementById("root")
if (!root) throw new Error("Missing #root element")

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
