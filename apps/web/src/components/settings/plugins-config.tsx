import type {
  PluginConfigField,
  PluginConfigValues,
  PluginImpact,
  PluginInfo,
} from "@matinee/contracts"
import { t } from "@matinee/contracts/schema"
import { Button } from "@matinee/ui/components/button"
import { Input } from "@matinee/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@matinee/ui/components/select"
import { Switch } from "@matinee/ui/components/switch"
import { cn } from "@matinee/ui/lib/utils"
import { useSelector } from "@tanstack/react-form"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Trash2Icon, Undo2Icon } from "lucide-react"
import { type ReactNode, useId, useState } from "react"

import { tr } from "@/i18n"
import { useAppForm } from "@/lib/form"
import { formatCount } from "@/lib/format"
import { client } from "@/lib/rpc"

import { usePluginSaved, usePluginsPanel } from "./plugins-common"
import { impactOptions, type LinksAnswer, LinksDialog } from "./plugins-impact"
import { SettingNote, SettingRows, SettingsSaveBar } from "./settings-panel"

/**
 * The form. Text holds what's typed for every field but switches, as
 * typed: an empty one falls back to the environment or the default. A
 * secret's text is a new value only, since the saved one never comes back.
 */
type Draft = {
  text: Record<string, string>
  toggles: Record<string, boolean>
  /** Secrets to drop, so the environment's or none applies again. */
  clear: Record<string, boolean>
}

function textOf(value: PluginConfigValues[string] | undefined): string {
  if (value === null || value === undefined) return ""
  return String(value)
}

function draftFrom(plugin: PluginInfo): Draft {
  const { fields, values, environment } = plugin.config
  const draft: Draft = { text: {}, toggles: {}, clear: {} }
  for (const field of fields) {
    const fromEnvironment = environment.includes(field.key)
    if (field.type === "boolean") {
      const value = values[field.key]
      draft.toggles[field.key] =
        value === true ||
        ((value === null || value === undefined) && field.default === true)
    } else if (field.type === "secret") {
      draft.text[field.key] = ""
      draft.clear[field.key] = false
    } else {
      draft.text[field.key] = fromEnvironment ? "" : textOf(values[field.key])
    }
  }
  return draft
}

const sameDraft = (a: Draft, b: Draft) =>
  JSON.stringify(a) === JSON.stringify(b)

const Url = t.string().url()

/** Why a field's text can't be saved, or undefined when it can. */
function fieldIssue(
  field: PluginConfigField,
  text: string,
): string | undefined {
  const value = text.trim()
  if (!value) return undefined
  if (field.type === "number") {
    const number = Number(value)
    if (!Number.isFinite(number)) return tr("plugins.config.notNumber")
    if (field.min !== undefined && number < field.min) {
      return tr("plugins.config.atLeast", { min: formatCount(field.min) })
    }
    if (field.max !== undefined && number > field.max) {
      return tr("plugins.config.atMost", { max: formatCount(field.max) })
    }
  }
  if (field.type === "url" && !Url.safeParse(value).success) {
    return tr("plugins.config.notUrl")
  }
  return undefined
}

/** The save: only fields that changed, so the rest keep where they come from. */
function changes(
  fields: PluginConfigField[],
  draft: Draft,
  initial: Draft,
): PluginConfigValues {
  const values: PluginConfigValues = {}
  for (const field of fields) {
    const key = field.key
    if (field.type === "boolean") {
      const value = draft.toggles[key] ?? false
      if (value !== initial.toggles[key]) values[key] = value
      continue
    }
    const text = (draft.text[key] ?? "").trim()
    if (field.type === "secret") {
      if (text) values[key] = text
      else if (draft.clear[key]) values[key] = null
      continue
    }
    if (text === (initial.text[key] ?? "").trim()) continue
    if (!text) values[key] = null
    else if (field.type === "number") values[key] = Number(text)
    else values[key] = text
  }
  return values
}

/**
 * The settings among a save that decide who a sign-in belongs to and
 * really change, compared as the server does: an empty value is the
 * default. A secret never comes back, so any new one counts.
 */
function movedIdentity(
  plugin: PluginInfo,
  values: PluginConfigValues,
): PluginConfigField[] {
  return plugin.config.fields.filter((field) => {
    if (!plugin.config.identity.includes(field.key)) return false
    if (!(field.key in values)) return false
    if (field.type === "secret") return values[field.key] !== null
    const fallback = field.default ?? null
    return (
      (values[field.key] ?? fallback) !==
      (plugin.config.values[field.key] ?? fallback)
    )
  })
}

