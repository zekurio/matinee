import type { Availability } from "@matinee/contracts"

export type RequestProgress = Pick<
  Availability,
  "progress" | "etaSeconds" | "stillLooking" | "releaseDate"
> & { waitingForRelease: boolean }
const progress = new Map<string, Map<number | null, RequestProgress>>()
const diagnostics = new Map<string, { label: string; value: string }[]>()
export function getDiagnostics(requestId: string) {
  return diagnostics.get(requestId) ?? []
}
export function setDiagnostics(
  requestId: string,
  values: { label: string; value: string }[],
) {
  diagnostics.set(requestId, values)
}
export function getProgress(requestId: string, season: number | null = null) {
  return progress.get(requestId)?.get(season)
}
export function setProgress(
  requestId: string,
  value: RequestProgress,
  season: number | null = null,
) {
  const entries =
    progress.get(requestId) ?? new Map<number | null, RequestProgress>()
  const changed = JSON.stringify(entries.get(season)) !== JSON.stringify(value)
  entries.set(season, value)
  progress.set(requestId, entries)
  return changed
}
export function clearProgress(requestId: string, season?: number | null) {
  if (season === undefined) {
    progress.delete(requestId)
    diagnostics.delete(requestId)
  } else {
    const entries = progress.get(requestId)
    entries?.delete(season)
    if (!entries?.size) progress.delete(requestId)
  }
}
