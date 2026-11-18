import {
  AUDIO_CHANNEL_LAYOUTS,
  type DesktopBridge,
  type DesktopSettingsPatch,
  PASSTHROUGH_CODECS,
  type PassthroughCodec,
} from "@matinee/desktop-bridge"
import { toast } from "@matinee/ui/components/sonner"
import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { useEffect } from "react"

import { tr } from "@/i18n"
import { desktop } from "@/lib/desktop"
import { formatPercent } from "@/lib/format"
import { errorMessage } from "@/lib/rpc"

import { FixedRow, SelectRow, SwitchRow } from "./setting-controls"
import {
  SettingRows,
  SettingsSections,
  SettingsSubsection,
} from "./settings-panel"

/** The interface sizes offered, as the shell takes them: 1 is the system's. */
const SCALES = [0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3]

/** The formats' own names, the same in every language. */
const PASSTHROUGH_NAMES = new Map<PassthroughCodec, string>([
  ["ac3", "Dolby Digital"],
  ["eac3", "Dolby Digital Plus"],
  ["truehd", "Dolby TrueHD"],
  ["dts", "DTS"],
  ["dts-hd", "DTS-HD"],
])

const AUTO_DEVICE = "auto"

function settingsQuery(shell: DesktopBridge) {
  return queryOptions({
    queryKey: ["desktop", "settings"],
    queryFn: () => shell.request("settings.get"),
    staleTime: Infinity,
  })
}

/**
 * This computer's settings, which the app keeps: they follow changes made
 * in its other pages, and a change shows at once and goes back if the
 * app turns it down.
 */
function useDesktopSettings(shell: DesktopBridge) {
  const queryClient = useQueryClient()
  const query = settingsQuery(shell)
  const settings = useQuery(query).data
  useEffect(
    () =>
      shell.on("settings.changed", (next) =>
        queryClient.setQueryData(query.queryKey, next),
      ),
    [shell, queryClient],
  )
  const update = useMutation({
    mutationFn: (patch: DesktopSettingsPatch) =>
      shell.request("settings.set", patch),
    onMutate: (patch) => {
      const before = queryClient.getQueryData(query.queryKey)
      if (before)
        queryClient.setQueryData(query.queryKey, { ...before, ...patch })
      return { before }
    },
    onSuccess: (saved) => queryClient.setQueryData(query.queryKey, saved),
    onError: (error, _patch, context) => {
      if (context?.before) {
        queryClient.setQueryData(query.queryKey, context.before)
      }
      toast.error(tr("desktop.settings.failed"), {
        description: errorMessage(error),
      })
    },
  })
  return { settings, change: update.mutate }
}

/**
 * The desktop app's settings for this computer: how mpv decodes and where
 * its sound goes, and the window. The app keeps them, not the server.
 */
export function DesktopPanel() {
  if (!desktop) return null
  return <DesktopSettingsPanel shell={desktop} />
}

function DesktopSettingsPanel({ shell }: { shell: DesktopBridge }) {
  const { settings, change } = useDesktopSettings(shell)
  const devices = useQuery({
    queryKey: ["desktop", "audio-devices"],
    queryFn: () => shell.request("settings.audioDevices"),
  }).data
  const info = useQuery({
    queryKey: ["desktop", "info"],
    queryFn: () => shell.request("app.info"),
    staleTime: Infinity,
  }).data

  if (!settings) return null
  const deviceNames = [
    AUTO_DEVICE,
    ...(devices ?? []).map((device) => device.name),
  ]
  if (!deviceNames.includes(settings.audioDevice)) {
    deviceNames.push(settings.audioDevice)
  }
  const deviceLabel = (name: string) =>
    name === AUTO_DEVICE
      ? tr("desktop.audio.device.auto")
      : (devices?.find((device) => device.name === name)?.description ?? name)
  const scales = SCALES.includes(settings.scale)
    ? SCALES
    : [...SCALES, settings.scale].toSorted((a, b) => a - b)

  return (
    <SettingsSections>
      <SettingsSubsection id="video" title={tr("desktop.video.title")}>
        <SettingRows>
          <SwitchRow
            title={tr("desktop.hardwareDecoding")}
            checked={settings.hardwareDecoding}
            onChange={(hardwareDecoding) => change({ hardwareDecoding })}
          />
        </SettingRows>
      </SettingsSubsection>

      <SettingsSubsection id="audio" title={tr("desktop.audio.title")}>
        <SettingRows>
          <SelectRow
            title={tr("desktop.audio.device")}
            value={settings.audioDevice}
            options={deviceNames}
            labelOf={deviceLabel}
            onChange={(audioDevice) => change({ audioDevice })}
          />
          <SelectRow
            title={tr("desktop.audio.channels")}
            value={settings.audioChannels}
            options={AUDIO_CHANNEL_LAYOUTS}
            labelOf={(layout) => tr(`desktop.audio.channels.${layout}`)}
            onChange={(audioChannels) => change({ audioChannels })}
          />
          <SwitchRow
            title={tr("desktop.audio.exclusive")}
            checked={settings.exclusiveAudio}
            onChange={(exclusiveAudio) => change({ exclusiveAudio })}
          />
        </SettingRows>
      </SettingsSubsection>

      <SettingsSubsection
        id="passthrough"
        title={tr("desktop.passthrough.title")}
      >
        <SettingRows>
          {PASSTHROUGH_CODECS.map((codec) => (
            <SwitchRow
              key={codec}
              title={PASSTHROUGH_NAMES.get(codec) ?? codec}
              checked={settings.passthrough.includes(codec)}
              onChange={(on) =>
                change({
                  passthrough: on
                    ? [...settings.passthrough, codec]
                    : settings.passthrough.filter((entry) => entry !== codec),
                })
              }
            />
          ))}
        </SettingRows>
      </SettingsSubsection>

      <SettingsSubsection id="window" title={tr("desktop.window.title")}>
        <SettingRows>
          <SelectRow
            title={tr("desktop.scale")}
            value={String(settings.scale)}
            options={scales.map(String)}
            labelOf={(value) => formatPercent(Number(value))}
            onChange={(value) => change({ scale: Number(value) })}
          />
          <SwitchRow
            title={tr("desktop.fullscreen")}
            checked={settings.startFullscreen}
            onChange={(startFullscreen) => change({ startFullscreen })}
          />
        </SettingRows>
      </SettingsSubsection>

      {info && (
        <SettingsSubsection id="about" title={tr("desktop.about.title")}>
          <SettingRows>
            <FixedRow
              title={tr("desktop.about.version")}
              value={info.version}
            />
            <FixedRow title="mpv" value={info.mpv} />
            <FixedRow title="Qt" value={info.qt} />
            <FixedRow title="Chromium" value={info.chromium} />
          </SettingRows>
        </SettingsSubsection>
      )}
    </SettingsSections>
  )
}