/** Why a saved value the plugin no longer takes doesn't fit, in words. */
function staleMessage(plugin: PluginInfo, field: PluginConfigField): string {
  const saved = plugin.config.values[field.key]
  const value = textOf(saved)
  const first = value
    ? tr("plugins.config.invalidValue", {
        value: tr("plugins.quoted", { text: value }),
      })
    : tr("plugins.config.invalid")
  const fix =
    field.type === "select"
      ? tr("plugins.config.invalidSelect")
      : (fieldIssue(field, value) ?? tr("plugins.config.invalidOther"))
  return `${first} ${fix}`
}

/** The question about linked accounts, while it's open. */
type Question = {
  open: boolean
  fields: PluginConfigField[]
  /** Null when the server couldn't say what is linked. */
  impact: PluginImpact | null
  answer: (links: LinksAnswer) => void
}

/**
 * A plugin's settings, made from the fields it declares. Required ones
 * that are empty, and saved ones this version no longer takes, are why a
 * plugin waits in "needs settings".
 *
 * Saving a change to a setting that decides who a sign-in belongs to,
 * while accounts are linked through the plugin, first asks what happens
 * to the links. The save bar shows the save as going on until it's
 * answered; cancel leaves the edits in place, unsaved.
 */
export function PluginConfigForm({ plugin }: { plugin: PluginInfo }) {
  const saved = usePluginSaved()
  const queryClient = useQueryClient()
  const setConfigDirty = usePluginsPanel((state) => state.setConfigDirty)
  const [question, setQuestion] = useState<Question | null>(null)
  const initial = draftFrom(plugin)
  const { fields } = plugin.config
  const save = useMutation({
    mutationFn: (input: {
      values: PluginConfigValues
      links?: "keep" | "remove"
    }) => client.admin.plugins.configure({ id: plugin.id, ...input }),
  })
  /** Whether to save, and what happens to the links when it's asked. */
  const askAboutLinks = async (
    values: PluginConfigValues,
  ): Promise<LinksAnswer | undefined> => {
    const moved = movedIdentity(plugin, values)
    if (moved.length === 0) return undefined
    // Asked fresh: someone may have linked since the page asked last.
    const impact = await queryClient
      .fetchQuery({ ...impactOptions(plugin.id), staleTime: 0 })
      .catch(() => null)
    if (impact && impact.linkedAccounts === 0) return undefined
    return new Promise<LinksAnswer>((resolve) =>
      setQuestion({
        open: true,
        fields: moved,
        impact,
        answer: (links) => {
          // Closes, and keeps its content while it fades out.
          setQuestion((current) => current && { ...current, open: false })
          resolve(links)
        },
      }),
    )
  }
  // Until the first edit, the form follows the plugin, so a change from
  // elsewhere shows through.
  const form = useAppForm({
    defaultValues: initial,
    // The page's back button asks before it drops edits.
    listeners: {
      onChange: ({ formApi }) =>
        setConfigDirty(!sameDraft(formApi.state.values, initial)),
    },
    onSubmit: async ({ value, formApi }) => {
      const issue = fields
        .map((field) => ({
          field,
          issue: fieldIssue(field, value.text[field.key] ?? ""),
        }))
        .find((item) => item.issue)
      if (issue?.issue) {
        throw new Error(
          tr("plugins.config.checkField", {
            field: issue.field.label,
            issue: issue.issue,
          }),
        )
      }
      const values = changes(fields, value, initial)
      const links = await askAboutLinks(values)
      if (links === "cancel") return
      const next = await save.mutateAsync({ values, links })
      if (links === "remove") {
        void queryClient.invalidateQueries({
          queryKey: impactOptions(plugin.id).queryKey,
        })
      }
      saved(next)
      formApi.reset(draftFrom(next))
      setConfigDirty(false)
    },
  })
  const dirty = useSelector(
    form.store,
    (state) => state.isTouched && !sameDraft(state.values, initial),
  )
  // Saved values this version doesn't take, until the admin edits them.
  const staleKeys = useSelector(form.store, (state) =>
    fields
      .filter(
        (field) =>
          plugin.config.invalid.includes(field.key) &&
          (field.type === "boolean"
            ? state.values.toggles[field.key] === initial.toggles[field.key]
            : (state.values.text[field.key] ?? "") ===
              (initial.text[field.key] ?? "")),
      )
      .map((field) => field.key)
      .join("\n"),
  ).split("\n")

  return (
    <form className="contents" onSubmit={(event) => event.preventDefault()}>
      <SettingRows>
        {fields.map((field) => (
          <ConfigRow
            key={field.key}
            field={field}
            plugin={plugin}
            stale={
              staleKeys.includes(field.key)
                ? staleMessage(plugin, field)
                : undefined
            }
          >
            {(ids) =>
              field.type === "boolean" ? (
                <form.Field name={`toggles.${field.key}`}>
                  {(control) => (
                    <Switch
                      id={ids.controlId}
                      aria-labelledby={ids.labelId}
                      aria-describedby={ids.describedBy}
                      aria-invalid={ids.stale || undefined}
                      checked={control.state.value ?? false}
                      onCheckedChange={(checked) =>
                        control.handleChange(checked)
                      }
                    />
                  )}
                </form.Field>
              ) : field.type === "select" ? (
                <form.Field name={`text.${field.key}`}>
                  {(control) => (
                    <SelectControl
                      id={ids.controlId}
                      describedBy={ids.describedBy}
                      stale={ids.stale}
                      field={field}
                      value={control.state.value ?? ""}
                      onChange={(value) => control.handleChange(value)}
                    />
                  )}
                </form.Field>
              ) : field.type === "secret" ? (
                <form.Field name={`text.${field.key}`}>
                  {(text) => (
                    <form.Field name={`clear.${field.key}`}>
                      {(clear) => (
                        <SecretControl
                          id={ids.controlId}
                          describedBy={ids.describedBy}
                          stale={ids.stale}
                          saved={
                            plugin.config.secretsSet.includes(field.key) &&
                            !plugin.config.environment.includes(field.key)
                          }
                          fromEnvironment={plugin.config.environment.includes(
                            field.key,
                          )}
                          label={field.label}
                          text={text.state.value ?? ""}
                          clear={clear.state.value ?? false}
                          onText={(value) => {
                            text.handleChange(value)
                            if (value) clear.handleChange(false)
                          }}
                          onClear={(value) => clear.handleChange(value)}
                        />
                      )}
                    </form.Field>
                  )}
                </form.Field>
              ) : (
                <form.Field
                  name={`text.${field.key}`}
                  validators={{
                    onChange: ({ value }) => fieldIssue(field, value ?? ""),
                  }}
                >
                  {(control) => {
                    const issue = control.state.meta.errors.find(Boolean)
                    return (
                      <div className="flex w-full flex-col gap-1.5">
                        <Input
                          id={ids.controlId}
                          aria-describedby={ids.describedBy}
                          aria-invalid={issue || ids.stale ? true : undefined}
                          value={control.state.value ?? ""}
                          placeholder={placeholderOf(plugin, field)}
                          type={field.type === "url" ? "url" : "text"}
                          inputMode={
                            field.type === "number"
                              ? "decimal"
                              : field.type === "url"
                                ? "url"
                                : undefined
                          }
                          autoComplete="off"
                          spellCheck={false}
                          onChange={(event) =>
                            control.handleChange(event.target.value)
                          }
                        />
                        {issue && (
                          <p role="alert" className="text-destructive text-xs">
                            {issue}
                          </p>
                        )}
                      </div>
                    )
                  }}
                </form.Field>
              )
            }
          </ConfigRow>
        ))}
      </SettingRows>
      <SettingsSaveBar
        dirty={dirty}
        onReset={() => {
          form.reset()
          setConfigDirty(false)
        }}
        onSave={() => form.handleSubmit()}
      />
      {question && (
        <LinksDialog
          plugin={plugin}
          open={question.open}
          settings={question.fields.map((field) => field.label)}
          impact={question.impact}
          onAnswer={question.answer}
        />
      )}
    </form>
  )
}

