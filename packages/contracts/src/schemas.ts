import { t } from "./schema"

export * from "./artwork"
export * from "./auth"
export * from "./invites"
export * from "./library"
export * from "./search"
export * from "./sessions"
export * from "./streams"
export * from "./titles"
export * from "./users"

export const IdInput = t.object({ id: t.uuid() })
