import { events } from "../realtime/events"

/** Watch history or favorites changed for this user. */
export function queueRecommendations(userId: string) {
  events.publish("recommendations", { userId })
}
