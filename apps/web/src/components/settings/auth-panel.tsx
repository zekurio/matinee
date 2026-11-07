import {
  type AdminAuthSettings,
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
] as const
type TextField = (typeof TEXT_FIELDS)[number]

/**
 * The form. Text fields hold only a saved value: an empty one falls back to
 * the environment's, which shows as its placeholder.
 */
type Draft = Record<TextField, string> & {
  enabled: boolean
  allowSignUp: boolean
  /** A new secret to save; empty keeps the current one. */
  clientSecret: string
  /** Drop the saved secret, so the environment's applies again. */
  dropSecret: boolean
}

function draftFrom({ oidc, defaults }: AdminAuthSettings): Draft {
  const text = (key: TextField) =>
    oidc[key] === defaults[key] ? "" : oidc[key]
  return {
    displayName: text("displayName"),
    issuerUrl: text("issuerUrl"),
    clientId: text("clientId"),
    scopes: text("scopes"),
    usernameClaim: text("usernameClaim"),
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
    clientSecret: secret ? secret : draft.dropSecret ? null : undefined,
  })
}

const FIELD_NAMES = new Map<string, string>([
  ["displayName", "Display name"],
  ["issuerUrl", "Issuer URL"],
  ["clientId", "Client ID"],
  ["scopes", "Scopes"],
  ["usernameClaim", "Username claim"],
  ["clientSecret", "Client secret"],
])

/** Why `inputFrom` rejected the draft, naming the field to check. */
function inputError(
  issue: { path: readonly PropertyKey[]; message: string } | undefined,
): Error {
  const field = FIELD_NAMES.get(String(issue?.path[0] ?? ""))
  const check = field ? `Check ${field}.` : "Check the fields."
  return new Error(issue ? `${check} ${issue.message}` : check)
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
          Couldn't load the sign-in settings. {errorMessage(settings.error)}
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
    mutationFn: (input: OidcSettingsInput) =>
      client.admin.auth.updateOidc(input),
  })
  // Until the first edit, the form follows the saved settings, so a refetch
  // shows through.
  const form = useAppForm({
    defaultValues: initial,
    onSubmit: async ({ value, formApi }) => {
      const parsed = inputFrom(value)
      if (!parsed.success) throw inputError(parsed.error.issues[0])
      const next = await save.mutateAsync(parsed.data)
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

const SingleSignOnSection = withForm({
  defaultValues: typeOnly<Draft>(),
  props: typeOnly<{ settings: AdminAuthSettings }>(),
  render: function Render({ form, settings }) {
    const { defaults } = settings

    return (
      <SettingsSubsection
        id="single-sign-on"
        title="Single sign-on"
        description="OpenID Connect, such as Authelia, Authentik, or Keycloak."
      >
        <SettingRows>
          <form.AppField name="enabled">
            {(field) => (
              <SwitchField
                title="Enabled"
                footer={
                  settings.active &&
                  !field.state.value &&
                  settings.ssoOnlyUsers > 0 ? (
                    <SettingWarning>
                      {settings.ssoOnlyUsers === 1
                        ? "1 account signs in only"
                        : `${settings.ssoOnlyUsers} accounts sign in only`}{" "}
                      through {settings.oidc.displayName}. It can't sign in
                      again until this is back on.
                    </SettingWarning>
                  ) : null
                }
              />
            )}
          </form.AppField>
          <form.AppField name="allowSignUp">
            {() => (
              <SwitchField
                title="Create accounts"
                description="For first sign-ins that match no account."
              />
            )}
          </form.AppField>
          <form.AppField name="displayName">
            {() => (
              <InputField
                title="Display name"
                description="Shown on the sign-in button."
                maxLength={64}
                placeholder={defaults.displayName}
              />
            )}
          </form.AppField>
          <form.AppField name="issuerUrl">
            {() => (
              <InputField
                title="Issuer URL"
                description={
                  defaults.issuerUrl
                    ? "Overrides MATINEE_OIDC_ISSUER_URL. Changing it unlinks every linked account."
                    : "Changing it later unlinks every linked account."
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
                title="Client ID"
                description={
                  defaults.clientId
                    ? "Overrides MATINEE_OIDC_CLIENT_ID."
                    : undefined
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
        title="Advanced"
        action={
          <Button
            type="button"
            variant="outline"
            aria-expanded={advanced}
            aria-controls="oidc-advanced"
            onClick={() => setAdvanced(!advanced)}
          >
            {advanced ? "Hide" : "Show"}
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
                  title="Scopes"
                  description="Separated by spaces. Must include openid."
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={defaults.scopes}
                />
              )}
            </form.AppField>
            <form.AppField name="usernameClaim">
              {() => (
                <InputField
                  title="Username claim"
                  description="Falls back to preferred_username."
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={defaults.usernameClaim}
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
      ? "Saved. Type to replace it."
      : fromEnvironment
        ? "Set by MATINEE_OIDC_CLIENT_SECRET"
        : "None"

    return (
      <SettingRow
        title="Client secret"
        description={
          <>
            Leave empty for a public client.{" "}
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
                  ? "Use the secret from the environment"
                  : "Remove the saved secret"}
              </button>
            )}
            {dropSecret && (
              <span className="text-foreground">
                {environment
                  ? "The environment's secret applies after you save."
                  : "The secret is removed when you save."}
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
      title="Redirect URI"
      description="Add this to the provider's allowed redirects."
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
            {copied ? "Copied" : "Copy"}
          </Button>
        </>
      )}
    </SettingRow>
  )
}
