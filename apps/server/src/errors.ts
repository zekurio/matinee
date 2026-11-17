import { ORPCError } from "@orpc/server"

/*
 * What the server stores where clients and admins read it: job failures,
 * task results, a request's fulfilment error. A raw error can carry SQL,
 * a path, a program's output, or a stack, so only a message written for
 * the reader gets through. Anything else is logged in full, by the code
 * that catches it, and the reader gets a fixed text.
 */

/** A failure whose message is written for the person who reads it. */
export class ShownError extends Error {}

/** Stored for a job failure that carries no message of its own. */
export const JOB_FAILED = "This job failed. The server log has the details."

/** Stored for a task failure that carries no message of its own. */
export const TASK_FAILED = "This task failed. The server log has the details."

/**
 * What to store for `cause`: its message when it is a `ShownError` or a
 * client error (an ORPCError below 500), otherwise `fallback`.
 */
export function shownMessage(cause: unknown, fallback = JOB_FAILED): string {
  if (cause instanceof ShownError) return cause.message
  if (cause instanceof ORPCError && cause.status < 500) return cause.message
  return fallback
}
