import { OPENAPI_PATH, OPENAPI_SPEC_PATH } from "@matinee/contracts"
import { createApiReference } from "@scalar/api-reference"
import { createEffect, onSettled } from "solid-js"

import { useDocumentTitle } from "@/components/page-header"
import { getLocale, tr } from "@/i18n"
import { useThemeState } from "@/lib/theme-state"

import "@scalar/api-reference/style.css"
// After Scalar's, so Matinee's colors win.
import "@/components/api-reference.css"

type Configuration = Parameters<typeof createApiReference>[1]

/**
 * The REST API's reference, drawn by Scalar from the server's OpenAPI
 * document in Matinee's colors (api-reference.css). Everything it needs
 * ships with the app: no fonts, proxy, telemetry, or assistant from
 * Scalar's servers.
 */
export function ApiReference() {
  const theme = useThemeState()
  const title = tr("shell.apiReference")
  const locale = getLocale()
  useDocumentTitle(() => title)
  let host: HTMLDivElement | undefined

  // Scalar reads the mode only when it mounts, so a new appearance mounts
  // it again. The URL keeps the section, so it opens where it was.
  createEffect(
    () => theme().appearance,
    (appearance) => {
      if (!host) return
      const configuration = {
        url: OPENAPI_SPEC_PATH,
        // Requests go to this page's origin, where the session cookie
        // lives, even when the document names PUBLIC_URL and the page was
        // opened under another address.
        servers: [{ url: `${window.location.origin}${OPENAPI_PATH}` }],
        theme: "none",
        withDefaultFonts: false,
        forceDarkModeState: appearance,
        hideDarkModeToggle: true,
        localization: { locale },
        documentDownloadType: "json",
        showDeveloperTools: "never",
        setPageTitle: () => `${title} · Matinee`,
        proxyUrl: "",
        telemetry: false,
        agent: { disabled: true },
        mcp: { disabled: true },
      } satisfies Configuration
      const mount = document.createElement("div")
      host.append(mount)
      const reference = createApiReference(mount, configuration)
      return () => {
        reference.destroy()
        mount.remove()
      }
    },
  )

  // Scalar leaves its mode's class on <body> when it unmounts.
  onSettled(
    () => () => document.body.classList.remove("dark-mode", "light-mode"),
  )

  return <div ref={(el) => (host = el)} />
}
