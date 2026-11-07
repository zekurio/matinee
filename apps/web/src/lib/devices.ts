import type { DevicePlatform, Session } from "@matinee/contracts"

import { tr } from "@/i18n"

// Names of the platforms themselves, the same in every language.
const PLATFORM_LABELS = {
  android: "Android",
  ios: "iOS",
  linux: "Linux",
  macos: "macOS",
  tizen: "Samsung TV",
  windows: "Windows",
} satisfies Record<DevicePlatform, string>

export function platformLabel(platform: DevicePlatform): string {
  return PLATFORM_LABELS[platform]
}

/** An app's device by its name, or by what it runs on: `Samsung TV app`. */
export function deviceLabel(
  name: string | null,
  platform: DevicePlatform,
): string {
  return name ?? tr("account.device.app", { platform: platformLabel(platform) })
}

/** What the sessions list calls a session. */
export function sessionLabel(session: Session): string {
  if (session.platform) return deviceLabel(session.deviceName, session.platform)
  return session.browser ?? tr("account.device.browser")
}
