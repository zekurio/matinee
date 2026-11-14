import {
  type Library,
  LIBRARY_KINDS,
  type LibraryKind,
  LibraryInput,
  type MetadataProvider,
  type MetadataProviderId,
} from "@matinee/contracts"
import { Button } from "@matinee/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@matinee/ui/components/dialog"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@matinee/ui/components/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@matinee/ui/components/select"
import { toast } from "@matinee/ui/components/sonner"
import { useSelector } from "@tanstack/react-form"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { FolderIcon, FolderPlusIcon, XIcon } from "lucide-react"
import { useState } from "react"

import { tr, translateKnown } from "@/i18n"
import { firstError, useAppForm } from "@/lib/form"
import { languageName } from "@/lib/languages"
import { client, errorMessage, orpc } from "@/lib/rpc"

import { FolderPicker } from "./folder-browser"
import { SelectField } from "./select-field"

// Languages every provider has a fair amount of data in, with the tag
// their name comes from: the region only where it matters.
const languages = [
  { value: "en-US", tag: "en" },
  { value: "de-DE", tag: "de" },
  { value: "fr-FR", tag: "fr" },
  { value: "es-ES", tag: "es" },
  { value: "it-IT", tag: "it" },
  { value: "pt-BR", tag: "pt-BR" },
  { value: "nl-NL", tag: "nl" },
  { value: "pl-PL", tag: "pl" },
  { value: "sv-SE", tag: "sv" },
  { value: "ja-JP", tag: "ja" },
  { value: "ko-KR", tag: "ko" },
  { value: "zh-CN", tag: "zh" },
]

type ProviderChoice = MetadataProviderId | "none"

type LibraryValues = {
  name: string
  kind: LibraryKind
  paths: string[]
  /** Null until the admin picks one; until then the default for the kind. */
  provider: ProviderChoice | null
  language: string
}

