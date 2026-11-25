import type { TranscodingCapabilities } from "@matinee/contracts"
import { RefreshCw } from "lucide"
import { For, Show } from "solid-js"

import { perLocale, tr, translateKnown } from "@/i18n"
import { Badge } from "@/kit/badge"
import { Button } from "@/kit/button"
import { Icon } from "@/kit/icon"
import { Spinner } from "@/kit/spinner"

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

export function FfmpegSection(props: {
  capabilities: TranscodingCapabilities
  detecting: boolean
  onDetect: () => void
}) {
  const missing = () => {
    const { features } = props.capabilities
    return [
      !features.tonemapx && tr("transcoding.ffmpeg.tonemapx"),
      !features.pauseKeys && tr("transcoding.ffmpeg.pauseKeys"),
      !features.hevcRemoveDovi && tr("transcoding.ffmpeg.doviRemoval"),
    ].filter((feature) => feature !== false)
  }
  return (
    <SettingsSubsection
      id="ffmpeg"
      title="FFmpeg"
      action={
        <Button
          type="button"
          variant="outline"
          disabled={props.detecting}
          onClick={() => props.onDetect()}
        >
          <Show when={props.detecting} fallback={<Icon icon={RefreshCw} />}>
            <Spinner />
          </Show>
          {props.detecting
            ? tr("transcoding.ffmpeg.detecting")
            : tr("transcoding.ffmpeg.detect")}
        </Button>
      }
    >
      <SettingNote>
        {props.capabilities.error
          ? tr("transcoding.ffmpeg.failed")
          : tr("transcoding.ffmpeg.detected", {
              path: props.capabilities.ffmpegPath,
              date: detectedAt().format(props.capabilities.detectedAt),
            })}
      </SettingNote>
      <div class="flex flex-wrap items-center gap-2 text-sm">
        <Badge variant={props.capabilities.jellyfin ? "default" : "secondary"}>
          {props.capabilities.jellyfin ? "jellyfin-ffmpeg" : "FFmpeg"}{" "}
          {props.capabilities.version?.replace(/-Jellyfin$/i, "") ??
            tr("transcoding.ffmpeg.unknownVersion")}
        </Badge>
        <For
          each={props.capabilities.hardware.filter(
            (entry) => entry.device.status === "ok",
          )}
        >
          {(entry) => (
            <Badge variant="outline">
              {accelerationLabel(entry.acceleration)}
            </Badge>
          )}
        </For>
      </div>
      <Show
        when={props.capabilities.error}
        fallback={
          <Show when={missing().length > 0}>
            <SettingWarning>
              {tr("transcoding.ffmpeg.lacks", {
                features: lists().format(missing()),
              })}
            </SettingWarning>
          </Show>
        }
      >
        {(error) => (
          <SettingWarning>
            {tr("transcoding.ffmpeg.errorDetail")}
            <pre class="text-13px mt-1 font-mono break-words whitespace-pre-wrap">
              {translateKnown(error())}
            </pre>
          </SettingWarning>
        )}
      </Show>
    </SettingsSubsection>
  )
}
