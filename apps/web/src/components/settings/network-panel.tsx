import { type AdminNetworkSettings, NetworkSettings } from "@matinee/contracts"
import { Skeleton } from "@matinee/ui/components/skeleton"
import { Textarea } from "@matinee/ui/components/textarea"
import { useSelector } from "@tanstack/react-form"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { ReactNode } from "react"

import { tr } from "@/i18n"
import { firstError, useAppForm, useFieldContext } from "@/lib/form"
import { client, errorMessage, orpc } from "@/lib/rpc"

import { InputField, SettingWarning } from "./setting-controls"
import {
  SettingNote,
  SettingRow,
  SettingRows,
  SettingsSaveBar,
  SettingsSections,
  SettingsSubsection,
} from "./settings-panel"

const MBIT = 1_000_000

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
        : String(settings.uploadBitrate / MBIT),
  }
}

/** The entries of a list typed a line each. Commas and spaces split too. */
function entries(text: string): string[] {
  return text.split(/[\s,]+/).filter((entry) => entry !== "")
}

function sameDraft(a: Draft, b: Draft): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

export function NetworkPanel() {
  const settings = useQuery(orpc.admin.network.get.queryOptions())

  return (
    <SettingsSections>
      {settings.isPending ? (
        <Skeleton className="h-72 rounded-xl" />
      ) : settings.isError ? (
        <p className="text-muted-foreground text-sm">
          {tr("network.loadFailed", { error: errorMessage(settings.error) })}
        </p>
      ) : (
        <NetworkForm saved={settings.data} />
      )}
    </SettingsSections>
  )
}

/** A list of addresses and ranges, typed a line each. */
function RangesField({ title, footer }: { title: string; footer: ReactNode }) {
  const field = useFieldContext<string>()
  const value = useSelector(field.store, (state) => state.value)
  return (
    <SettingRow title={title} layout="stack" footer={footer}>
      {(ids) => (
        <Textarea
          id={ids.controlId}
          value={value}
          rows={Math.max(3, value.split("\n").length)}
          spellCheck={false}
          autoCapitalize="none"
          autoComplete="off"
          className="font-mono text-[13px]"
          onChange={(event) => field.handleChange(event.target.value)}
        />
      )}
    </SettingRow>
  )
}

function NetworkForm({ saved }: { saved: AdminNetworkSettings }) {
  const queryClient = useQueryClient()
  const initial = draftFrom(saved.settings)
  const save = useMutation({
    mutationFn: (input: NetworkSettings) => client.admin.network.update(input),
  })
  // Until the first edit, the form follows the saved settings.
  const form = useAppForm({
    defaultValues: initial,
    onSubmit: async ({ value, formApi }) => {
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
        throw new Error(
          firstError(parsed.error.issues) ?? tr("network.checkFields"),
        )
      }
      const next = await save.mutateAsync(parsed.data)
      queryClient.setQueryData(orpc.admin.network.get.queryKey(), next)
      formApi.reset(draftFrom(next.settings))
    },
  })
  const dirty = useSelector(
    form.store,
    (state) => state.isTouched && !sameDraft(state.values, initial),
  )
  const { address, local, unheededProxy } = saved.connection

  return (
    <form className="contents" onSubmit={(event) => event.preventDefault()}>
      <SettingsSubsection id="network" title={tr("network.title")}>
        {/* How the settings as saved see this very browser, which is the
            quickest way to tell whether they're right. */}
        <SettingNote>
          {address === null
            ? tr("network.connection.unknown")
            : local
              ? tr("network.connection.local", { address })
              : tr("network.connection.remote", { address })}
        </SettingNote>
        {unheededProxy && address !== null && (
          <SettingWarning>
            {tr("network.unheededProxy", { address })}
          </SettingWarning>
        )}
        <SettingRows>
          <form.AppField name="localNetworks">
            {() => (
              <RangesField
                title={tr("network.localNetworks")}
                footer={<SettingNote>{tr("network.ranges.note")}</SettingNote>}
              />
            )}
          </form.AppField>
          <form.AppField name="trustedProxies">
            {() => (
              <RangesField
                title={tr("network.trustedProxies")}
                footer={
                  <SettingNote>{tr("network.trustedProxies.note")}</SettingNote>
                }
              />
            )}
          </form.AppField>
        </SettingRows>
      </SettingsSubsection>
      <SettingsSubsection
        id="network-upload"
        title={tr("network.upload.title")}
      >
        <SettingRows>
          <form.AppField name="uploadMbit">
            {() => (
              <InputField
                title={tr("network.upload")}
                footer={<SettingNote>{tr("network.upload.note")}</SettingNote>}
                inputMode="decimal"
                autoComplete="off"
                placeholder={tr("network.upload.placeholder")}
                className="@lg:w-40"
              />
            )}
          </form.AppField>
        </SettingRows>
      </SettingsSubsection>
      <SettingsSaveBar
        dirty={dirty}
        onReset={() => form.reset()}
        onSave={() => form.handleSubmit()}
      />
    </form>
  )
}
