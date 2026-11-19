import { dartClient } from "./dart-client"
import { writeClient } from "./write-client"

await writeClient("pnpm api:dart", "apps/flutter/lib/api", dartClient)