/** What an empty field falls back to, as its placeholder. */
function placeholderOf(
  plugin: PluginInfo,
  field: PluginConfigField,
): string | undefined {
  if (plugin.config.environment.includes(field.key)) {
    return tr("plugins.config.fromEnvironment")
  }
  if (field.type === "boolean" || field.default === undefined) {
    return field.type === "url" ? "https://" : undefined
  }
  return String(field.default)
}

type RowIds = {
  controlId: string
  labelId: string
  noteId: string
  /** The notes, and why a saved value doesn't fit, for `aria-describedby`. */
  describedBy: string
  /** The saved value doesn't fit this version and wasn't changed yet. */
  stale: boolean
}

/**
 * A setting row as `SettingRow` lays one out, for a label a plugin wrote:
 * it can run long, so it wraps anywhere, and the field's own description
 * and where its value comes from sit under it. A saved value this version
 * doesn't take says so under the control.
 */
function ConfigRow({
  field,
  plugin,
  stale,
  children,
}: {
  field: PluginConfigField
  plugin: PluginInfo
  /** Why the saved value doesn't fit, while it's still the saved one. */
  stale?: string
  children: (ids: RowIds) => ReactNode
}) {
  const id = useId()
  const ids = {
    controlId: `${id}-control`,
    labelId: `${id}-label`,
    noteId: `${id}-note`,
    describedBy: stale ? `${id}-note ${id}-stale` : `${id}-note`,
    stale: stale !== undefined,
  }
  const inline = field.type === "boolean"
  const fromEnvironment = plugin.config.environment.includes(field.key)
  const notes = [
    field.description,
    fromEnvironment ? tr("plugins.config.environmentNote") : undefined,
    field.type === "url" && field.network
      ? tr("plugins.config.networkNote")
      : undefined,
  ].filter(Boolean)
  return (
    <div className="@container flex flex-col gap-2.5 px-4 py-3">
      <div
        className={cn(
          "flex gap-x-6 gap-y-2.5",
          inline
            ? "items-center justify-between"
            : "flex-col @lg:flex-row @lg:items-start @lg:justify-between",
        )}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 @lg:pt-2">
          <label
            id={ids.labelId}
            htmlFor={ids.controlId}
            className="text-sm font-medium wrap-anywhere"
          >
            {field.label}
            {field.required && (
              <span className="text-muted-foreground font-normal">
                {" "}
                {tr("plugins.config.required")}
              </span>
            )}
          </label>
          {notes.length > 0 && (
            <div id={ids.noteId} className="wrap-anywhere">
              {notes.map((note) => (
                <SettingNote key={note}>{note}</SettingNote>
              ))}
            </div>
          )}
        </div>
        <div
          className={cn(
            "flex shrink-0 gap-2",
            inline ? "items-center" : "w-full flex-col gap-1.5 @lg:w-80",
          )}
        >
          {children(ids)}
          {stale && (
            <p id={`${id}-stale`} className="text-destructive text-xs">
              {stale}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function SelectControl({
  id,
  describedBy,
  stale,
  field,
  value,
  onChange,
}: {
  id: string
  describedBy: string
  stale: boolean
  field: Extract<PluginConfigField, { type: "select" }>
  value: string
  onChange: (value: string) => void
}) {
  const fallback = field.default ?? ""
  const items = [
    ...(fallback ? [] : [{ value: "", label: tr("plugins.config.notSet") }]),
    ...field.options,
  ]
  return (
    <Select
      items={items}
      value={value || fallback}
      onValueChange={(next) => onChange(next ?? "")}
    >
      <SelectTrigger
        id={id}
        aria-describedby={describedBy}
        aria-invalid={stale || undefined}
        className="w-full min-w-0"
      >
        <SelectValue className="truncate" />
      </SelectTrigger>
      <SelectContent>
        {items.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            <span className="wrap-anywhere">{option.label}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/**
 * A secret: never shown, only said to be there. Typing replaces it, and
 * the button drops it, or puts it back before the save.
 */
function SecretControl({
  id,
  describedBy,
  stale,
  saved,
  fromEnvironment,
  label,
  text,
  clear,
  onText,
  onClear,
}: {
  id: string
  describedBy: string
  stale: boolean
  /** A value is saved here, which overrides the environment's. */
  saved: boolean
  /** No value is saved, and the server's environment has one. */
  fromEnvironment: boolean
  label: string
  text: string
  clear: boolean
  onText: (text: string) => void
  onClear: (clear: boolean) => void
}) {
  const placeholder =
    saved && !clear
      ? tr("plugins.config.secretSaved")
      : fromEnvironment
        ? tr("plugins.config.fromEnvironment")
        : tr("plugins.config.secretNone")
  const removable = saved && !text
  const removeLabel = clear
    ? tr("plugins.config.secretKeep")
    : tr("plugins.config.secretRemove", { field: label })
  return (
    <div className="flex w-full flex-col gap-1.5">
      <div className="relative w-full">
        <Input
          id={id}
          aria-describedby={describedBy}
          aria-invalid={stale || undefined}
          type="password"
          autoComplete="new-password"
          spellCheck={false}
          value={text}
          placeholder={placeholder}
          className={cn(removable && "pr-11")}
          onChange={(event) => onText(event.target.value)}
        />
        {removable && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={removeLabel}
            title={removeLabel}
            className={cn(
              "absolute top-1/2 right-1 -translate-y-1/2",
              !clear && "text-destructive hover:text-destructive",
            )}
            onClick={() => onClear(!clear)}
          >
            {clear ? <Undo2Icon /> : <Trash2Icon />}
          </Button>
        )}
      </div>
      {clear && <SettingNote>{tr("plugins.config.secretRemoved")}</SettingNote>}
    </div>
  )
}
