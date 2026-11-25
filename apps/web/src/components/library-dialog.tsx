import {
  type Library,
  LIBRARY_KINDS,
  type LibraryKind,
  LibraryInput,
  type MetadataLanguageChoice,
  type MetadataProvider,
  type MetadataProviderId,
} from "@matinee/contracts"
import { useMutation, useQuery, useQueryClient } from "@tanstack/solid-query"
import { Folder, FolderPlus, X } from "lucide"
import { createMemo, createSignal, For, Show } from "solid-js"

import { getLocale, tr, translateKnown } from "@/i18n"
import { Button } from "@/kit/button"
import { Dialog } from "@/kit/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/kit/field"
import { Icon } from "@/kit/icon"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/kit/select"
import { toast } from "@/kit/toast"
import { createForm } from "@/lib/form"
import { SubmitButton, TextField } from "@/lib/form-fields"
import { baseLanguage, languageName } from "@/lib/languages"
import { client, errorMessage, orpc } from "@/lib/rpc"

import { FolderPicker } from "./folder-browser"
import {
  FormColumn,
  FormColumns,
  FormDialogBody,
  FormDialogContent,
  FormDialogFooter,
  FormDialogForm,
  FormDialogHeader,
} from "./settings/form-dialog"
import { RichSelectItem } from "./settings/select-item-content"

type ProviderChoice = MetadataProviderId | "none"

type LibraryValues = {
  name: string
  kind: LibraryKind
  paths: string[]
  /** Null until the admin picks one; until then the default for the kind. */
  provider: ProviderChoice | null
  /** Null until the admin picks one; until then `startLanguage`'s. */
  language: string | null
}

function initialValues(library: Library | undefined): LibraryValues {
  return {
    name: library?.name ?? "",
    kind: library?.kind ?? "movies",
    paths: library ? [...library.paths] : [],
    provider: library ? (library.metadataProvider ?? "none") : null,
    language: library?.metadataLanguage ?? null,
  }
}

/**
 * Where a new library's language starts: the server's choice in the
 * interface's language, else its first.
 */
function startLanguage(choices: MetadataLanguageChoice[]): string {
  const locale = getLocale()
  const base = baseLanguage(locale)
  const match =
    choices.find((choice) => choice.nameTag === locale) ??
    choices.find((choice) => baseLanguage(choice.code) === base) ??
    choices[0]
  return match?.code ?? ""
}

/** TheTVDB for shows and TMDB for movies, when the server has the key. */
function defaultProvider(
  kind: LibraryKind,
  providers: MetadataProvider[],
): ProviderChoice {
  const order: MetadataProviderId[] =
    kind === "shows" ? ["tvdb", "tmdb"] : ["tmdb", "tvdb"]
  return (
    order.find((id) => providers.find((p) => p.id === id)?.configured) ?? "none"
  )
}

function parentFolder(path: string): string {
  const parent = path.replace(/\/+$/, "").replace(/\/[^/]*$/, "")
  return parent || "/"
}

