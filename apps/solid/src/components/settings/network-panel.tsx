import { type AdminNetworkSettings, NetworkSettings } from "@matinee/contracts"
import type { JSX } from "@solidjs/web"
import { useMutation, useQuery, useQueryClient } from "@tanstack/solid-query"
import { Match, Show, Switch } from "solid-js"

import { perLocale, tr, translateKnown } from "@/i18n"
import { Skeleton } from "@/kit/skeleton"
import { Textarea } from "@/kit/textarea"
import type { Form } from "@/lib/form"
import { client, errorMessage, orpc } from "@/lib/rpc"
import { ShownError } from "@/lib/shown-error"

import { InputField, SettingWarning } from "./setting-controls"
import { createDraftForm } from "./settings-draft"
import {
  SettingNote,
  SettingRow,
  SettingRows,
  SettingsSaveBar,
  SettingsSections,
  SettingsSubsection,
} from "./settings-panel"

const MBIT = 1_000_000

// The speed as the interface's language writes a number: 2,5 in German.
const speeds = perLocale(
  (locale) =>
    new Intl.NumberFormat(locale, {
      useGrouping: false,
      maximumFractionDigits: 6,
    }),
)

/** The form: the lists as text, a line each, and the speed in Mbit/s. */
type Draft = {
  localNetworks: string
  trustedProxies: string
  uploadMbit: string
}

function draftFrom(settings: NetworkSettings): Draft {
  return {
    localNetworks: settings.localNetworks.join("\n"),
    trustedProxies: settings.trustedProxies.join("\n"),
    uploadMbit:
      settings.uploadBitrate === null
        ? ""
        : speeds().format(settings.uploadBitrate / MBIT),
  }
}

/** The entries of a list typed a line each. Commas and spaces split too. */
function entries(text: string): string[] {
  return text.split(/[\s,]+/).filter((entry) => entry !== "")
}

export function NetworkPanel() {
  const settings = useQuery(() => orpc.admin.network.get.queryOptions())

  return (
    <SettingsSections>
      <Switch>
        <Match when={settings.isPending}>
          <Skeleton class="h-72 rounded-xl" />
        </Match>
        <Match when={settings.isError}>
          <p class="text-muted-foreground text-sm">
            {tr("network.loadFailed", { error: errorMessage(settings.error) })}
          </p>
        </Match>
        <Match when={settings.isSuccess && settings.data}>
          {(saved) => <NetworkForm saved={saved()} />}
        </Match>
      </Switch>
    </SettingsSections>
  )
}

/** A list of addresses and ranges, typed a line each. */
function RangesField(props: {
  form: Form<Draft>
  name: "localNetworks" | "trustedProxies"
  title: string
  footer: JSX.Element
}) {
  const value = () => props.form.values()[props.name]
  return (
    <SettingRow title={props.title} layout="stack" footer={props.footer}>
      {(ids) => (
        <Textarea
          id={ids.controlId}
          value={value()}
          rows={Math.max(3, value().split("\n").length)}
          spellcheck={false}
          autocapitalize="none"
          autocomplete="off"
          class="text-13px font-mono"
          onValueChange={(next) => props.form.set(props.name, next)}
        />
      )}
    </SettingRow>
  )
}

function NetworkForm(props: { saved: AdminNetworkSettings }) {
  const queryClient = useQueryClient()
  const save = useMutation(() => ({
    mutationFn: (input: NetworkSettings) => client.admin.network.update(input),
  }))
  // Until the first edit, the form follows the saved settings.
  const form = createDraftForm<Draft>({
    initial: () => draftFrom(props.saved.settings),
    onSubmit: async (value) => {
      const speed = value.uploadMbit.trim()
      const parsed = NetworkSettings.safeParse({
        localNetworks: entries(value.localNetworks),
        trustedProxies: entries(value.trustedProxies),
        uploadBitrate:
          speed === ""
            ? null
            : Math.round(Number(speed.replace(",", ".")) * MBIT),
      })
      if (!parsed.success) {
        const message = parsed.error.issues.find(
          (issue) => issue.message,
        )?.message
        throw new ShownError(
          message === undefined
            ? tr("network.checkFields")
            : translateKnown(message),
        )
      }
      const next = await save.mutate(parsed.data)
      queryClient.setQueryData(orpc.admin.network.get.queryKey(), next)
      form.reset()
    },
  })
  const connection = () => props.saved.connection

  return (
    <form class="contents" onSubmit={(event) => event.preventDefault()}>
      <SettingsSubsection id="network" title={tr("network.title")}>
        {/* How the settings as saved see this very browser, which is the
            quickest way to tell whether they're right. */}
        <SettingNote>
          <Show
            when={connection().address}
            fallback={tr("network.connection.unknown")}
          >
            {(address) => (
              <Show
                when={connection().local}
                fallback={tr("network.connection.remote", {
                  address: address(),
                })}
              >
                {tr("network.connection.local", { address: address() })}
              </Show>
            )}
          </Show>
        </SettingNote>
        <Show when={connection().unheededProxy && connection().address}>
          {(address) => (
            <SettingWarning>
              {tr("network.unheededProxy", { address: address() })}
            </SettingWarning>
          )}
        </Show>
        <SettingRows>
          <RangesField
            form={form}
            name="localNetworks"
            title={tr("network.localNetworks")}
            footer={<SettingNote>{tr("network.ranges.note")}</SettingNote>}
          />
          <RangesField
            form={form}
            name="trustedProxies"
            title={tr("network.trustedProxies")}
            footer={
              <SettingNote>{tr("network.trustedProxies.note")}</SettingNote>
            }
          />
        </SettingRows>
      </SettingsSubsection>
      <SettingsSubsection
        id="network-upload"
        title={tr("network.upload.title")}
      >
        <SettingRows>
          <InputField
            form={form}
            name="uploadMbit"
            title={tr("network.upload")}
            footer={<SettingNote>{tr("network.upload.note")}</SettingNote>}
            inputmode="decimal"
            autocomplete="off"
            placeholder={tr("network.upload.placeholder")}
            class="@lg:w-40"
          />
        </SettingRows>
      </SettingsSubsection>
      <SettingsSaveBar
        dirty={form.dirty()}
        onReset={() => form.reset()}
        onSave={() => form.submit()}
      />
    </form>
  )
}
