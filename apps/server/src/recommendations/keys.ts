import type { TitleKind } from "@matinee/contracts"

export const keyOf = (ref: { kind: TitleKind; tmdbId: string }) =>
  `${ref.kind}:${ref.tmdbId}`