function initialValues(library: Library | undefined): LibraryValues {
  return {
    name: library?.name ?? "",
    kind: library?.kind ?? "movies",
    paths: library?.paths ?? [],
    provider: library ? (library.metadataProvider ?? "none") : null,
    language: library?.metadataLanguage ?? "en-US",
  }
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

export function LibraryDialog({
  library,
  open,
  onOpenChange,
}: {
  library?: Library
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-5 p-6 sm:max-w-lg [&_[data-slot=dialog-close]]:top-4 [&_[data-slot=dialog-close]]:right-4">
        {open && (
          <LibraryForm library={library} onDone={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function LibraryForm({
  library,
  onDone,
}: {
  library?: Library
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const libraries = useQuery(orpc.libraries.list.queryOptions())
  const providers = useQuery(orpc.metadata.providers.queryOptions())

  const save = useMutation({
    mutationFn: (input: LibraryInput) =>
      library
        ? client.libraries.update({ ...input, id: library.id })
        : client.libraries.create(input),
    // The dialog closing and the library list (which shows the new scan) are
    // the confirmation.
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: orpc.libraries.key() })
      onDone()
    },
    onError: (error) => toast.error(errorMessage(error)),
  })

  /** What the form saves, with the provider it shows when none was picked. */
  const toInput = (value: LibraryValues) => {
    const provider =
      value.provider ?? defaultProvider(value.kind, providers.data ?? [])
    return {
      name: value.name,
      kind: value.kind,
      paths: value.paths,
      metadataProvider: provider === "none" ? null : provider,
      metadataLanguage: value.language,
    }
  }

  const form = useAppForm({
    defaultValues: initialValues(library),
    validators: {
      // One message for the whole form, in a toast.
      onSubmit: ({ value }) => {
        const parsed = LibraryInput.safeParse(toInput(value))
        if (parsed.success) return undefined
        return {
          message:
            firstError(parsed.error.issues) ??
            tr("libraries.dialog.checkFields"),
        }
      },
    },
    onSubmit: ({ value }) => save.mutate(LibraryInput.parse(toInput(value))),
    onSubmitInvalid: ({ formApi }) => {
      // Field errors show under their fields.
      const message = firstError(formApi.state.errors)
      if (message) toast.error(message)
    },
  })

  const kind = useSelector(form.store, (state) => state.values.kind)
  const providerChoice = useSelector(
    form.store,
    (state) => state.values.provider,
  )
  const language = useSelector(form.store, (state) => state.values.language)

  const provider = providerChoice ?? defaultProvider(kind, providers.data ?? [])
  const providerInfo = providers.data?.find((p) => p.id === provider)
  const providerItems = [
    { value: "none", label: tr("libraries.dialog.noProvider") },
    ...(providers.data ?? []).map((p) => ({ value: p.id, label: p.name })),
  ]
  const kinds = LIBRARY_KINDS.map((value) => ({
    value,
    label: tr(`libraries.dialog.kind.${value}`),
  }))
  const languageItems = (
    languages.some((l) => l.value === language)
      ? languages
      : [...languages, { value: language, tag: language }]
  ).map((l) => ({ value: l.value, label: languageName(l.tag) }))
  // Media usually sits beside the folders other libraries already use.
  const known = library?.paths[0] ?? libraries.data?.[0]?.paths[0]
  const startFolder = known ? parentFolder(known) : undefined

  const [picking, setPicking] = useState(false)

  return (
    <form.AppForm>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void form.handleSubmit()
        }}
        className="flex flex-col gap-6"
      >
        <DialogHeader>
          <DialogTitle className="text-lg leading-7 font-semibold">
            {library
              ? tr("libraries.dialog.editTitle")
              : tr("libraries.dialog.addTitle")}
          </DialogTitle>
        </DialogHeader>

        <FieldGroup>
          <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
            <form.AppField name="name">
              {(field) => (
                <field.TextField
                  id="library-name"
                  label={tr("libraries.dialog.name")}
                  placeholder={tr("libraries.dialog.namePlaceholder")}
                />
              )}
            </form.AppField>
            <form.AppField name="kind">
              {() => (
                <SelectField
                  id="library-type"
                  label={tr("libraries.dialog.type")}
                  items={kinds}
                />
              )}
            </form.AppField>
          </div>

          <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
            <form.Field name="provider">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor="library-provider">
                    {tr("libraries.dialog.metadata")}
                  </FieldLabel>
                  <Select
                    items={providerItems}
                    value={provider}
                    onValueChange={(value) =>
                      value && field.handleChange(value)
                    }
                  >
                    <SelectTrigger id="library-provider" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">
                        {tr("libraries.dialog.noProvider")}
                      </SelectItem>
                      {providers.data?.map((p) => (
                        <SelectItem
                          key={p.id}
                          value={p.id}
                          disabled={!p.configured}
                        >
                          {p.name}
                          {!p.configured && (
                            <span className="text-muted-foreground">
                              {tr("libraries.dialog.needsKey")}
                            </span>
                          )}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              )}
            </form.Field>
            <form.AppField name="language">
              {() => (
                <SelectField
                  id="library-language"
                  label={tr("libraries.dialog.language")}
                  items={languageItems}
                  disabled={provider === "none"}
                />
              )}
            </form.AppField>
            <FieldDescription className="-mt-2 sm:col-span-2">
              {provider === "none"
                ? tr("libraries.dialog.noProviderHint")
                : providerInfo && translateKnown(providerInfo.description)}
            </FieldDescription>
          </div>

          <form.Field name="paths">
            {(field) => {
              const paths = field.state.value
              const last = paths.at(-1)
              return (
                <>
                  <Field>
                    <div className="flex items-baseline justify-between">
                      <FieldLabel>{tr("libraries.dialog.folders")}</FieldLabel>
                      {paths.length > 0 && (
                        <span className="text-muted-foreground text-xs tabular-nums">
                          {tr("libraries.dialog.selected", {
                            count: paths.length,
                          })}
                        </span>
                      )}
                    </div>
                    {paths.length > 0 ? (
                      <ul className="flex flex-col gap-1">
                        {paths.map((path) => (
                          <li
                            key={path}
                            className="bg-muted/60 flex h-9 items-center gap-2.5 rounded-md pr-1 pl-2.5"
                          >
                            <FolderIcon className="text-muted-foreground size-4 shrink-0" />
                            <span
                              className="min-w-0 flex-1 truncate font-mono text-[13px]"
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
                                field.handleChange(
                                  paths.filter((p) => p !== path),
                                )
                              }
                            >
                              <XIcon />
                            </Button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-muted-foreground text-sm">
                        {tr("libraries.dialog.noFolders")}
                      </p>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      className="self-start"
                      onClick={() => setPicking(true)}
                    >
                      <FolderPlusIcon />
                      {tr("libraries.dialog.addFolder")}
                    </Button>
                  </Field>

                  <FolderPicker
                    open={picking}
                    onOpenChange={setPicking}
                    // Beside the folder added last, when there is one.
                    initialPath={last ? parentFolder(last) : startFolder}
                    picked={paths}
                    onPick={(path) => field.handleChange([...paths, path])}
                  />
                </>
              )
            }}
          </form.Field>
        </FieldGroup>

        <DialogFooter className="-mx-6 -mb-6 px-6 py-4">
          <form.Subscribe
            selector={(state) =>
              !state.values.name.trim() || state.values.paths.length === 0
            }
          >
            {(incomplete) => (
              <form.SubmitButton disabled={incomplete} pending={save.isPending}>
                {library
                  ? tr("libraries.dialog.save")
                  : tr("libraries.dialog.add")}
              </form.SubmitButton>
            )}
          </form.Subscribe>
        </DialogFooter>
      </form>
    </form.AppForm>
  )
}