export function LibraryDialog(props: {
  library?: Library
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  // The form starts from the library once, so another library builds another.
  const editing = createMemo(() => ({ library: props.library }))
  return (
    <Dialog open={props.open} onOpenChange={(open) => props.onOpenChange(open)}>
      <FormDialogContent width="lg">
        <Show when={editing()} keyed>
          {(entry) => (
            <LibraryForm
              library={entry.library}
              onDone={() => props.onOpenChange(false)}
            />
          )}
        </Show>
      </FormDialogContent>
    </Dialog>
  )
}

function LibraryForm(props: { library?: Library; onDone: () => void }) {
  const queryClient = useQueryClient()
  const libraries = useQuery(() => orpc.libraries.list.queryOptions())
  const providers = useQuery(() => orpc.metadata.providers.queryOptions())
  const languages = useQuery(() => orpc.metadata.languages.queryOptions())
  const providerList = () => (providers.isSuccess ? providers.data : [])
  const choices = () => (languages.isSuccess ? languages.data : [])

  // The callbacks run outside tracking, so the options read the library.
  const save = useMutation(() => {
    const id = props.library?.id
    const done = props.onDone
    return {
      mutationFn: (input: LibraryInput) =>
        id
          ? client.libraries.update({ ...input, id })
          : client.libraries.create(input),
      // The dialog closing and the library list (which shows the new scan) are
      // the confirmation.
      onSuccess: async () => {
        await queryClient.invalidateQueries({ queryKey: orpc.libraries.key() })
        done()
      },
      onError: (error: Error) => toast.error(errorMessage(error)),
    }
  })

  /** What the form saves, with the provider it shows when none was picked. */
  const toInput = (value: LibraryValues) => {
    const provider =
      value.provider ?? defaultProvider(value.kind, providerList())
    return {
      name: value.name,
      kind: value.kind,
      paths: value.paths,
      metadataProvider: provider === "none" ? null : provider,
      metadataLanguage: value.language ?? startLanguage(choices()),
    }
  }

  const form = createForm<LibraryValues>({
    defaultValues: initialValues(props.library),
    onSubmit: (value) => {
      // One message for the whole form, in a toast.
      const parsed = LibraryInput.safeParse(toInput(value))
      if (!parsed.success) {
        const message = parsed.error.issues.find(
          (issue) => issue.message,
        )?.message
        toast.error(
          message === undefined
            ? tr("libraries.dialog.checkFields")
            : translateKnown(message),
        )
        return
      }
      save.mutate(parsed.data)
    },
  })
  const values = () => form.values()

  const language = () => values().language ?? startLanguage(choices())
  const provider = () =>
    values().provider ?? defaultProvider(values().kind, providerList())
  const providerInfo = () => providerList().find((p) => p.id === provider())
  const providerItems = () => [
    { value: "none", label: tr("libraries.dialog.noProvider") },
    ...providerList().map((p) => ({ value: p.id, label: p.name })),
  ]
  const kinds = LIBRARY_KINDS.map((value) => ({
    value,
    label: tr(`libraries.dialog.kind.${value}`),
  }))
  // A library saved with a language the server no longer offers keeps it.
  const languageItems = () => {
    const current = language()
    const list =
      choices().some((choice) => choice.code === current) || !current
        ? choices()
        : [...choices(), { code: current, nameTag: current }]
    return list.map((choice) => ({
      value: choice.code,
      label: languageName(choice.nameTag),
    }))
  }
  // Media usually sits beside the folders other libraries already use.
  const startFolder = () => {
    const known =
      props.library?.paths[0] ??
      (libraries.isSuccess ? libraries.data[0]?.paths[0] : undefined)
    return known ? parentFolder(known) : undefined
  }
  const pickFrom = () => {
    const last = values().paths.at(-1)
    // Beside the folder added last, when there is one.
    return last ? parentFolder(last) : startFolder()
  }

  const [picking, setPicking] = createSignal(false)

  return (
    <FormDialogForm onSubmit={() => void form.submit()}>
      <FormDialogHeader
        title={
          props.library
            ? tr("libraries.dialog.editTitle")
            : tr("libraries.dialog.addTitle")
        }
      />

      <FormDialogBody>
        <FormColumns>
          <FormColumn>
            <FieldGroup>
              <div class="grid gap-4 sm:grid-cols-[1fr_10rem]">
                <TextField
                  form={form}
                  name="name"
                  id="library-name"
                  label={tr("libraries.dialog.name")}
                  placeholder={tr("libraries.dialog.namePlaceholder")}
                />
                <Field>
                  <FieldLabel for="library-type">
                    {tr("libraries.dialog.type")}
                  </FieldLabel>
                  <Select<LibraryKind>
                    items={kinds}
                    value={values().kind}
                    onValueChange={(next) => {
                      if (next) form.set("kind", next)
                    }}
                  >
                    <SelectTrigger id="library-type" class="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <For each={kinds}>
                        {(option) => (
                          <SelectItem<LibraryKind> value={option.value}>
                            {option.label}
                          </SelectItem>
                        )}
                      </For>
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <div class="grid gap-4 sm:grid-cols-[1fr_10rem]">
                <Field>
                  <FieldLabel for="library-provider">
                    {tr("libraries.dialog.metadata")}
                  </FieldLabel>
                  <Select
                    items={providerItems()}
                    value={provider()}
                    onValueChange={(next) => {
                      const picked =
                        next === "none"
                          ? "none"
                          : providerList().find((p) => p.id === next)?.id
                      if (picked) form.set("provider", picked)
                    }}
                  >
                    <SelectTrigger id="library-provider" class="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">
                        {tr("libraries.dialog.noProvider")}
                      </SelectItem>
                      <For each={providerList()}>
                        {(p) => (
                          <RichSelectItem
                            value={p.id}
                            label={p.name}
                            disabled={!p.configured}
                          >
                            <>
                              {p.name}
                              <Show when={!p.configured}>
                                <span class="text-muted-foreground">
                                  {tr("libraries.dialog.needsKey")}
                                </span>
                              </Show>
                            </>
                          </RichSelectItem>
                        )}
                      </For>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel for="library-language">
                    {tr("libraries.dialog.language")}
                  </FieldLabel>
                  <Select
                    items={languageItems()}
                    value={language()}
                    disabled={provider() === "none" || !language()}
                    onValueChange={(next) => {
                      if (next) form.set("language", next)
                    }}
                  >
                    <SelectTrigger id="library-language" class="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <For each={languageItems()}>
                        {(item) => (
                          <SelectItem value={item.value}>
                            {item.label}
                          </SelectItem>
                        )}
                      </For>
                    </SelectContent>
                  </Select>
                </Field>
                <FieldDescription class="-mt-2 sm:col-span-2">
                  {provider() === "none"
                    ? tr("libraries.dialog.noProviderHint")
                    : providerInfo() &&
                      translateKnown(providerInfo()?.description ?? "")}
                </FieldDescription>
              </div>
            </FieldGroup>
          </FormColumn>

          <FormColumn>
            <Field>
              <div class="flex items-baseline justify-between">
                <FieldLabel>{tr("libraries.dialog.folders")}</FieldLabel>
                <Show when={values().paths.length > 0}>
                  <span class="text-muted-foreground text-xs tabular-nums">
                    {tr("libraries.dialog.selected", {
                      count: values().paths.length,
                    })}
                  </span>
                </Show>
              </div>
              <Show
                when={values().paths.length > 0}
                fallback={
                  <p class="text-muted-foreground text-sm">
                    {tr("libraries.dialog.noFolders")}
                  </p>
                }
              >
                <ul class="flex flex-col gap-1">
                  <For each={values().paths}>
                    {(path) => (
                      <li class="bg-muted/60 flex h-9 items-center gap-2.5 rounded-md pr-1 pl-2.5">
                        <Icon
                          icon={Folder}
                          class="text-muted-foreground size-4 shrink-0"
                        />
                        <span
                          class="text-13px min-w-0 flex-1 truncate font-mono"
                          title={path}
                        >
                          {path}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={tr("libraries.dialog.removeFolder", {
                            path,
                          })}
                          onClick={() =>
                            form.set(
                              "paths",
                              values().paths.filter((p) => p !== path),
                            )
                          }
                        >
                          <Icon icon={X} />
                        </Button>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
              <Button
                type="button"
                variant="outline"
                class="self-start"
                onClick={() => setPicking(true)}
              >
                <Icon icon={FolderPlus} />
                {tr("libraries.dialog.addFolder")}
              </Button>
            </Field>

            <FolderPicker
              open={picking()}
              onOpenChange={setPicking}
              initialPath={pickFrom()}
              picked={[...values().paths]}
              onPick={(path) => form.set("paths", [...values().paths, path])}
            />
          </FormColumn>
        </FormColumns>
      </FormDialogBody>

      <FormDialogFooter>
        <SubmitButton
          form={form}
          disabled={!values().name.trim() || values().paths.length === 0}
          pending={save.isPending}
        >
          {props.library
            ? tr("libraries.dialog.save")
            : tr("libraries.dialog.add")}
        </SubmitButton>
      </FormDialogFooter>
    </FormDialogForm>
  )
}
