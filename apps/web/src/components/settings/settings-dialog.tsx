import type { User } from "@matinee/contracts"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@matinee/ui/components/dialog"
import { Input } from "@matinee/ui/components/input"
import { List, ListItemButton } from "@matinee/ui/components/list"
import { ScrollArea } from "@matinee/ui/components/scroll-area"
import { useIsMobile } from "@matinee/ui/hooks/use-media-query"
import { cn } from "@matinee/ui/lib/utils"
import { useBlocker } from "@tanstack/react-router"
import { ArrowLeftIcon, SearchIcon, XIcon } from "lucide-react"
import { type ReactNode, useMemo, useRef, useState } from "react"

import {
  type SettingsCategory,
  searchSettings,
  useSettingsCategories,
} from "./settings-categories"
import {
  SettingsGuardProvider,
  SettingsSectionNav,
  SettingsSectionsProvider,
  useSettingsGuard,
} from "./settings-panel"

interface SettingsNavigation {
  /** Switch sections in place, as the sidebar does. */
  onNavigate: (section: string) => void
  /** Open a section from the phone menu, as a new history entry. */
  onOpenSection: (section: string) => void
  /** Leave a section for the phone menu. */
  onBack: () => void
}

/**
 * Settings as a dialog over the current page. Desktop pairs a sidebar with
 * the open section; a phone gets a full-screen sheet with the menu first and
 * each section pushed in over it.
 */
export function SettingsDialog(props: SettingsDialogProps) {
  return (
    <SettingsGuardProvider>
      <SettingsDialogRoot {...props} />
    </SettingsGuardProvider>
  )
}

type SettingsDialogProps = SettingsNavigation & {
  user: User
  /** The requested section, or null while closed. */
  section: string | null
  onClose: () => void
}

function SettingsDialogRoot({
  user,
  section,
  onClose,
  onNavigate,
  onOpenSection,
  onBack,
}: SettingsDialogProps) {
  const categories = useSettingsCategories(user)
  const { dirty, requestAttention } = useSettingsGuard()
  // Leaving a panel unmounts it and drops its edits, so every way out (close,
  // another section, browser back, reload) waits for Save or Reset and
  // points at the save bar instead.
  const guarded =
    <A extends unknown[]>(leave: (...args: A) => void) =>
    (...args: A) => {
      if (dirty) requestAttention()
      else leave(...args)
    }
  useBlocker({
    disabled: !dirty,
    enableBeforeUnload: dirty,
    shouldBlockFn: () => {
      requestAttention()
      return true
    },
  })
  const popupRef = useRef<HTMLDivElement>(null)
  // Keeps the last section on screen while the dialog animates closed.
  const [shown, setShown] = useState(section)
  if (section !== null && section !== shown) setShown(section)

  return (
    <Dialog
      open={section !== null}
      onOpenChange={(open) => !open && guarded(onClose)()}
    >
      <DialogContent
        ref={popupRef}
        // Keyboard users land in the search. A click or tap focuses the
        // dialog itself: no ring on open, and no phone keyboard popping up.
        initialFocus={(type) => type === "keyboard" || popupRef.current}
        showCloseButton={false}
        disableZoom
        className={cn(
          "bg-card flex h-[90vh] max-h-[820px] w-[calc(100vw-2rem)] max-w-5xl gap-0 overflow-hidden p-0 sm:max-w-5xl",
          "settings-sheet max-md:top-0 max-md:left-0 max-md:h-dvh max-md:max-h-none max-md:w-screen max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-none max-md:ring-0",
        )}
      >
        <DialogTitle className="sr-only">Settings</DialogTitle>
        <SettingsBody
          user={user}
          categories={categories}
          section={section ?? shown}
          onNavigate={guarded(onNavigate)}
          onOpenSection={guarded(onOpenSection)}
          onBack={guarded(onBack)}
        />
      </DialogContent>
    </Dialog>
  )
}

