import { OPENAPI_PATH, OPENAPI_SPEC_PATH } from "@matinee/contracts"
import {
  type AnyApiReferenceConfiguration,
  ApiReferenceReact,
} from "@scalar/api-reference-react"
import { useEffect, useMemo } from "react"

import { useDocumentTitle } from "@/components/page-header"
import { getLocale, tr } from "@/i18n"
import { useThemeState } from "@/lib/theme-state"

import "@scalar/api-reference-react/style.css"
// After Scalar's, so Matinee's colors win.
import "./api-reference.css"

/**
 * The REST API's reference, drawn by Scalar from the server's OpenAPI
 * document in Matinee's colors (api-reference.css). Everything it needs
 * ships with the app: no fonts, proxy, telemetry, or assistant from
 * Scalar's servers.
 */
export function ApiReference() {
  const { appearance } = useThemeState()
  const title = tr("shell.apiReference")
  const locale = getLocale()
  useDocumentTitle(title)

  const configuration = useMemo(
    () =>
      ({
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
      }) satisfies AnyApiReferenceConfiguration,
    [appearance, locale, title],
  )

  // Scalar leaves its mode's class on <body> when it unmounts.
  useEffect(
    () => () => document.body.classList.remove("dark-mode", "light-mode"),
    [],
  )

  // Scalar reads the mode only when it mounts, so a new appearance mounts
  // it again. The URL keeps the section, so it opens where it was.
  return <ApiReferenceReact key={appearance} configuration={configuration} />
}
