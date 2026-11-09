import type { TranscodingCapabilities } from "@matinee/contracts"
import { Badge } from "@matinee/ui/components/badge"
import { Button } from "@matinee/ui/components/button"
import { Spinner } from "@matinee/ui/components/spinner"
import { RefreshCwIcon } from "lucide-react"

import { perLocale, tr } from "@/i18n"

import { SettingWarning } from "./setting-controls"
import { SettingNote, SettingsSubsection } from "./settings-panel"
import { accelerationLabel } from "./transcoding-controls"

const detectedAt = perLocale(
  (locale) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }),
)
const lists = perLocale(
  (locale) => new Intl.ListFormat(locale, { type: "conjunction" }),
)

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
    !features.pauseKeys && tr("transcoding.ffmpeg.pauseKeys"),
    !features.hevcRemoveDovi && tr("transcoding.ffmpeg.doviRemoval"),
  ].filter((feature) => feature !== false)
  return (
    <SettingsSubsection
      id="ffmpeg"
      title="FFmpeg"
      action={
        <Button
          type="button"
          variant="outline"
          disabled={detecting}
          onClick={onDetect}
        >
          {detecting ? <Spinner /> : <RefreshCwIcon />}
          {detecting
            ? tr("transcoding.ffmpeg.detecting")
            : tr("transcoding.ffmpeg.detect")}
        </Button>
      }
    >
      <SettingNote>
        {capabilities.error
          ? tr("transcoding.ffmpeg.failed")
          : tr("transcoding.ffmpeg.detected", {
              path: capabilities.ffmpegPath,
              date: detectedAt().format(capabilities.detectedAt),
            })}
      </SettingNote>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant={capabilities.jellyfin ? "default" : "secondary"}>
          {capabilities.jellyfin ? "jellyfin-ffmpeg" : "FFmpeg"}{" "}
          {capabilities.version?.replace(/-Jellyfin$/i, "") ??
            tr("transcoding.ffmpeg.unknownVersion")}
        </Badge>
        {capabilities.hardware
          .filter((entry) => entry.device.status === "ok")
          .map((entry) => (
            <Badge key={entry.acceleration} variant="outline">
              {accelerationLabel(entry.acceleration)}
            </Badge>
          ))}
      </div>
      {capabilities.error && (
        <SettingWarning>{capabilities.error}</SettingWarning>
      )}
      {detectError && <SettingWarning>{detectError}</SettingWarning>}
      {!capabilities.error && missing.length > 0 && (
        <SettingWarning>
          {tr("transcoding.ffmpeg.lacks", {
            features: lists().format(missing),
          })}
        </SettingWarning>
      )}
    </SettingsSubsection>
  )
}
