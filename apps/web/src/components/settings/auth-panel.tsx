import {
  type AdminAuthSettings,
  type AuthSettingsInput,
  type OidcSettings,
  OidcSettingsInput,
} from "@matinee/contracts"
import { Button } from "@matinee/ui/components/button"
import { Input } from "@matinee/ui/components/input"
import { Skeleton } from "@matinee/ui/components/skeleton"
import { cn } from "@matinee/ui/lib/utils"
import { useSelector } from "@tanstack/react-form"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { CheckIcon, ChevronDownIcon, CopyIcon } from "lucide-react"
import { useState } from "react"

import { type MessageKey, tr, translateKnown } from "@/i18n"
import { useAppForm, withForm } from "@/lib/form"
import { client, errorMessage, orpc } from "@/lib/rpc"
import { useActionFeedback } from "@/lib/use-action-feedback"

import {
  InputField,
  SettingWarning,
  SwitchField,
  typeOnly,
} from "./setting-controls"
import {
  SettingRow,
  SettingRows,
  SettingsSaveBar,
  SettingsSections,
  SettingsSubsection,
} from "./settings-panel"

const TEXT_FIELDS = [
  "displayName",
  "issuerUrl",
  "clientId",
  "scopes",
  "usernameClaim",
  "roleClaim",
] as const
type TextField = (typeof TEXT_FIELDS)[number]

/**
 * The form. Text fields hold only a saved value: an empty one falls back to
 * the environment's, which shows as its placeholder.
 */
type Draft = Record<TextField, string> & {
  passkeys: boolean
  enabled: boolean
  allowSignUp: boolean
  /** A new secret to save; empty keeps the current one. */
  clientSecret: string
  /** Drop the saved secret, so the environment's applies again. */
  dropSecret: boolean
}

function draftFrom({ passkeys, oidc, defaults }: AdminAuthSettings): Draft {
  const text = (key: TextField) =>
    oidc[key] === defaults[key] ? "" : oidc[key]
  return {
    passkeys: passkeys.enabled,
    displayName: text("displayName"),
    issuerUrl: text("issuerUrl"),
    clientId: text("clientId"),
    scopes: text("scopes"),
    usernameClaim: text("usernameClaim"),
    roleClaim: text("roleClaim"),
    enabled: oidc.enabled,
    allowSignUp: oidc.allowSignUp,
    clientSecret: "",
    dropSecret: false,
  }
}

/** The save, checked by the contract's schema before it's sent. */
function inputFrom(draft: Draft) {
  const secret = draft.clientSecret.trim()
  return OidcSettingsInput.safeParse({
    enabled: draft.enabled,
    allowSignUp: draft.allowSignUp,
    displayName: draft.displayName.trim(),
    issuerUrl: draft.issuerUrl.trim(),
    clientId: draft.clientId.trim(),
    scopes: draft.scopes.trim().replace(/\s+/g, " "),
    usernameClaim: draft.usernameClaim.trim(),
    roleClaim: draft.roleClaim.trim(),
    clientSecret: secret ? secret : draft.dropSecret ? null : undefined,
  })
}

const FIELD_NAMES = new Map<string, MessageKey>([
  ["displayName", "oidc.field.displayName"],
  ["issuerUrl", "oidc.field.issuerUrl"],
  ["clientId", "oidc.field.clientId"],
  ["scopes", "oidc.field.scopes"],
  ["usernameClaim", "oidc.field.usernameClaim"],
  ["roleClaim", "oidc.field.roleClaim"],
  ["clientSecret", "oidc.field.clientSecret"],
])

/** Why `inputFrom` rejected the draft, naming the field to check. */
function inputError(
  issue: { path: readonly PropertyKey[]; message: string } | undefined,
): Error {
  const field = FIELD_NAMES.get(String(issue?.path[0] ?? ""))
  const check = field
    ? tr("oidc.checkField", { field: tr(field) })
    : tr("oidc.checkFields")
  return new Error(
    issue
      ? tr("oidc.checkFieldIssue", {
          check,
          issue: translateKnown(issue.message),
        })
      : check,
  )
}

const sameDraft = (a: Draft, b: Draft) => {
  const other = new Map(Object.entries(b))
  return Object.entries(a).every(([key, value]) => other.get(key) === value)
}

export function AuthPanel() {
  const settings = useQuery(orpc.admin.auth.get.queryOptions())

  return (
    <SettingsSections>
      {settings.isPending ? (
        <Skeleton className="h-96 rounded-xl" />
      ) : settings.isError ? (
        <p className="text-muted-foreground text-sm">
          {tr("oidc.loadFailed", { error: errorMessage(settings.error) })}
        </p>
      ) : (
        <OidcForm settings={settings.data} />
      )}
    </SettingsSections>
  )
}