function SettingsBody({
  user,
  categories,
  section,
  ...navigation
}: SettingsNavigation & {
  user: User
  categories: SettingsCategory[]
  section: string | null
}) {
  const isMobile = useIsMobile()
  const requested = categories.find((category) => category.id === section)
  // A phone has room for the menu or a section, never both, so without a
  // section it shows the menu. Desktop always pairs the sidebar with one.
  const active = requested ?? (isMobile ? null : categories[0])

  if (!active) {
    return (
      <SettingsOverview
        user={user}
        categories={categories}
        onOpenSection={navigation.onOpenSection}
      />
    )
  }
  return (
    <SettingsSectionView
      isMobile={isMobile}
      categories={categories}
      active={active}
      {...navigation}
    />
  )
}

const iconButton =
  "text-muted-foreground hover:text-foreground focus-visible:ring-ring grid size-10 place-items-center rounded-lg outline-none transition-colors focus-visible:ring-2 [&_svg]:size-5"

/** The phone title bar: one button, then the title centred. */
function MobileHeader({
  title,
  leading,
}: {
  title: string
  leading: ReactNode
}) {
  return (
    <header className="bg-card shrink-0 border-b px-1 pt-[env(safe-area-inset-top)]">
      <div className="grid h-13 grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center">
        <div className="grid place-items-center">{leading}</div>
        <h2 className="truncate text-center text-base font-semibold">
          {title}
        </h2>
      </div>
    </header>
  )
}

/** The phone menu: search, the signed-in account, then every section. */
function SettingsOverview({
  user,
  categories,
  onOpenSection,
}: {
  user: User
  categories: SettingsCategory[]
  onOpenSection: (section: string) => void
}) {
  const [query, setQuery] = useState("")
  const groups = useMemo(
    () => searchSettings(categories, query),
    [categories, query],
  )
  const name = user.displayName ?? user.username

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <MobileHeader
        title="Settings"
        leading={
          <DialogClose aria-label="Close settings" className={iconButton}>
            <XIcon />
          </DialogClose>
        }
      />
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <SearchField value={query} onChange={setQuery} />
        {groups.map((group) => (
          <section key={group.id} className="flex flex-col gap-2">
            {group.id !== "account" && (
              <h3 className="text-muted-foreground px-1 text-[13px] font-medium">
                {group.label}
              </h3>
            )}
            <List>
              {group.items.map(({ category, hint }) =>
                // The account section reads as the account it edits.
                category.id === "account" ? (
                  <ListItemButton
                    key={category.id}
                    className="min-h-16"
                    onClick={() => onOpenSection(category.id)}
                  >
                    <span
                      aria-hidden
                      className="bg-secondary grid size-10 shrink-0 place-items-center rounded-full text-sm font-semibold"
                    >
                      {name.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-medium">{name}</span>
                      <span className="text-muted-foreground truncate text-[13px]">
                        {hint ?? category.description}
                      </span>
                    </span>
                  </ListItemButton>
                ) : (
                  <ListItemButton
                    key={category.id}
                    onClick={() => onOpenSection(category.id)}
                  >
                    <category.icon className="text-muted-foreground size-5 shrink-0" />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-medium">
                        {category.label}
                      </span>
                      <span className="text-muted-foreground truncate text-[13px]">
                        {hint ?? category.description}
                      </span>
                    </span>
                  </ListItemButton>
                ),
              )}
            </List>
          </section>
        ))}
        {groups.length === 0 && (
          <p className="text-muted-foreground px-1 text-sm">
            No settings match “{query.trim()}”.
          </p>
        )}
      </div>
    </div>
  )
}

