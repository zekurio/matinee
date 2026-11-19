/*
 * Which issuer URLs Matinee talks to. Discovery, the token exchange, and
 * refreshes carry the client secret and sign-in codes, so they go over
 * https. Plain http is fine for a provider on the same machine, and
 * anywhere else only once the server's operator sets
 * MATINEE_OIDC_ALLOW_HTTP=true. Kept free of `env` so env.ts can check its
 * own issuer with it.
 */

/** The variable that lets an issuer off loopback use plain http. */
export const ALLOW_HTTP_VARIABLE = "MATINEE_OIDC_ALLOW_HTTP"

/** What an admin or operator reads when an http issuer is refused. */
export const PLAIN_HTTP_REFUSED = `Use an https issuer URL. Plain http only works for a provider on localhost, unless the server sets ${ALLOW_HTTP_VARIABLE}=true.`

/** localhost, 127.0.0.0/8, and ::1, in the form `URL.hostname` gives. */
export function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "")
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "[::1]" ||
    /^127(\.\d{1,3}){3}$/.test(host) ||
    // ::ffff:127.x.x.x, which the URL parser writes in hex.
    /^\[::ffff:7f[0-9a-f]{2}:[0-9a-f]{1,4}\]$/.test(host)
  )
}

/**
 * Whether Matinee refuses to reach this issuer: only https, loopback http,
 * and explicitly allowed off-loopback http may pass.
 */
export function plainHttpRefused(
  issuerUrl: string,
  allowHttp: boolean,
): boolean {
  if (!URL.canParse(issuerUrl)) return false
  const url = new URL(issuerUrl)
  if (url.protocol === "https:") return false
  if (url.protocol === "http:") {
    return !isLoopbackHost(url.hostname) && !allowHttp
  }
  return true
}
