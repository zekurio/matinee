import type { User } from "@matinee/contracts"
import { cn } from "@matinee/ui/lib/utils"
import { Dynamic, type JSX } from "@solidjs/web"
import { ArrowLeft, LogOut, Search, X } from "lucide"
import { createMemo, createSignal, For, onSettled, Show } from "solid-js"

import { UserAvatar } from "@/components/user-avatar"
import { tr } from "@/i18n"
import { Dialog, DialogClose, DialogContent, DialogTitle } from "@/kit/dialog"
import { Icon } from "@/kit/icon"
import { Input } from "@/kit/input"
import { List, ListItemButton } from "@/kit/list"
import { ScrollArea } from "@/kit/scroll-area"
import type { SettingsTarget } from "@/lib/settings"
import { useSignOut } from "@/lib/sign-out"
import { mediaQuery } from "@/lib/viewport"
import { setSaveBarSlot } from "@/stores/settings-dialog"

import {
  type SettingsCategory,
  searchSettings,
  useSettingsCategories,
} from "./settings-categories"

interface SettingsNavigation {
  /** Switch sections in place, as the sidebar does. */
  onNavigate: (section: SettingsTarget) => void
  /** Open a section from the phone menu, as a new history entry. */
  onOpenSection: (section: SettingsTarget) => void
  /** Leave a section for the phone menu. */
  onBack: () => void
}

/** Where the dialog turns into a full-screen sheet, as `md` ends. */
const isMobile = () => mediaQuery("(max-width: 767px)")()

/**
 * Settings as a dialog over the current page. Desktop pairs a sidebar with
 * the open section; a phone gets a full-screen sheet with the menu first and
 * each section pushed in over it.
 *
 * A panel with unsaved edits holds every way out itself: its save bar blocks
 * the navigation that closing or switching sections makes.
 */
export function SettingsDialog(
  props: SettingsNavigation & {
    user: User
    /** The requested section, or null while closed. */
    section: SettingsTarget | null
    onClose: () => void
  },
) {
  const categories = useSettingsCategories(() => props.user)
  let popup: HTMLDivElement | undefined
  // Keeps the last section on screen while the dialog animates closed.
  let last: SettingsTarget | null = null
  const section = createMemo(() => {
    if (props.section !== null) last = props.section
    return props.section ?? last
  })
  // Rendered open, the dialog would leave focus where it was, outside it,
  // so it opens once it's in the page, and moves focus in as it does.
  const [mounted, setMounted] = createSignal(false)
  onSettled(() => {
    setMounted(true)
  })

  return (
    <Dialog
      open={mounted() && props.section !== null}
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
    >
      <DialogContent
        ref={(el: HTMLDivElement) => (popup = el)}
        // Keyboard users land in the search. A click or tap focuses the
        // dialog itself: no ring on open, and no phone keyboard popping up.
        initialFocus={() =>
          // What had focus shows a ring only when reached by keyboard.
          (document.activeElement?.matches(":focus-visible")
            ? popup?.querySelector<HTMLElement>("input[type=search]")
            : undefined) ?? popup
        }
        showCloseButton={false}
        disableZoom
        class={cn(
          // Scales with the viewport, keeping a margin on every side, up to
          // a cap that stops rows stretching too far on a big monitor.
          "bg-card flex h-[92dvh] max-h-[80rem] w-[94vw] max-w-[90rem] gap-0 overflow-hidden p-0 sm:max-w-[90rem]",
          "settings-sheet max-md:top-0 max-md:left-0 max-md:h-dvh max-md:max-h-none max-md:w-screen max-md:max-w-none max-md:rounded-none max-md:ring-0",
        )}
      >
        <DialogTitle class="sr-only">{tr("settings.title")}</DialogTitle>
        <SettingsBody
          user={props.user}
          categories={categories()}
          section={section()}
          onNavigate={props.onNavigate}
          onOpenSection={props.onOpenSection}
          onBack={props.onBack}
        />
      </DialogContent>
    </Dialog>
  )
}

function SettingsBody(
  props: SettingsNavigation & {
    user: User
    categories: SettingsCategory[]
    section: SettingsTarget | null
  },
) {
  // A phone has room for the menu or a section, never both, so without a
  // section it shows the menu. Desktop always pairs the sidebar with one.
  const active = createMemo(
    () =>
      props.categories.find((category) => category.id === props.section) ??
      (isMobile() ? undefined : props.categories[0]),
  )

  return (
    <Show
      when={active()}
      fallback={
        <SettingsOverview
          user={props.user}
          categories={props.categories}
          onOpenSection={props.onOpenSection}
        />
      }
    >
      {(category) => (
        <SettingsSectionView
          categories={props.categories}
          active={category()}
          onNavigate={props.onNavigate}
          onOpenSection={props.onOpenSection}
          onBack={props.onBack}
        />
      )}
    </Show>
  )
}

