import type { TranslationOf } from "../../catalog"
import type source from "../en/notifications"

export default {
  "notifications.requests": "Anfragen",
  "notifications.ready": "{name} ist bereit",
  "notifications.unavailable": "{name}: Nicht verfügbar",
  "notifications.waitingOne": "1 Anfrage wartet",
  "notifications.waiting": "{count} Anfragen warten",
  "notifications.attentionOne": "1 Anfrage braucht Aufmerksamkeit",
  "notifications.attention": "{count} Anfragen brauchen Aufmerksamkeit",
  "notifications.readySeasonNumber": "{name}: Staffel {number} ist bereit",
  "notifications.readySeason": "{name}: {season} ist bereit",
  "notifications.unavailableHint": "Das kommt nicht auf diesen Server.",
} satisfies TranslationOf<typeof source>
