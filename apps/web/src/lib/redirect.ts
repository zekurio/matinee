/** Only same-origin paths, so a crafted link can't send users elsewhere. */
export function safeRedirect(value: string | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/"
  return value
}