const iconButton =
  "text-foreground focus-visible:ring-ring grid size-12 place-items-center rounded-full outline-none transition-colors hover:drop-shadow-[0_0_6px_currentColor] focus-visible:ring-2 active:bg-foreground/10 [&_svg]:size-6"

/** The phone title bar: Back, then the title, as the Flutter PageFrame. */
function MobileHeader(props: { title: string; leading: JSX.Element }) {
  return (
    <header class="bg-card shrink-0 pt-[env(safe-area-inset-top)]">
      <div class="flex h-16 items-center pr-1 pl-1">
        {props.leading}
        <h2 class="min-w-0 flex-1 truncate pl-1 text-xl leading-7 font-semibold tracking-tight">
          {props.title}
        </h2>
      </div>
    </header>
  )
}

/**
 * The phone menu: search, the signed-in account, then every section, and
 * signing out at its end, as phones have no account menu.
 */
function SettingsOverview(props: {
  user: User
  categories: SettingsCategory[]
  onOpenSection: (section: SettingsTarget) => void
}) {
  const [query, setQuery] = createSignal("")
  const groups = createMemo(() => searchSettings(props.categories, query()))
  const name = () => props.user.displayName ?? props.user.username
  const signOut = useSignOut()

  return (
    <div class="flex min-w-0 flex-1 flex-col">
      <MobileHeader
        title={tr("settings.title")}
        leading={
          <DialogClose aria-label={tr("shell.back")} class={iconButton}>
            <Icon icon={ArrowLeft} />
          </DialogClose>
        }
      />
      <div class="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <SearchField value={query()} onChange={setQuery} />
        <For each={groups()} keyed={(group) => group.id}>
          {(group) => (
            <section class="flex flex-col gap-2">
              <Show when={group().id !== "account"}>
                <h3 class="text-muted-foreground text-13px px-1 font-medium">
                  {group().label}
                </h3>
              </Show>
              <List>
                <For each={group().items} keyed={(item) => item.category.id}>
                  {(item) => (
                    // The account section reads as the account it edits.
                    <Show
                      when={item().category.id === "account"}
                      fallback={
                        <ListItemButton
                          onClick={() =>
                            props.onOpenSection(item().category.id)
                          }
                        >
                          <Icon
                            icon={item().category.icon}
                            class="text-muted-foreground size-5 shrink-0"
                          />
                          <span class="flex min-w-0 flex-1 flex-col">
                            <span class="truncate font-medium">
                              {item().category.label}
                            </span>
                            <span class="text-muted-foreground text-13px truncate">
                              {item().hint ?? item().category.description}
                            </span>
                          </span>
                        </ListItemButton>
                      }
                    >
                      <ListItemButton
                        class="min-h-16"
                        onClick={() => props.onOpenSection(item().category.id)}
                      >
                        <UserAvatar user={props.user} class="size-10 text-sm" />
                        <span class="flex min-w-0 flex-1 flex-col">
                          <span class="truncate font-medium">{name()}</span>
                          <span class="text-muted-foreground text-13px truncate">
                            {item().hint ?? item().category.description}
                          </span>
                        </span>
                      </ListItemButton>
                    </Show>
                  )}
                </For>
              </List>
            </section>
          )}
        </For>
        <Show when={groups().length === 0}>
          <p class="text-muted-foreground px-1 text-sm">
            {tr("settings.noMatch", { query: query().trim() })}
          </p>
        </Show>
        <Show when={!query().trim()}>
          <List>
            <ListItemButton
              class="text-destructive"
              disabled={signOut.isPending}
              onClick={() => signOut.mutate()}
              trailing={false}
            >
              <Icon icon={LogOut} class="size-5 shrink-0" />
              <span class="min-w-0 flex-1 truncate font-medium">
                {tr("shell.signOut")}
              </span>
            </ListItemButton>
          </List>
        </Show>
      </div>
    </div>
  )
}

