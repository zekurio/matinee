import { kotlinClient } from "./kotlin-client"
/*
 * Writes the Android app's API client, apps/android's ContractModels.kt
 * and ContractApi.kt, from the OpenAPI document the server
 * serves. With `--check`, it writes nothing and fails when either file is
 * out of date.
 *
 *   pnpm api:android            (from the repository root)
 *   pnpm api:android --check
 */
import { writeClient } from "./write-client"

await writeClient(
  "pnpm api:android",
  "apps/android/app/src/main/java/io/github/zekurio/matinee/api",
  kotlinClient,
)
