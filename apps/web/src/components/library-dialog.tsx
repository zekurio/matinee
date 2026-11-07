import {
  type Library,
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
import { useSelector } from "@tanstack/react-form"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { FolderIcon, XIcon } from "lucide-react"

import { firstError, useAppForm } from "@/lib/form"
import { client, errorMessage, orpc } from "@/lib/rpc"

import { FolderBrowser } from "./folder-browser"
import { FormAlert } from "./form-alert"
import { SelectField } from "./select-field"

const kinds: { value: LibraryKind; label: string }[] = [
  { value: "movies", label: "Movies" },
  { value: "shows", label: "Shows" },
]

// Languages every provider has a fair amount of data in.
const languages = [
  { value: "en-US", label: "English" },
  { value: "de-DE", label: "German" },
  { value: "fr-FR", label: "French" },
  { value: "es-ES", label: "Spanish" },
  { value: "it-IT", label: "Italian" },
  { value: "pt-BR", label: "Portuguese (Brazil)" },
  { value: "nl-NL", label: "Dutch" },
  { value: "pl-PL", label: "Polish" },
  { value: "sv-SE", label: "Swedish" },
  { value: "ja-JP", label: "Japanese" },
  { value: "ko-KR", label: "Korean" },
  { value: "zh-CN", label: "Chinese" },
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
      // One message for the whole form, above the buttons.
      onSubmit: ({ value }) => {
        const parsed = LibraryInput.safeParse(toInput(value))
        if (parsed.success) return undefined
        return {
          message: parsed.error.issues[0]?.message ?? "Check the fields.",
        }
      },
    },
    onSubmit: ({ value }) => save.mutate(LibraryInput.parse(toInput(value))),
  })

  const kind = useSelector(form.store, (state) => state.values.kind)
  const providerChoice = useSelector(
    form.store,
    (state) => state.values.provider,
  )
  const language = useSelector(form.store, (state) => state.values.language)
  const validation = useSelector(form.store, (state) =>
    firstError(state.errors),
  )

  const provider = providerChoice ?? defaultProvider(kind, providers.data ?? [])
  const providerInfo = providers.data?.find((p) => p.id === provider)
  const providerItems = [
    { value: "none", label: "None" },
    ...(providers.data ?? []).map((p) => ({ value: p.id, label: p.name })),
  ]
  const languageItems = languages.some((l) => l.value === language)
    ? languages
    : [...languages, { value: language, label: language }]
  // Media usually sits beside the folders other libraries already use.
  const known = library?.paths[0] ?? libraries.data?.[0]?.paths[0]
  const startFolder = known ? parentFolder(known) : undefined

  const error = validation ?? (save.error ? errorMessage(save.error) : null)

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
            {library ? "Edit library" : "Add library"}
          </DialogTitle>
        </DialogHeader>

        <FieldGroup>
          <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
            <form.AppField name="name">
              {(field) => (
                <field.TextField
                  id="library-name"
                  label="Name"
                  placeholder="e.g. Movies"
                />
              )}
            </form.AppField>
            <form.AppField name="kind">
              {() => (
                <SelectField id="library-type" label="Type" items={kinds} />
              )}
            </form.AppField>
          </div>

          <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
            <form.Field name="provider">
              {(field) => (
                <Field>
                  <FieldLabel htmlFor="library-provider">Metadata</FieldLabel>
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
                      <SelectItem value="none">None</SelectItem>
                      {providers.data?.map((p) => (
                        <SelectItem
                          key={p.id}
                          value={p.id}
                          disabled={!p.configured}
                        >
                          {p.name}
                          {!p.configured && (
                            <span className="text-muted-foreground">
                              Needs an API key
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
                  label="Language"
                  items={languageItems}
                  disabled={provider === "none"}
                />
              )}
            </form.AppField>
            <FieldDescription className="-mt-2 sm:col-span-2">
              {provider === "none"
                ? "Titles use their folder and file names, with no artwork."
                : providerInfo?.description}
            </FieldDescription>
          </div>

          <form.Field name="paths">
            {(field) => {
              const paths = field.state.value
              return (
                <>
                  <Field>
                    <div className="flex items-baseline justify-between">
                      <FieldLabel>Selected folders</FieldLabel>
                      {paths.length > 0 && (
                        <span className="text-muted-foreground text-xs tabular-nums">
                          {paths.length} selected
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
                              aria-label={`Remove ${path}`}
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
                      <p className="text-muted-foreground rounded-md border border-dashed px-3 py-2.5 text-sm">
                        Open a folder below, then add it.
                      </p>
                    )}
                  </Field>

                  <Field>
                    <FieldLabel>Browse server</FieldLabel>
                    <FolderBrowser
                      initialPath={startFolder}
                      picked={paths}
                      onPick={(path) => field.handleChange([...paths, path])}
                    />
                  </Field>
                </>
              )
            }}
          </form.Field>
        </FieldGroup>

        {error && <FormAlert message={error} />}

        <DialogFooter className="-mx-6 -mb-6 px-6 py-4">
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <form.Subscribe
            selector={(state) =>
              !state.values.name.trim() || state.values.paths.length === 0
            }
          >
            {(incomplete) => (
              <form.SubmitButton disabled={incomplete} pending={save.isPending}>
                {library ? "Save" : "Add library"}
              </form.SubmitButton>
            )}
          </form.Subscribe>
        </DialogFooter>
      </form>
    </form.AppForm>
  )
}
