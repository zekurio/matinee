import { FIELD_CLASS_NAME } from "@matinee/ui/lib/field"
import { cn } from "@matinee/ui/lib/utils"
import { Save } from "lucide"
import { createSignal, For } from "solid-js"

import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteEmpty,
  AutocompleteGroup,
  AutocompleteGroupLabel,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
} from "@/kit/autocomplete"
import { Calendar } from "@/kit/calendar"
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
} from "@/kit/combobox"
import { FeedbackButton, type FeedbackState } from "@/kit/feedback-button"
import { Icon } from "@/kit/icon"

const GENRES = [
  { value: "action", label: "Action" },
  { value: "animation", label: "Animation" },
  { value: "comedy", label: "Comedy" },
  { value: "documentary", label: "Documentary" },
  { value: "drama", label: "Drama" },
  { value: "fantasy", label: "Fantasy" },
  { value: "horror", label: "Horror" },
  { value: "science-fiction", label: "Science Fiction" },
  { value: "thriller", label: "Thriller" },
]

const genreLabel = (value: string) =>
  GENRES.find((genre) => genre.value === value)?.label ?? value

const PLACES = [
  { label: "Movies", items: ["Akira", "Castle in the Sky", "Paprika"] },
  { label: "Shows", items: ["Cowboy Bebop", "Mushishi", "Planetes"] },
]

/** The pickers: combobox, autocomplete, calendar, and the feedback button. */
export function KitPickers() {
  const [genres, setGenres] = createSignal(["animation", "drama"])
  const [day, setDay] = createSignal<string | null>("2026-10-16")
  const [state, setState] = createSignal<FeedbackState>("idle")
  const save = (outcome: "success" | "error") => {
    setState("pending")
    setTimeout(() => {
      setState(outcome)
      setTimeout(() => setState("idle"), 1500)
    }, 1200)
  }
  return (
    <>
      <section class="flex flex-col gap-3">
        <h2 class="text-lg font-semibold">Combobox</h2>
        <div class="max-w-md">
          <Combobox
            multiple
            value={genres()}
            onValueChange={setGenres}
            itemToLabel={genreLabel}
          >
            <ComboboxChips>
              <For each={genres()}>
                {(genre) => (
                  <ComboboxChip value={genre} label={genreLabel(genre)} />
                )}
              </For>
              <ComboboxChipsInput
                aria-label="Genres"
                placeholder={genres().length ? undefined : "Pick genres"}
              />
            </ComboboxChips>
            <ComboboxContent>
              <ComboboxEmpty>No genres match.</ComboboxEmpty>
              <ComboboxList>
                <For each={GENRES}>
                  {(genre) => (
                    <ComboboxItem value={genre.value} label={genre.label}>
                      <span class="min-w-0 flex-1 truncate">{genre.label}</span>
                    </ComboboxItem>
                  )}
                </For>
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        </div>
      </section>

      <section class="flex flex-col gap-3">
        <h2 class="text-lg font-semibold">Autocomplete</h2>
        <div class="max-w-md">
          <Autocomplete>
            <AutocompleteInput
              aria-label="Search"
              placeholder="Search the library"
              class={cn(FIELD_CLASS_NAME, "h-9 w-full rounded-lg px-3 text-sm")}
            />
            <AutocompleteContent>
              <AutocompleteEmpty>Nothing matches.</AutocompleteEmpty>
              <AutocompleteList>
                <For each={PLACES}>
                  {(group) => (
                    <AutocompleteGroup>
                      <AutocompleteGroupLabel>
                        {group.label}
                      </AutocompleteGroupLabel>
                      <For each={group.items}>
                        {(item) => (
                          <AutocompleteItem value={item}>
                            {item}
                          </AutocompleteItem>
                        )}
                      </For>
                    </AutocompleteGroup>
                  )}
                </For>
              </AutocompleteList>
            </AutocompleteContent>
          </Autocomplete>
        </div>
      </section>

      <section class="flex flex-col gap-3">
        <h2 class="text-lg font-semibold">Calendar</h2>
        <div class="flex flex-wrap items-start gap-4">
          <Calendar
            class="rounded-xl border"
            value={day()}
            onValueChange={(value) =>
              setDay(value === null || Array.isArray(value) ? null : value)
            }
          />
          <Calendar
            class="rounded-xl border"
            captionLayout="dropdown"
            value={day()}
            onValueChange={(value) =>
              setDay(value === null || Array.isArray(value) ? null : value)
            }
            min="1990-01-01"
            max="2026-12-31"
          />
        </div>
      </section>

      <section class="flex flex-col gap-3">
        <h2 class="text-lg font-semibold">Feedback button</h2>
        <div class="flex flex-wrap items-center gap-2">
          <FeedbackButton
            state={state()}
            pendingLabel="Saving…"
            successLabel="Saved"
            errorLabel="Try again"
            onClick={() => save("success")}
          >
            <Icon icon={Save} />
            Save
          </FeedbackButton>
          <FeedbackButton
            variant="outline"
            state={state()}
            pendingLabel="Saving…"
            successLabel="Saved"
            errorLabel="Try again"
            onClick={() => save("error")}
          >
            Save, then fail
          </FeedbackButton>
        </div>
      </section>
    </>
  )
}
