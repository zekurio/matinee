import type { AdminAuthSettings, OidcSettingsInput } from "@matinee/contracts"
import { Alert, AlertDescription } from "@matinee/ui/components/alert"
import { Button } from "@matinee/ui/components/button"
import { Input } from "@matinee/ui/components/input"
import { Skeleton } from "@matinee/ui/components/skeleton"
import { toast } from "@matinee/ui/components/sonner"
import { Switch } from "@matinee/ui/components/switch"
import { cn } from "@matinee/ui/lib/utils"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { type ChangeEvent, type ReactNode, useState } from "react"

import { client, errorMessage, orpc } from "@/lib/rpc"

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

function inputFrom(draft: Draft): OidcSettingsInput {
  const secret = draft.clientSecret.trim()
  return {
    enabled: draft.enabled,
    allowSignUp: draft.allowSignUp,
    displayName: draft.displayName.trim(),
    issuerUrl: draft.issuerUrl.trim(),
    clientId: draft.clientId.trim(),
    scopes: draft.scopes.trim().replace(/\s+/g, " "),
    usernameClaim: draft.usernameClaim.trim(),
    clientSecret: secret ? secret : draft.dropSecret ? null : undefined,
  }
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
  // Null while untouched, so a refetch shows through until the first edit.
  const [edits, setEdits] = useState<Draft | null>(null)
  const draft = edits ?? initial
  const dirty = edits !== null && !sameDraft(edits, initial)
  const [advanced, setAdvanced] = useState(false)
  const update = (patch: Partial<Draft>) => setEdits({ ...draft, ...patch })

  const save = useMutation({
    mutationFn: (input: OidcSettingsInput) =>
      client.admin.auth.updateOidc(input),
    onSuccess: async (next) => {
      queryClient.setQueryData(orpc.admin.auth.get.queryKey(), next)
      setEdits(null)
      // The sign-in page and the account section read the public config.
      await queryClient.invalidateQueries({ queryKey: orpc.auth.key() })
      toast.success("Saved sign-in settings")
    },
  })

  const { defaults } = settings
  const name = draft.displayName.trim() || defaults.displayName
  const text = (key: TextField) => ({
    value: draft[key],
    placeholder: defaults[key],
    onChange: (event: ChangeEvent<HTMLInputElement>) =>
      update({ [key]: event.target.value }),
  })
  const turningOff = settings.active && !draft.enabled

  return (
    <form className="contents" onSubmit={(event) => event.preventDefault()}>
      <SettingsSubsection
        id="single-sign-on"
        title="Single sign-on"
        description="Sign in through an OpenID Connect provider such as Authelia, Authentik, or Keycloak. Empty fields use the value shown in them."
      >
        <SettingRows>
          <SettingRow
            title="Enabled"
            description={`Show “Continue with ${name}” on the sign-in page.`}
            footer={
              turningOff && settings.ssoOnlyUsers > 0 ? (
                <Warning>
                  {settings.ssoOnlyUsers === 1
                    ? "1 account signs in only"
                    : `${settings.ssoOnlyUsers} accounts sign in only`}{" "}
                  through {settings.oidc.displayName}. It can't sign in again
                  until this is back on.
                </Warning>
              ) : null
            }
          >
            {(ids) => (
              <Switch
                id={ids.controlId}
                aria-labelledby={ids.labelId}
                aria-describedby={ids.descriptionId}
                checked={draft.enabled}
                onCheckedChange={(enabled) => update({ enabled })}
              />
            )}
          </SettingRow>
          <SettingRow
            title="Create accounts"
            description="Give people an account the first time they sign in. When off, only accounts already linked in their settings can sign in."
          >
            {(ids) => (
              <Switch
                id={ids.controlId}
                aria-labelledby={ids.labelId}
                aria-describedby={ids.descriptionId}
                checked={draft.allowSignUp}
                onCheckedChange={(allowSignUp) => update({ allowSignUp })}
              />
            )}
          </SettingRow>
          <SettingRow
            title="Display name"
            description="The provider's name on the sign-in button."
            layout="split"
          >
            {(ids) => (
              <Input
                id={ids.controlId}
                aria-describedby={ids.descriptionId}
                maxLength={64}
                {...text("displayName")}
              />
            )}
          </SettingRow>
          <SettingRow
            title="Issuer URL"
            description={
              defaults.issuerUrl
                ? "Set by MATINEE_OIDC_ISSUER_URL. A value here replaces it. Linked accounts belong to the issuer, so changing it breaks their links."
                : "The provider's issuer, for example https://auth.example.com. Linked accounts belong to it, so changing it later breaks their links."
            }
            layout="stack"
          >
            {(ids) => (
              <Input
                id={ids.controlId}
                aria-describedby={ids.descriptionId}
                type="url"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                {...text("issuerUrl")}
              />
            )}
          </SettingRow>
          <SettingRow
            title="Client ID"
            description={
              defaults.clientId
                ? "Set by MATINEE_OIDC_CLIENT_ID. A value here replaces it."
                : undefined
            }
            layout="stack"
          >
            {(ids) => (
              <Input
                id={ids.controlId}
                aria-describedby={ids.descriptionId}
                autoComplete="off"
                spellCheck={false}
                {...text("clientId")}
              />
            )}
          </SettingRow>
          <ClientSecretRow settings={settings} draft={draft} update={update} />
          <CallbackRow url={settings.callbackUrl} />
        </SettingRows>
      </SettingsSubsection>

      <SettingsSubsection
        id="single-sign-on-advanced"
        title="Advanced"
        description="What Matinee asks the provider for, and which claim names new accounts."
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
            <SettingRow
              title="Scopes"
              description="Separated by spaces. Must include openid."
              layout="split"
            >
              {(ids) => (
                <Input
                  id={ids.controlId}
                  aria-describedby={ids.descriptionId}
                  autoComplete="off"
                  spellCheck={false}
                  {...text("scopes")}
                />
              )}
            </SettingRow>
            <SettingRow
              title="Username claim"
              description="Suggests the username for new accounts. Falls back to preferred_username, then the email."
              layout="split"
            >
              {(ids) => (
                <Input
                  id={ids.controlId}
                  aria-describedby={ids.descriptionId}
                  autoComplete="off"
                  spellCheck={false}
                  {...text("usernameClaim")}
                />
              )}
            </SettingRow>
          </SettingRows>
        </div>
      </SettingsSubsection>

      <SettingsSaveBar
        dirty={dirty}
        saving={save.isPending}
        error={save.error ? errorMessage(save.error) : null}
        onReset={() => {
          setEdits(null)
          save.reset()
        }}
        onSave={() => save.mutate(inputFrom(draft))}
      />
    </form>
  )
}

