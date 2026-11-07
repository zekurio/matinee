import type { TaskId, TaskResult } from "@matinee/contracts"
import { pgTable, text, timestamp } from "drizzle-orm/pg-core"

/**
 * The last run of each scheduled task, so its interval counts across
 * restarts and admins see how it went.
 */
export const scheduledTask = pgTable("scheduled_task", {
  id: text().$type<TaskId>().primaryKey(),
  startedAt: timestamp({ withTimezone: true }).notNull(),
  endedAt: timestamp({ withTimezone: true }).notNull(),
  result: text().$type<TaskResult>().notNull(),
  error: text(),
})

export type ScheduledTaskRow = typeof scheduledTask.$inferSelect