function SettingsSectionView(
  props: SettingsNavigation & {
    categories: SettingsCategory[]
    active: SettingsCategory
  },
) {
  const [query, setQuery] = createSignal("")
  const groups = createMemo(() => searchSettings(props.categories, query()))

  return (
    <>
      <nav
        aria-label={tr("settings.title")}
        class="bg-background/60 hidden w-56 shrink-0 border-r md:flex lg:w-64"
      >
        <ScrollArea
          hasControls
          class="min-w-0 flex-1"
          viewportClassName="flex flex-col gap-0.5 p-4"
        >
          <div class="px-2.5 pt-1 pb-3 text-lg font-semibold tracking-tight">
            {tr("settings.title")}
          </div>
          <SearchField value={query()} onChange={setQuery} class="mb-2" />
          <For each={groups()} keyed={(group) => group.id}>
            {(group) => (
              <div class="flex flex-col gap-0.5">
                <Show when={group().id !== "account"}>
                  <div class="text-muted-foreground px-2.5 pt-5 pb-1.5 text-xs font-medium">
                    {group().label}
                  </div>
                </Show>
                <For each={group().items} keyed={(item) => item.category.id}>
                  {(item) => {
                    const isActive = () =>
                      item().category.id === props.active.id
                    return (
                      <button
                        type="button"
                        aria-current={isActive() ? "page" : undefined}
                        onClick={() => {
                          if (!isActive()) props.onNavigate(item().category.id)
                        }}
                        class={[
                          "focus-visible:ring-ring flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors outline-none focus-visible:ring-2",
                          isActive()
                            ? "text-foreground bg-foreground/[0.07]"
                            : "text-muted-foreground hover:text-foreground hover:bg-foreground/[0.06]",
                        ]}
                      >
                        <Icon
                          icon={item().category.icon}
                          class="size-4 shrink-0"
                        />
                        <span class="flex min-w-0 flex-col">
                          <span class="truncate">{item().category.label}</span>
                          <Show when={item().hint}>
                            <span class="text-muted-foreground truncate text-xs">
                              {item().hint}
                            </span>
                          </Show>
                        </span>
                      </button>
                    )
                  }}
                </For>
              </div>
            )}
          </For>
          <Show when={groups().length === 0}>
            <p class="text-muted-foreground px-2.5 pt-3 text-sm">
              {tr("settings.noMatch", { query: query().trim() })}
            </p>
          </Show>
        </ScrollArea>
      </nav>

      {/* On a phone a section replaces the menu, so it slides in over it. */}
      <div class="max-md:animate-in max-md:fade-in-0 max-md:slide-in-from-right-4 animation-duration-200 flex min-w-0 flex-1 flex-col motion-reduce:animate-none">
        <Show
          when={isMobile()}
          fallback={
            <header class="flex h-16 shrink-0 items-center justify-between gap-4 border-b pr-4 pl-6 lg:pl-10">
              <h2 class="truncate text-lg font-semibold tracking-tight">
                {props.active.label}
              </h2>
              <DialogClose
                aria-label={tr("settings.close")}
                class={cn(iconButton, "size-9 [&_svg]:size-4")}
              >
                <Icon icon={X} />
              </DialogClose>
            </header>
          }
        >
          <MobileHeader
            title={props.active.label}
            leading={
              <button
                type="button"
                aria-label={tr("settings.back")}
                class={iconButton}
                onClick={() => props.onBack()}
              >
                <Icon icon={ArrowLeft} />
              </button>
            }
          />
        </Show>
        {/* Keyed, so a new section starts at its top and fades in instead
            of snapping over the last. */}
        <Show when={props.active.id} keyed>
          {(id) => (
            <ScrollArea
              hasControls
              data-section={id}
              class="animate-in fade-in-0 animation-duration-200 min-h-0 flex-1 motion-reduce:animate-none"
              viewportClassName="px-4 py-6 md:px-6 md:py-8 lg:px-10 max-md:pb-[max(1.5rem,env(safe-area-inset-bottom))]"
            >
              <Dynamic component={props.active.Panel} />
            </ScrollArea>
          )}
        </Show>
        <SaveBarSlot />
      </div>
    </>
  )
}

/**
 * The save bar of a panel with unsaved edits lands here, on the panel's
 * bottom edge, outside the scrolling content.
 */
function SaveBarSlot() {
  onSettled(() => () => setSaveBarSlot(undefined))
  return <div ref={(el) => setSaveBarSlot(el)} class="shrink-0 empty:hidden" />
}

function SearchField(props: {
  value: string
  onChange: (value: string) => void
  class?: string
}) {
  return (
    <div class={cn("relative", props.class)}>
      <Icon
        icon={Search}
        class="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
      />
      <Input
        type="search"
        value={props.value}
        onValueChange={(value) => props.onChange(value)}
        onKeyDown={(event) => {
          // Escape clears the search before it closes the dialog.
          if (event.key === "Escape" && props.value) {
            event.stopPropagation()
            props.onChange("")
          }
        }}
        placeholder={tr("settings.search")}
        aria-label={tr("settings.search")}
        class="pl-8 [&::-webkit-search-cancel-button]:appearance-none"
      />
    </div>
  )
}
