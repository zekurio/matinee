import {
  type AdminAuthSettings,
  type AuthSettingsInput,
  type OidcSettings,
  OidcSettingsInput,
} from "@matinee/contracts"
import { cn } from "@matinee/ui/lib/utils"
import { useMutation, useQuery, useQueryClient } from "@tanstack/solid-query"
import { Check, ChevronDown, Copy, Trash2, Undo2 } from "lucide"
import {
  createEffect,
  createMemo,
  createSignal,
  Show,
  snapshot,
  untrack,
} from "solid-js"

import { type MessageKey, tr, translateKnown } from "@/i18n"
import { Button } from "@/kit/button"
import { Icon } from "@/kit/icon"
import { Input } from "@/kit/input"
import { Skeleton } from "@/kit/skeleton"
import { createForm, type Form } from "@/lib/form"
import { client, errorMessage, orpc } from "@/lib/rpc"
import { ShownError } from "@/lib/shown-error"
import { useActionFeedback } from "@/lib/use-action-feedback"

import { InputField, SettingWarning, SwitchField } from "./setting-controls"
import {
  SettingNote,
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
  "nameClaim",
  "roleClaim",
  "groupsClaim",
  "policyClaim",
] as const
type TextField = (typeof TEXT_FIELDS)[number]

/**
 * The form. Text fields hold only a saved value: an empty one falls back to
 * the environment's, which shows as its placeholder.
 */
type Draft = Record<TextField, string> & {
  passkeys: boolean
  /** Anyone may create an account with a passkey, without an invite. */
  passkeySignUp: boolean
  enabled: boolean
  allowSignUp: boolean
  signOutRefused: boolean
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
    passkeySignUp: passkeys.allowSignUp,
    displayName: text("displayName"),
    issuerUrl: text("issuerUrl"),
    clientId: text("clientId"),
    scopes: text("scopes"),
    usernameClaim: text("usernameClaim"),
    nameClaim: text("nameClaim"),
    roleClaim: text("roleClaim"),
    groupsClaim: text("groupsClaim"),
    policyClaim: text("policyClaim"),
    enabled: oidc.enabled,
    allowSignUp: oidc.allowSignUp,
    signOutRefused: oidc.signOutRefused,
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
    signOutRefused: draft.signOutRefused,
    displayName: draft.displayName.trim(),
    issuerUrl: draft.issuerUrl.trim(),
    clientId: draft.clientId.trim(),
    scopes: draft.scopes.trim().replace(/\s+/g, " "),
    usernameClaim: draft.usernameClaim.trim(),
    nameClaim: draft.nameClaim.trim(),
    roleClaim: draft.roleClaim.trim(),
    groupsClaim: draft.groupsClaim.trim(),
    policyClaim: draft.policyClaim.trim(),
    clientSecret: secret ? secret : draft.dropSecret ? null : undefined,
  })
}

