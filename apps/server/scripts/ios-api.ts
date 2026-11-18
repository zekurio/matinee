import { swiftClient } from "./swift-client"
/*
 * Writes the Apple apps' API client, MatineeCore's ContractModels.swift
 * and ContractApi.swift, from the OpenAPI document the server
 * serves. With `--check`, it writes nothing and fails when either file is
 * out of date.
 *
 *   pnpm api:ios            (from the repository root)
 *   pnpm api:ios --check
 */
import { writeClient } from "./write-client"

await writeClient(
  "pnpm api:ios",
  "apps/ios/Packages/MatineeCore/Sources/MatineeCore/Api",
  swiftClient,
)