function OidcForm({ settings }: { settings: AdminAuthSettings }) {
  const queryClient = useQueryClient()
  const initial = draftFrom(settings)
  const save = useMutation({
    mutationFn: (input: AuthSettingsInput) => client.admin.auth.update(input),
  })
  // Until the first edit, the form follows the saved settings, so a refetch
  // shows through.
  const form = useAppForm({
    defaultValues: initial,
    onSubmit: async ({ value, formApi }) => {
      const parsed = inputFrom(value)
      if (!parsed.success) throw inputError(parsed.error.issues[0])
      const next = await save.mutateAsync({
        passkeys: { enabled: value.passkeys },
        oidc: parsed.data,
      })
      queryClient.setQueryData(orpc.admin.auth.get.queryKey(), next)
      formApi.reset(draftFrom(next))
      // The sign-in page and the account section read the public config.
      await queryClient.invalidateQueries({ queryKey: orpc.auth.key() })
    },
  })
  // Edits only: for a render after a refetch, an untouched form still holds
  // the old values.
  const dirty = useSelector(
    form.store,
    (state) => state.isTouched && !sameDraft(state.values, initial),
  )

  return (
    <form className="contents" onSubmit={(event) => event.preventDefault()}>
      <PasskeysSection form={form} settings={settings} />
      <SingleSignOnSection form={form} settings={settings} />
      <AdvancedSection form={form} defaults={settings.defaults} />
      <SettingsSaveBar
        dirty={dirty}
        onReset={() => form.reset()}
        onSave={() => form.handleSubmit()}
      />
    </form>
  )
}

const PasskeysSection = withForm({
  defaultValues: typeOnly<Draft>(),
  props: typeOnly<{ settings: AdminAuthSettings }>(),
  render: function Render({ form, settings }) {
    return (
      <SettingsSubsection
        id="passkeys"
        title={tr("oidc.passkeys.title")}
        description={tr("oidc.passkeys.description")}
      >
        <SettingRows>
          <form.AppField name="passkeys">
            {(field) => (
              <SwitchField
                title={tr("oidc.enabled")}
                footer={
                  settings.passkeys.enabled &&
                  !field.state.value &&
                  settings.unlinkedUsers > 0 ? (
                    <SettingWarning>
                      {tr("oidc.passkeys.unlinked", {
                        count: settings.unlinkedUsers,
                        provider: settings.oidc.displayName,
                      })}
                    </SettingWarning>
                  ) : null
                }
              />
            )}
          </form.AppField>
        </SettingRows>
      </SettingsSubsection>
    )
  },
})

const SingleSignOnSection = withForm({
  defaultValues: typeOnly<Draft>(),
  props: typeOnly<{ settings: AdminAuthSettings }>(),
  render: function Render({ form, settings }) {
    const { defaults } = settings

    return (
      <SettingsSubsection
        id="single-sign-on"
        title={tr("oidc.title")}
        description={tr("oidc.description")}
      >
        <SettingRows>
          <form.AppField name="enabled">
            {(field) => (
              <SwitchField
                title={tr("oidc.enabled")}
                footer={
                  settings.active &&
                  !field.state.value &&
                  settings.ssoOnlyUsers > 0 ? (
                    <SettingWarning>
                      {tr("oidc.ssoOnly", {
                        count: settings.ssoOnlyUsers,
                        provider: settings.oidc.displayName,
                      })}
                    </SettingWarning>
                  ) : null
                }
              />
            )}
          </form.AppField>
          <form.AppField name="allowSignUp">
            {() => (
              <SwitchField
                title={tr("oidc.allowSignUp")}
                description={tr("oidc.allowSignUp.description")}
              />
            )}
          </form.AppField>
          <form.AppField name="displayName">
            {() => (
              <InputField
                title={tr("oidc.field.displayName")}
                description={tr("oidc.displayName.description")}
                maxLength={64}
                placeholder={defaults.displayName}
              />
            )}
          </form.AppField>
          <form.AppField name="issuerUrl">
            {() => (
              <InputField
                title={tr("oidc.field.issuerUrl")}
                description={
                  defaults.issuerUrl
                    ? tr("oidc.issuerUrl.override")
                    : tr("oidc.issuerUrl.description")
                }
                layout="stack"
                type="url"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                placeholder={defaults.issuerUrl}
              />
            )}
          </form.AppField>
          <form.AppField name="clientId">
            {() => (
              <InputField
                title={tr("oidc.field.clientId")}
                description={
                  defaults.clientId ? tr("oidc.clientId.override") : undefined
                }
                layout="stack"
                autoComplete="off"
                spellCheck={false}
                placeholder={defaults.clientId}
              />
            )}
          </form.AppField>
          <ClientSecretRow form={form} settings={settings} />
          <CallbackRow url={settings.callbackUrl} />
        </SettingRows>
      </SettingsSubsection>
    )
  },
})