const FIELD_NAMES = new Map<string, MessageKey>([
  ["displayName", "oidc.field.displayName"],
  ["issuerUrl", "oidc.field.issuerUrl"],
  ["clientId", "oidc.field.clientId"],
  ["scopes", "oidc.field.scopes"],
  ["usernameClaim", "oidc.field.usernameClaim"],
  ["nameClaim", "oidc.field.nameClaim"],
  ["roleClaim", "oidc.field.roleClaim"],
  ["groupsClaim", "oidc.field.groupsClaim"],
  ["policyClaim", "oidc.field.policyClaim"],
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
  return new ShownError(
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
  const settings = useQuery(() => orpc.admin.auth.get.queryOptions())

  return (
    <SettingsSections>
      <Show
        when={settings.isSuccess ? settings.data : undefined}
        fallback={
          <Show
            when={settings.isError}
            fallback={<Skeleton class="h-96 rounded-xl" />}
          >
            <p class="text-muted-foreground text-sm">
              {tr("oidc.loadFailed", { error: errorMessage(settings.error) })}
            </p>
          </Show>
        }
      >
        {(data) => <OidcForm settings={data()} />}
      </Show>
    </SettingsSections>
  )
}

function OidcForm(props: { settings: AdminAuthSettings }) {
  const queryClient = useQueryClient()
  const initial = createMemo(() => draftFrom(props.settings))
  const save = useMutation(() => ({
    mutationFn: (input: AuthSettingsInput) => client.admin.auth.update(input),
  }))
  // Seeded once; the effect below brings later saved settings in.
  const form = createForm<Draft>({
    defaultValues: untrack(initial),
    onSubmit: () => {},
  })
  // Until the first edit, the form follows the saved settings, so a refetch
  // shows through.
  createEffect(
    () => initial(),
    (draft) => {
      if (!form.dirty()) form.reset(draft)
    },
    { defer: true },
  )
  const dirty = () => !sameDraft(form.values(), initial())

  const send = async () => {
    const value = snapshot(form.values())
    const parsed = inputFrom(value)
    if (!parsed.success) throw inputError(parsed.error.issues[0])
    const next = await save.mutate({
      passkeys: {
        enabled: value.passkeys,
        allowSignUp: value.passkeySignUp,
      },
      oidc: parsed.data,
    })
    queryClient.setQueryData(orpc.admin.auth.get.queryKey(), next)
    form.reset(draftFrom(next))
    // The sign-in page and the account section read the public config.
    await queryClient.invalidateQueries({ queryKey: orpc.auth.key() })
  }

  return (
    <form class="contents" onSubmit={(event) => event.preventDefault()}>
      <PasskeysSection form={form} settings={props.settings} />
      <SingleSignOnSection form={form} settings={props.settings} />
      <ProviderAccessSection form={form} defaults={props.settings.defaults} />
      <AdvancedSection form={form} defaults={props.settings.defaults} />
      <SettingsSaveBar
        dirty={dirty()}
        onReset={() => form.reset()}
        onSave={send}
      />
    </form>
  )
}

type SectionProps = { form: Form<Draft>; settings: AdminAuthSettings }

function PasskeysSection(props: SectionProps) {
  return (
    <SettingsSubsection id="passkeys" title={tr("oidc.passkeys.title")}>
      <SettingRows>
        <SwitchField
          form={props.form}
          name="passkeys"
          title={tr("oidc.enabled")}
          footer={
            <Show
              when={
                props.settings.passkeys.enabled &&
                !props.form.values().passkeys &&
                props.settings.unlinkedUsers > 0
              }
            >
              <SettingWarning>
                {tr("oidc.passkeys.unlinked", {
                  count: props.settings.unlinkedUsers,
                  provider: props.settings.oidc.displayName,
                })}
              </SettingWarning>
            </Show>
          }
        />
        <SwitchField
          form={props.form}
          name="passkeySignUp"
          title={tr("oidc.passkeys.allowSignUp")}
          disabled={!props.form.values().passkeys}
          footer={
            <SettingNote>{tr("oidc.passkeys.allowSignUpHint")}</SettingNote>
          }
        />
      </SettingRows>
    </SettingsSubsection>
  )
}

function SingleSignOnSection(props: SectionProps) {
  const defaults = () => props.settings.defaults
  return (
    <SettingsSubsection id="single-sign-on" title={tr("oidc.title")}>
      <SettingRows>
        <SwitchField
          form={props.form}
          name="enabled"
          title={tr("oidc.enabled")}
          footer={
            <Show
              when={
                props.settings.active &&
                !props.form.values().enabled &&
                props.settings.ssoOnlyUsers > 0
              }
            >
              <SettingWarning>
                {tr("oidc.ssoOnly", {
                  count: props.settings.ssoOnlyUsers,
                  provider: props.settings.oidc.displayName,
                })}
              </SettingWarning>
            </Show>
          }
        />
        <SwitchField
          form={props.form}
          name="allowSignUp"
          title={tr("oidc.allowSignUp")}
        />
        <InputField
          form={props.form}
          name="displayName"
          title={tr("oidc.field.displayName")}
          maxlength={64}
          placeholder={defaults().displayName}
        />
        <InputField
          form={props.form}
          name="issuerUrl"
          title={tr("oidc.field.issuerUrl")}
          footer={
            <SettingNote>
              {defaults().issuerUrl
                ? tr("oidc.issuerUrl.override")
                : tr("oidc.issuerUrl.description")}
            </SettingNote>
          }
          layout="stack"
          type="url"
          inputmode="url"
          autocomplete="off"
          spellcheck={false}
          placeholder={defaults().issuerUrl}
        />
        <InputField
          form={props.form}
          name="clientId"
          title={tr("oidc.field.clientId")}
          layout="stack"
          autocomplete="off"
          spellcheck={false}
          placeholder={defaults().clientId}
        />
        <ClientSecretRow form={props.form} settings={props.settings} />
        <CallbackRow url={props.settings.callbackUrl} />
      </SettingRows>
    </SettingsSubsection>
  )
}

/**
 * What the provider's claims say about an account's access, and whether a
 * refusal from the provider signs the account out.
 */
function ProviderAccessSection(props: {
  form: Form<Draft>
  defaults: OidcSettings
}) {
  return (
    <SettingsSubsection
      id="single-sign-on-access"
      title={tr("oidc.access.title")}
    >
      <SettingRows>
        <InputField
          form={props.form}
          name="groupsClaim"
          title={tr("oidc.field.groupsClaim")}
          footer={
            <SettingNote>{tr("oidc.groupsClaim.description")}</SettingNote>
          }
          autocomplete="off"
          spellcheck={false}
          placeholder={props.defaults.groupsClaim || tr("oidc.claim.off")}
        />
        <InputField
          form={props.form}
          name="policyClaim"
          title={tr("oidc.field.policyClaim")}
          footer={
            <SettingNote>{tr("oidc.policyClaim.description")}</SettingNote>
          }
          autocomplete="off"
          spellcheck={false}
          placeholder={props.defaults.policyClaim || tr("oidc.claim.off")}
        />
        <SwitchField
          form={props.form}
          name="signOutRefused"
          title={tr("oidc.signOutRefused")}
          footer={
            <SettingNote>{tr("oidc.signOutRefused.description")}</SettingNote>
          }
        />
      </SettingRows>
    </SettingsSubsection>
  )
}

function AdvancedSection(props: { form: Form<Draft>; defaults: OidcSettings }) {
  const [advanced, setAdvanced] = createSignal(false)

  return (
    <SettingsSubsection
      id="single-sign-on-advanced"
      title={tr("oidc.advanced")}
      action={
        <Button
          type="button"
          variant="outline"
          aria-expanded={advanced() ? "true" : "false"}
          aria-controls="oidc-advanced"
          onClick={() => setAdvanced(!advanced())}
        >
          {advanced() ? tr("oidc.advanced.hide") : tr("oidc.advanced.show")}
          <Icon
            icon={ChevronDown}
            class={[
              "transition-transform motion-reduce:transition-none",
              { "rotate-180": advanced() },
            ]}
          />
        </Button>
      }
    >
      <div id="oidc-advanced" hidden={!advanced()}>
        <SettingRows>
          <InputField
            form={props.form}
            name="scopes"
            title={tr("oidc.field.scopes")}
            autocomplete="off"
            spellcheck={false}
            placeholder={props.defaults.scopes}
          />
          <InputField
            form={props.form}
            name="usernameClaim"
            title={tr("oidc.field.usernameClaim")}
            autocomplete="off"
            spellcheck={false}
            placeholder={props.defaults.usernameClaim}
          />
          <InputField
            form={props.form}
            name="nameClaim"
            title={tr("oidc.field.nameClaim")}
            autocomplete="off"
            spellcheck={false}
            placeholder={props.defaults.nameClaim}
          />
          <InputField
            form={props.form}
            name="roleClaim"
            title={tr("oidc.field.roleClaim")}
            autocomplete="off"
            spellcheck={false}
            placeholder={props.defaults.roleClaim}
          />
        </SettingRows>
      </div>
    </SettingsSubsection>
  )
}

function ClientSecretRow(props: SectionProps) {
  const dropSecret = () => props.form.values().dropSecret
  const typed = () => props.form.values().clientSecret !== ""
  const source = () => props.settings.clientSecret.source
  const environment = () => props.settings.clientSecret.environment
  const placeholder = () => {
    const savedHere = source() === "saved" && !dropSecret()
    const fromEnvironment =
      source() === "environment" || (dropSecret() && environment())
    return savedHere
      ? tr("oidc.clientSecret.saved")
      : fromEnvironment
        ? tr("oidc.clientSecret.fromEnvironment")
        : tr("oidc.clientSecret.none")
  }
  // Remove the saved secret, or take the removal back. Typing a new one
  // replaces it anyway, so the button waits for an empty field.
  const removable = () => source() === "saved" && !typed()
  const removeLabel = () =>
    dropSecret()
      ? tr("oidc.clientSecret.keep")
      : environment()
        ? tr("oidc.clientSecret.useEnvironment")
        : tr("oidc.clientSecret.remove")

  return (
    <SettingRow
      title={tr("oidc.field.clientSecret")}
      layout="stack"
      footer={
        <Show when={dropSecret()}>
          <SettingNote>
            {environment()
              ? tr("oidc.clientSecret.environmentApplies")
              : tr("oidc.clientSecret.removed")}
          </SettingNote>
        </Show>
      }
    >
      {(ids) => (
        <div class="relative w-full">
          <Input
            id={ids.controlId}
            type="password"
            autocomplete="new-password"
            spellcheck={false}
            value={props.form.values().clientSecret}
            placeholder={placeholder()}
            class={cn(removable() && "pr-11")}
            onValueChange={(value) => {
              props.form.set("clientSecret", value)
              if (value) props.form.set("dropSecret", false)
            }}
          />
          <Show when={removable()}>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={removeLabel()}
              title={removeLabel()}
              class={cn(
                "absolute top-1/2 right-1 -translate-y-1/2",
                !dropSecret() && "text-destructive hover:text-destructive",
              )}
              onClick={() => props.form.set("dropSecret", !dropSecret())}
            >
              <Icon icon={dropSecret() ? Undo2 : Trash2} />
            </Button>
          </Show>
        </div>
      )}
    </SettingRow>
  )
}

function CallbackRow(props: { url: string }) {
  const { feedback, run } = useActionFeedback({ successDuration: 1500 })
  const copied = () => feedback().state === "success"
  return (
    <SettingRow title={tr("oidc.redirectUri")} layout="stack">
      {(ids) => (
        <>
          <Input
            id={ids.controlId}
            readonly
            value={props.url}
            class="text-13px font-mono"
            onFocus={(event) => event.currentTarget.select()}
          />
          <Button
            type="button"
            variant="outline"
            class="shrink-0"
            onClick={() =>
              void run(() => navigator.clipboard.writeText(props.url))
            }
          >
            <Icon icon={copied() ? Check : Copy} />
            {copied() ? tr("oidc.copied") : tr("oidc.copy")}
          </Button>
        </>
      )}
    </SettingRow>
  )
}
