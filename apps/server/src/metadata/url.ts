/** `base` and `path` as a URL, with the params that are set as its query. */
export function apiUrl(
  base: string,
  path: string,
  params: Record<string, string | number | undefined>,
): URL {
  const url = new URL(`${base}${path}`)
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value))
  }
  return url
}