const AdvancedSection = withForm({
  defaultValues: typeOnly<Draft>(),
  props: typeOnly<{ defaults: OidcSettings }>(),
  render: function Render({ form, defaults }) {
    const [advanced, setAdvanced] = useState(false)

    return (
      <SettingsSubsection
        id="single-sign-on-advanced"
        title={tr("oidc.advanced")}
        action={
          <Button
            type="button"
            variant="outline"
            aria-expanded={advanced}
            aria-controls="oidc-advanced"
            onClick={() => setAdvanced(!advanced)}
          >
            {advanced ? tr("oidc.advanced.hide") : tr("oidc.advanced.show")}
            <ChevronDownIcon
              className={cn(
                "transition-transform motion-reduce:transition-none",
                advanced && "rotate-180",
              )}
            />
          </Button>
        }
      >
        <div id="oidc-advanced" hidden={!advanced}>
          <SettingRows>
            <form.AppField name="scopes">
              {() => (
                <InputField
                  title={tr("oidc.field.scopes")}
                  description={tr("oidc.scopes.description")}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={defaults.scopes}
                />
              )}
            </form.AppField>
            <form.AppField name="usernameClaim">
              {() => (
                <InputField
                  title={tr("oidc.field.usernameClaim")}
                  description={tr("oidc.usernameClaim.description")}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={defaults.usernameClaim}
                />
              )}
            </form.AppField>
            <form.AppField name="roleClaim">
              {() => (
                <InputField
                  title={tr("oidc.field.roleClaim")}
                  description={tr("oidc.roleClaim.description")}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={defaults.roleClaim}
                />
              )}
            </form.AppField>
          </SettingRows>
        </div>
      </SettingsSubsection>
    )
  },
})

const ClientSecretRow = withForm({
  defaultValues: typeOnly<Draft>(),
  props: typeOnly<{ settings: AdminAuthSettings }>(),
  render: function Render({ form, settings }) {
    const dropSecret = useSelector(
      form.store,
      (state) => state.values.dropSecret,
    )
    const { source, environment } = settings.clientSecret
    const savedHere = source === "saved" && !dropSecret
    const fromEnvironment =
      source === "environment" || (dropSecret && environment)
    const placeholder = savedHere
      ? tr("oidc.clientSecret.saved")
      : fromEnvironment
        ? tr("oidc.clientSecret.fromEnvironment")
        : tr("oidc.clientSecret.none")

    return (
      <SettingRow
        title={tr("oidc.field.clientSecret")}
        description={
          <>
            {tr("oidc.clientSecret.description")}{" "}
            {savedHere && (
              <button
                type="button"
                className="hover:text-foreground focus-visible:ring-ring rounded-sm underline underline-offset-2 outline-none focus-visible:ring-2"
                onClick={() => {
                  form.setFieldValue("clientSecret", "")
                  form.setFieldValue("dropSecret", true)
                }}
              >
                {environment
                  ? tr("oidc.clientSecret.useEnvironment")
                  : tr("oidc.clientSecret.remove")}
              </button>
            )}
            {dropSecret && (
              <span className="text-foreground">
                {environment
                  ? tr("oidc.clientSecret.environmentApplies")
                  : tr("oidc.clientSecret.removed")}
              </span>
            )}
          </>
        }
        layout="stack"
      >
        {(ids) => (
          <form.Field name="clientSecret">
            {(field) => (
              <Input
                id={ids.controlId}
                aria-describedby={ids.descriptionId}
                type="password"
                autoComplete="new-password"
                spellCheck={false}
                value={field.state.value}
                placeholder={placeholder}
                onChange={(event) => field.handleChange(event.target.value)}
              />
            )}
          </form.Field>
        )}
      </SettingRow>
    )
  },
})

function CallbackRow({ url }: { url: string }) {
  const { feedback, run } = useActionFeedback(1500)
  const copied = feedback.state === "success"
  return (
    <SettingRow
      title={tr("oidc.redirectUri")}
      description={tr("oidc.redirectUri.description")}
      layout="stack"
    >
      {(ids) => (
        <>
          <Input
            id={ids.controlId}
            aria-describedby={ids.descriptionId}
            readOnly
            value={url}
            className="font-mono text-[13px]"
            onFocus={(event) => event.currentTarget.select()}
          />
          <Button
            type="button"
            variant="outline"
            className="shrink-0"
            onClick={() => void run(() => navigator.clipboard.writeText(url))}
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
            {copied ? tr("oidc.copied") : tr("oidc.copy")}
          </Button>
        </>
      )}
    </SettingRow>
  )
}
