import { timestamp } from "drizzle-orm/pg-core"

export const createdAt = () =>
  timestamp({ withTimezone: true }).notNull().defaultNow()
