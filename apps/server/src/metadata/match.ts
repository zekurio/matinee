import type { Candidate } from "./types"

/** Lowercase letters and digits only, so punctuation and case don't matter. */
export function normalize(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/&/g, " and ")
      // "Returner's" and Sonarr's "Returners" should compare equal.
      .replace(/['’`]/g, "")
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
  )
}

function nameScore(candidate: Candidate, wanted: string): number {
  let best = 0
  for (const name of [candidate.name, ...candidate.aliases]) {
    const have = normalize(name)
    if (!have) continue
    if (have === wanted) return 3
    if (have.startsWith(wanted) || wanted.startsWith(have)) best = 1
  }
  return best
}

function yearScore(candidate: Candidate, year: number | null): number {
  if (!year || !candidate.year) return 0
  const diff = Math.abs(candidate.year - year)
  return diff === 0 ? 2 : diff === 1 ? 1 : -2
}

/**
 * Pick the search result that fits the name and year read from the folder.
 * Ties go to the provider's own ranking. Null when nothing agrees on
 * either, which leaves the title unmatched rather than wrong. With
 * `exact`, only a candidate whose name or alias equals the wanted name
 * counts.
 */
export function bestMatch(
  candidates: Candidate[],
  wanted: { name: string; year: number | null },
  { exact = false }: { exact?: boolean } = {},
): Candidate | null {
  const name = normalize(wanted.name)
  let best: { candidate: Candidate; score: number } | null = null
  for (const candidate of candidates) {
    const byName = nameScore(candidate, name)
    const byYear = yearScore(candidate, wanted.year)
    if (exact && byName < 3) continue
    if (byName === 0 && byYear <= 0) continue
    const score = byName + byYear
    if (!best || score > best.score) best = { candidate, score }
  }
  return best?.candidate ?? null
}
