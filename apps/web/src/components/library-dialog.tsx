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
  DialogDescription,
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
import { Input } from "@matinee/ui/components/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@matinee/ui/components/select"
import { toast } from "@matinee/ui/components/sonner"
import { Spinner } from "@matinee/ui/components/spinner"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { FolderIcon, XIcon } from "lucide-react"
import { useState } from "react"

import { client, errorMessage, orpc } from "@/lib/rpc"

import { FolderBrowser } from "./folder-browser"
import { FormAlert } from "./form-alert"

const kinds: { value: LibraryKind; label: string }[] = [
  { value: "movies", label: "Movies" },
  { value: "shows", label: "Shows" },
  { value: "other", label: "Other videos" },
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
  const [name, setName] = useState(library?.name ?? "")
  const [kind, setKind] = useState<LibraryKind>(library?.kind ?? "movies")
  const [paths, setPaths] = useState<string[]>(library?.paths ?? [])
  const [validation, setValidation] = useState<string | null>(null)
  const libraries = useQuery(orpc.libraries.list.queryOptions())
  const providers = useQuery(orpc.metadata.providers.queryOptions())
  // Null until the admin picks one; until then the default for the kind.
  const [providerChoice, setProvider] = useState<ProviderChoice | null>(
    library ? (library.metadataProvider ?? "none") : null,
  )
  const [language, setLanguage] = useState(library?.metadataLanguage ?? "en-US")
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

  const save = useMutation({
    mutationFn: (input: LibraryInput) =>
      library
        ? client.libraries.update({ ...input, id: library.id })
        : client.libraries.create(input),
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: orpc.libraries.key() })
      toast.success(
        library
          ? `Saved ${saved.name}`
          : `Added ${saved.name}. Scanning its folders now.`,
      )
      onDone()
    },
  })

  const submit = () => {
    const parsed = LibraryInput.safeParse({
      name,
      kind,
      paths,
      metadataProvider:
        kind === "other" || provider === "none" ? null : provider,
      metadataLanguage: language,
    })
    if (!parsed.success) {
      setValidation(parsed.error.issues[0]?.message ?? "Check the fields.")
      return
    }
    setValidation(null)
    save.mutate(parsed.data)
  }

  const error = validation ?? (save.error ? errorMessage(save.error) : null)

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
      className="flex flex-col gap-6"
    >
      <DialogHeader>
        <DialogTitle className="text-lg leading-7 font-semibold">
          {library ? "Edit library" : "Add library"}
        </DialogTitle>
        <DialogDescription>
          Matinee lists every video file in the selected folders and their
          subfolders.
        </DialogDescription>
      </DialogHeader>

      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
          <Field>
            <FieldLabel htmlFor="library-name">Name</FieldLabel>
            <Input
              id="library-name"
              value={name}
              placeholder="e.g. Movies"
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="library-type">Type</FieldLabel>
            <Select
              items={kinds}
              value={kind}
              onValueChange={(value) => value && setKind(value)}
            >
              <SelectTrigger id="library-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {kinds.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        {kind !== "other" && (
          <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
            <Field>
              <FieldLabel htmlFor="library-provider">Metadata</FieldLabel>
              <Select
                items={providerItems}
                value={provider}
                onValueChange={(value) => value && setProvider(value)}
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
            <Field>
              <FieldLabel htmlFor="library-language">Language</FieldLabel>
              <Select
                items={languageItems}
                value={language}
                disabled={provider === "none"}
                onValueChange={(value) => value && setLanguage(value)}
              >
                <SelectTrigger id="library-language" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {languageItems.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <FieldDescription className="-mt-2 sm:col-span-2">
              {provider === "none"
                ? "Titles keep the names of their folders and files, with no posters or descriptions."
                : providerInfo?.description}
              {provider === "none" &&
                providers.data?.some((p) => !p.configured) && (
                  <>
                    {" "}
                    {providers.data
                      .filter((p) => !p.configured)
                      .map((p) => p.setup)
                      .join(" ")}
                  </>
                )}
            </FieldDescription>
          </div>
        )}

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
                    onClick={() => setPaths(paths.filter((p) => p !== path))}
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
            onPick={(path) => setPaths([...paths, path])}
          />
        </Field>
      </FieldGroup>

      {error && <FormAlert message={error} />}

      <DialogFooter className="-mx-6 -mb-6 px-6 py-4">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={save.isPending || !name.trim() || paths.length === 0}
        >
          {save.isPending && <Spinner />}
          {library ? "Save" : "Add library"}
        </Button>
      </DialogFooter>
    </form>
  )
}
