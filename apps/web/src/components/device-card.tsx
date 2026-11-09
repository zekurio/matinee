import type { DevicePlatform } from "@matinee/contracts"
import { GlobeIcon, MonitorIcon, SmartphoneIcon, TvIcon } from "lucide-react"

import { RowIcon } from "@/components/settings/settings-panel"
import { deviceLabel, platformLabel } from "@/lib/devices"

/** What a device is, at a glance. Null is a browser. */
export function PlatformIcon({
  platform,
}: {
  platform: DevicePlatform | null
}) {
  switch (platform) {
    case null:
      return <GlobeIcon />
    case "androidtv":
    case "tizen":
      return <TvIcon />
    case "android":
    case "ios":
      return <SmartphoneIcon />
    case "linux":
    case "macos":
    case "windows":
      return <MonitorIcon />
  }
}

/** The device an app signs in from, for the person approving it to check. */
export function DeviceCard({
  name,
  platform,
}: {
  name: string | null
  platform: DevicePlatform
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border px-4 py-3">
      <RowIcon>
        <PlatformIcon platform={platform} />
      </RowIcon>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm leading-5 font-medium">
          {deviceLabel(name, platform)}
        </p>
        <p className="text-muted-foreground text-[13px] leading-5">
          {platformLabel(platform)}
        </p>
      </div>
    </div>
  )
}