function ClientSecretRow({
  settings,
  draft,
  update,
}: {
  settings: AdminAuthSettings
  draft: Draft
  update: (patch: Partial<Draft>) => void
}) {
  const { source, environment } = settings.clientSecret
  const savedHere = source === "saved" && !draft.dropSecret
  const fromEnvironment =
    source === "environment" || (draft.dropSecret && environment)
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
              onClick={() => update({ clientSecret: "", dropSecret: true })}
            >
              {environment
                ? "Use the secret from the environment"
                : "Remove the saved secret"}
            </button>
          )}
          {draft.dropSecret && (
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
        <Input
          id={ids.controlId}
          aria-describedby={ids.descriptionId}
          type="password"
          autoComplete="new-password"
          spellCheck={false}
          value={draft.clientSecret}
          placeholder={placeholder}
          onChange={(event) => update({ clientSecret: event.target.value })}
        />
      )}
    </SettingRow>
  )
}

function CallbackRow({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <SettingRow
      title="Redirect URI"
      description="Register this with the provider as the allowed redirect or callback URL."
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
            onClick={() => {
              void navigator.clipboard
                .writeText(url)
                .then(() => setCopied(true))
                .then(() => setTimeout(() => setCopied(false), 1500))
            }}
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </>
      )}
    </SettingRow>
  )
}

function Warning({ children }: { children: ReactNode }) {
  return (
    <Alert>
      <TriangleAlertIcon />
      <AlertDescription className="text-foreground">
        {children}
      </AlertDescription>
    </Alert>
  )
}
