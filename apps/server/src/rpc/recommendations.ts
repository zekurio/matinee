import { recommendationDismissal } from "@matinee/db"
import { and, eq } from "drizzle-orm"

import { db } from "../db"
import { queueRecommendations } from "../recommendations/compute"
import { home } from "../recommendations/read"
import { authed, badRequest } from "./base"

/** Home's recommendation rows, and "Not interested". Discover's rows go through `discover`. */
export const recommendations = {
  home: authed.recommendations.home.handler(({ context }) =>
    home(context.user),
  ),
  dismiss: authed.recommendations.dismiss.handler(
    async ({ context, input }) => {
      if (input.ref.provider !== "tmdb")
        throw badRequest("Choose a TMDB title to change your recommendations.")
      const value = {
        userId: context.user.id,
        kind: input.ref.kind,
        tmdbId: input.ref.providerId,
      }
      // Reads leave dismissed titles out, so the row stays for an undo.
      if (input.dismissed)
        await db
          .insert(recommendationDismissal)
          .values(value)
          .onConflictDoNothing()
      else
        await db
          .delete(recommendationDismissal)
          .where(
            and(
              eq(recommendationDismissal.userId, value.userId),
              eq(recommendationDismissal.kind, value.kind),
              eq(recommendationDismissal.tmdbId, value.tmdbId),
            ),
          )
      // Another title takes its place once the list is worked out again.
      queueRecommendations(context.user.id)
    },
  ),
}
