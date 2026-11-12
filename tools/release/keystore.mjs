#!/usr/bin/env node
/*
 * Writes the Android signing key from the release environment's secrets
 * to the runner's temporary folder, with the properties file Gradle reads,
 * and points MATINEE_KEYSTORE_PROPERTIES at it for the steps after.
 */

import { writeFileSync } from "node:fs"
import { join } from "node:path"

import { env, setForWorkflow } from "./lib.mjs"

const folder = env("RUNNER_TEMP")
const keystore = join(folder, "matinee.jks")
const properties = join(folder, "keystore.properties")
const onlyOwner = { mode: 0o600 }

writeFileSync(
  keystore,
  Buffer.from(env("ANDROID_KEYSTORE_BASE64"), "base64"),
  onlyOwner,
)
writeFileSync(
  properties,
  [
    `storeFile=${keystore}`,
    `storePassword=${env("ANDROID_KEYSTORE_PASSWORD")}`,
    `keyAlias=${env("ANDROID_KEY_ALIAS")}`,
    `keyPassword=${env("ANDROID_KEY_PASSWORD")}`,
    "",
  ].join("\n"),
  onlyOwner,
)
setForWorkflow("GITHUB_ENV", "MATINEE_KEYSTORE_PROPERTIES", properties)
