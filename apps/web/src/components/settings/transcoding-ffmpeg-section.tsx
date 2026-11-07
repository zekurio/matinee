import type { TranscodingCapabilities } from "@matinee/contracts"
import { Badge } from "@matinee/ui/components/badge"
import { Button } from "@matinee/ui/components/button"
import { Spinner } from "@matinee/ui/components/spinner"
import { RefreshCwIcon } from "lucide-react"

import { SettingWarning } from "./setting-controls"
import { SettingsSubsection } from "./settings-panel"
import { ACCELERATION_LABELS, label } from "./transcoding-controls"

export function FfmpegSection({
  capabilities,
  detecting,
  detectError,
  onDetect,
}: {
  capabilities: TranscodingCapabilities
  detecting: boolean
  detectError: string | null
  onDetect: () => void
}) {
  const { features } = capabilities
  const missing = [
    !features.tonemapx && "tonemapx",
    !features.pauseKeys && "pause keys",
    !features.hevcRemoveDovi && "Dolby Vision removal",
  ].filter(Boolean)
  return (
    <SettingsSubsection
      id="ffmpeg"
      title="FFmpeg"
      description={
        capabilities.error
          ? "ffmpeg didn't run, so nothing can be transcoded."
          : `${capabilities.ffmpegPath}, detected ${capabilities.detectedAt.toLocaleString()}.`
      }
      action={
        <Button
          type="button"
          variant="outline"
          disabled={detecting}
          onClick={onDetect}
        >
          {detecting ? <Spinner /> : <RefreshCwIcon />}
          {detecting ? "Detecting…" : "Detect again"}
        </Button>
      }
    >
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant={capabilities.jellyfin ? "default" : "secondary"}>
          {capabilities.jellyfin ? "jellyfin-ffmpeg" : "FFmpeg"}{" "}
          {capabilities.version?.replace(/-Jellyfin$/i, "") ?? "unknown"}
        </Badge>
        {capabilities.hardware
          .filter((entry) => entry.device.status === "ok")
          .map((entry) => (
            <Badge key={entry.acceleration} variant="outline">
              {label(ACCELERATION_LABELS, entry.acceleration)}
            </Badge>
          ))}
      </div>
      {capabilities.error && (
        <SettingWarning>{capabilities.error}</SettingWarning>
      )}
      {detectError && <SettingWarning>{detectError}</SettingWarning>}
      {!capabilities.error && missing.length > 0 && (
        <SettingWarning>
          This build lacks {missing.join(", ")}. Use jellyfin-ffmpeg.
        </SettingWarning>
      )}
    </SettingsSubsection>
  )
}
