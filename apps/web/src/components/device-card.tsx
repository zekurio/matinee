import type { DevicePlatform } from "@matinee/contracts"
import { Globe, Monitor, Smartphone, Tv } from "lucide"

import { RowIcon } from "@/components/settings/settings-panel"
import { Icon, type IconNode } from "@/kit/icon"
import { deviceLabel, platformLabel } from "@/lib/devices"

function platformIcon(platform: DevicePlatform | null): IconNode {
  switch (platform) {
    case null:
      return Globe
    case "androidtv":
    case "tizen":
    case "tvos":
      return Tv
    case "android":
    case "ios":
      return Smartphone
    case "linux":
    case "macos":
    case "windows":
      return Monitor
  }
}

/** What a device is, at a glance. Null is a browser. */
export function PlatformIcon(props: { platform: DevicePlatform | null }) {
  return <Icon icon={platformIcon(props.platform)} />
}

/** The device an app signs in from, for the person approving it to check. */
export function DeviceCard(props: {
  name: string | null
  platform: DevicePlatform
}) {
  return (
    <div class="flex items-center gap-3 rounded-xl border px-4 py-3">
      <RowIcon>
        <PlatformIcon platform={props.platform} />
      </RowIcon>
      <div class="min-w-0 flex-1">
        <p class="truncate text-sm leading-5 font-medium">
          {deviceLabel(props.name, props.platform)}
        </p>
        <p class="text-muted-foreground text-13px leading-5">
          {platformLabel(props.platform)}
        </p>
      </div>
    </div>
  )
}