function SettingsSectionView({
  isMobile,
  categories,
  active,
  onNavigate,
  onBack,
}: SettingsNavigation & {
  isMobile: boolean
  categories: SettingsCategory[]
  active: SettingsCategory
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [query, setQuery] = useState("")
  const groups = useMemo(
    () => searchSettings(categories, query),
    [categories, query],
  )

  return (
    <SettingsSectionsProvider>
      <ScrollArea
        render={<nav aria-label="Settings" />}
        className="bg-background/60 hidden w-64 shrink-0 border-r md:flex"
        viewportClassName="flex flex-col gap-0.5 p-4"
      >
        <div className="px-2.5 pt-1 pb-3 text-lg font-semibold tracking-tight">
          Settings
        </div>
        <SearchField value={query} onChange={setQuery} className="mb-2" />
        {groups.map((group) => (
          <div key={group.id} className="flex flex-col gap-0.5">
            {group.id !== "account" && (
              <div className="text-muted-foreground px-2.5 pt-5 pb-1.5 text-xs font-medium">
                {group.label}
              </div>
            )}
            {group.items.map(({ category, hint }) => {
              const isActive = category.id === active.id
              return (
                <div key={category.id} className="flex flex-col">
                  <button
                    type="button"
                    aria-current={isActive ? "page" : undefined}
                    onClick={() => !isActive && onNavigate(category.id)}
                    className={cn(
                      "focus-visible:ring-ring flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm outline-none transition-colors focus-visible:ring-2",
                      isActive
                        ? "text-foreground bg-white/[0.07] font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]",
                    )}
                  >
                    <category.icon className="size-4 shrink-0" />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">{category.label}</span>
                      {hint && (
                        <span className="text-muted-foreground truncate text-xs font-normal">
                          {hint}
                        </span>
                      )}
                    </span>
                  </button>
                  {/* A search narrows the list to what matched; subsection
                      links would only bury that. */}
                  {isActive && !query.trim() && (
                    <SettingsSectionNav scrollRef={scrollRef} />
                  )}
                </div>
              )
            })}
          </div>
        ))}
        {groups.length === 0 && (
          <p className="text-muted-foreground px-2.5 pt-3 text-sm">
            No settings match “{query.trim()}”.
          </p>
        )}
      </ScrollArea>

      {/* On a phone a section replaces the menu, so it slides in over it. */}
      <div className="max-md:animate-in max-md:fade-in-0 max-md:slide-in-from-right-4 animation-duration-200 flex min-w-0 flex-1 flex-col motion-reduce:animate-none">
        {isMobile ? (
          <MobileHeader
            title={active.label}
            leading={
              <button
                type="button"
                aria-label="Back to settings"
                className={iconButton}
                onClick={onBack}
              >
                <ArrowLeftIcon />
              </button>
            }
          />
        ) : (
          <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b pr-4 pl-10">
            <h2 className="truncate text-lg font-semibold tracking-tight">
              {active.label}
            </h2>
            <DialogClose
              aria-label="Close settings"
              className={cn(iconButton, "size-9 [&_svg]:size-4")}
            >
              <XIcon />
            </DialogClose>
          </header>
        )}
        {/* Keyed, so a new section starts at its top and fades in instead
            of snapping over the last. */}
        <ScrollArea
          key={active.id}
          className="animate-in fade-in-0 animation-duration-200 min-h-0 flex-1 motion-reduce:animate-none"
          viewportRef={scrollRef}
          viewportClassName="px-4 py-6 md:px-10 md:py-8 max-md:pb-[max(1.5rem,env(safe-area-inset-bottom))]"
        >
          <active.Panel />
        </ScrollArea>
      </div>
    </SettingsSectionsProvider>
  )
}

function SearchField({
  value,
  onChange,
  className,
}: {
  value: string
  onChange: (value: string) => void
  className?: string
}) {
  return (
    <div className={cn("relative", className)}>
      <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
      <Input
        type="search"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        onKeyDown={(event) => {
          // Escape clears the search before it closes the dialog.
          if (event.key === "Escape" && value) {
            event.stopPropagation()
            onChange("")
          }
        }}
        placeholder="Search settings"
        aria-label="Search settings"
        className="pl-8 [&::-webkit-search-cancel-button]:appearance-none"
      />
    </div>
  )
}
