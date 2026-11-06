import { Button } from "@matinee/ui/components/button"
import { Spinner } from "@matinee/ui/components/spinner"
import { cn } from "@matinee/ui/lib/utils"
import {
  createContext,
  type ReactNode,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react"

import { FormAlert } from "@/components/form-alert"

/** A subsection of the open settings panel, as the sidebar lists it. */
interface SettingsSection {
  id: string
  label: string
  element: HTMLElement
}

type Register = (section: SettingsSection) => () => void

const SectionsContext = createContext<SettingsSection[]>([])
const RegisterContext = createContext<Register | null>(null)

/**
 * Collects the subsections the open panel renders, so the sidebar can list
 * them under the active section. Panels register on mount instead of a table
 * declaring them, which would drift the moment a panel changes.
 */
export function SettingsSectionsProvider({
  children,
}: {
  children: ReactNode
}) {
  const [sections, setSections] = useState<SettingsSection[]>([])
  const register = useCallback<Register>((section) => {
    setSections((current) =>
      sortByDocumentOrder([
        ...current.filter((entry) => entry.id !== section.id),
        section,
      ]),
    )
    return () =>
      setSections((current) =>
        current.filter((entry) => entry.element !== section.element),
      )
  }, [])
  return (
    <RegisterContext.Provider value={register}>
      <SectionsContext.Provider value={sections}>
        {children}
      </SectionsContext.Provider>
    </RegisterContext.Provider>
  )
}

/** Registers a subsection. Returns the ref callback for its element. */
function useRegisterSettingsSection(id: string, label: string) {
  const register = useContext(RegisterContext)
  return useCallback(
    (element: HTMLElement | null) => {
      if (!register || !element) return
      return register({ id, label, element })
    },
    [id, label, register],
  )
}

/** Stacks the subsections of a panel, separated by whitespace alone. */
export function SettingsSections({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return <div className={cn("flex flex-col gap-10", className)}>{children}</div>
}

/**
 * A titled block in a settings panel. `id` must be unique within the panel:
 * the sidebar links to it.
 */
export function SettingsSubsection({
  id,
  title,
  description,
  action,
  children,
}: {
  id: string
  title: string
  description?: ReactNode
  /** A button for the section, such as the one that adds to its list. */
  action?: ReactNode
  children: ReactNode
}) {
  const register = useRegisterSettingsSection(id, title)
  return (
    <section
      id={`settings-${id}`}
      ref={register}
      aria-labelledby={`settings-${id}-title`}
      className="flex scroll-mt-6 flex-col gap-4 md:scroll-mt-8"
    >
      {/* Narrow panels put the action under the copy at full width, so its
          label never fights the text for room. */}
      <div className="@container">
        <div className="flex flex-col gap-3 @lg:flex-row @lg:items-center @lg:justify-between @lg:gap-6">
          <div className="flex min-w-0 flex-col gap-1">
            <h3
              id={`settings-${id}-title`}
              className="text-base font-semibold tracking-tight"
            >
              {title}
            </h3>
            {description ? (
              <p className="text-muted-foreground text-sm">{description}</p>
            ) : null}
          </div>
          {action ? (
            <div className="shrink-0 [&>*]:w-full @lg:[&>*]:w-auto">
              {action}
            </div>
          ) : null}
        </div>
      </div>
      {children}
    </section>
  )
}

/**
 * Links to the subsections of the active section, highlighting the one in
 * view. Hidden when there is one subsection or the panel fits on screen,
 * where every link would scroll to what's already visible.
 */
export function SettingsSectionNav({
  scrollRef,
}: {
  scrollRef: RefObject<HTMLDivElement | null>
}) {
  const sections = useContext(SectionsContext)
  const activeId = useSectionInView(scrollRef, sections)
  const overflows = useOverflows(scrollRef, sections)

  if (sections.length < 2 || !overflows) return null

  return (
    <div className="mt-1 ml-[1.0625rem] flex flex-col">
      {sections.map((section) => (
        <button
          key={section.id}
          type="button"
          onClick={() =>
            section.element.scrollIntoView({
              behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
                .matches
                ? "auto"
                : "smooth",
              block: "start",
            })
          }
          className={cn(
            "focus-visible:ring-ring truncate border-l-2 py-1.5 pl-3 text-left text-sm outline-none transition-colors focus-visible:ring-2",
            section.id === activeId
              ? "border-foreground text-foreground font-medium"
              : "text-muted-foreground hover:text-foreground border-white/10 hover:border-white/25",
          )}
        >
          {section.label}
        </button>
      ))}
    </div>
  )
}

/**
 * Whether the panel is tall enough that jumping beats scrolling: a quarter
 * of a viewport of overflow. Sections resize as their data loads, so they
 * feed the measurement too.
 */
function useOverflows(
  scrollRef: RefObject<HTMLDivElement | null>,
  sections: SettingsSection[],
) {
  const [overflows, setOverflows] = useState(false)
  useEffect(() => {
    const scroller = scrollRef.current
    if (!scroller) return
    const update = () =>
      setOverflows(scroller.scrollHeight > scroller.clientHeight * 1.25)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(scroller)
    for (const section of sections) observer.observe(section.element)
    return () => observer.disconnect()
  }, [scrollRef, sections])
  return overflows
}

function useSectionInView(
  scrollRef: RefObject<HTMLDivElement | null>,
  sections: SettingsSection[],
) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const first = sections[0]
  const last = sections.at(-1)

  useEffect(() => {
    const scroller = scrollRef.current
    if (!scroller || !first || !last) return

    const pending = { frame: 0 }
    const update = () => {
      pending.frame = 0
      // The last heading above the top quarter of the panel is the one being
      // read. The final section may be too short to reach that line, so the
      // bottom of the scroller selects it outright.
      const line =
        scroller.getBoundingClientRect().top + scroller.clientHeight / 4
      const atBottom =
        scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2
      const current = atBottom
        ? last
        : sections.reduce(
            (found, section) =>
              section.element.getBoundingClientRect().top <= line
                ? section
                : found,
            first,
          )
      setActiveId(current.id)
    }
    const schedule = () => {
      if (!pending.frame) pending.frame = requestAnimationFrame(update)
    }

    update()
    scroller.addEventListener("scroll", schedule, { passive: true })
    const observer = new ResizeObserver(schedule)
    observer.observe(scroller)
    for (const section of sections) observer.observe(section.element)
    return () => {
      scroller.removeEventListener("scroll", schedule)
      observer.disconnect()
      if (pending.frame) cancelAnimationFrame(pending.frame)
    }
  }, [scrollRef, sections, first, last])

  return useMemo(
    () =>
      sections.some((section) => section.id === activeId) ? activeId : null,
    [activeId, sections],
  )
}

function sortByDocumentOrder(sections: SettingsSection[]): SettingsSection[] {
  return [...sections].sort((a, b) =>
    a.element.compareDocumentPosition(b.element) &
    Node.DOCUMENT_POSITION_FOLLOWING
      ? -1
      : 1,
  )
}

type Guard = {
  /** A panel has edits it hasn't saved. */
  dirty: boolean
  setDirty: (dirty: boolean) => void
  /** Bumped when someone tries to leave with unsaved edits. */
  attention: number
  requestAttention: () => void
}

const GuardContext = createContext<Guard | null>(null)

/**
 * Tracks whether the open panel has unsaved edits, so the dialog can refuse
 * to close or switch sections and point at the save bar instead.
 */
export function SettingsGuardProvider({ children }: { children: ReactNode }) {
  const [dirty, setDirty] = useState(false)
  const [attention, setAttention] = useState(0)
  const requestAttention = useCallback(() => setAttention((n) => n + 1), [])
  const value = useMemo(
    () => ({ dirty, setDirty, attention, requestAttention }),
    [dirty, attention, requestAttention],
  )
  return <GuardContext.Provider value={value}>{children}</GuardContext.Provider>
}

export function useSettingsGuard(): Guard {
  const guard = useContext(GuardContext)
  if (!guard) throw new Error("useSettingsGuard needs SettingsGuardProvider")
  return guard
}

/** Reports a panel's unsaved edits to the dialog while it's mounted. */
function useUnsavedChanges(dirty: boolean) {
  const { setDirty } = useSettingsGuard()
  useEffect(() => {
    setDirty(dirty)
    return () => setDirty(false)
  }, [dirty, setDirty])
}

/**
 * Pinned to the bottom of a panel while it has unsaved edits. It shakes when
 * someone tries to leave, since leaving would drop them.
 */
export function SettingsSaveBar({
  dirty,
  saving,
  error,
  onReset,
  onSave,
}: {
  dirty: boolean
  saving: boolean
  error: string | null
  onReset: () => void
  onSave: () => void
}) {
  useUnsavedChanges(dirty)
  const { attention } = useSettingsGuard()
  if (!dirty && !error) return null
  return (
    <div className="sticky bottom-0 z-10 -mx-1 mt-8 px-1 pb-1">
      <section
        // Remounts on each attempt to leave, which replays the shake.
        key={attention}
        aria-label="Unsaved changes"
        className={cn(
          "bg-popover/95 flex flex-col gap-3 rounded-xl border p-3 pl-4 shadow-lg shadow-black/40 backdrop-blur",
          attention > 0 && "settings-attention",
        )}
      >
        {error && <FormAlert message={error} />}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium">
            {dirty ? "You have unsaved changes." : "Not saved."}
          </p>
          <div className="ml-auto flex gap-2">
            <Button
              type="button"
              variant="ghost"
              disabled={saving}
              onClick={onReset}
            >
              Reset
            </Button>
            {/* A submit button, so Enter in a field of the panel's form
                saves too. The click handler takes over the submit. */}
            <Button
              type="submit"
              disabled={saving || !dirty}
              onClick={(event) => {
                event.preventDefault()
                onSave()
              }}
            >
              {saving && <Spinner />}
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}

/** A bordered stack of {@link SettingRow}s split by hairlines. */
export function SettingRows({ children }: { children: ReactNode }) {
  return (
    <div className="divide-y rounded-xl border bg-white/[0.02]">{children}</div>
  )
}

/**
 * A setting: its name and description, then the control.
 * - `inline`: control on the right, for switches.
 * - `split`: control on the right once there's room, below it on phones.
 * - `stack`: control below at full width, for long values like URLs.
 *
 * The control gets the ids to name itself by through `children` as a
 * function, so a switch or input is labelled and described by the row.
 */
export function SettingRow({
  title,
  description,
  layout = "inline",
  footer,
  children,
}: {
  title: string
  description?: ReactNode
  layout?: "inline" | "split" | "stack"
  /** Content under the row that belongs to it, such as a warning. */
  footer?: ReactNode
  children: (ids: {
    controlId: string
    labelId: string
    descriptionId: string | undefined
  }) => ReactNode
}) {
  const id = useId()
  const ids = {
    controlId: `${id}-control`,
    labelId: `${id}-label`,
    descriptionId: description ? `${id}-description` : undefined,
  }
  return (
    <div className="@container flex flex-col gap-3 px-4 py-3.5">
      <div
        className={cn(
          "flex gap-x-6 gap-y-2.5",
          layout === "inline" && "items-center justify-between",
          layout === "split" &&
            "flex-col @lg:flex-row @lg:items-center @lg:justify-between",
          layout === "stack" && "flex-col",
        )}
      >
        <div className="min-w-0 flex-1">
          <label
            id={ids.labelId}
            htmlFor={ids.controlId}
            className="text-sm font-medium"
          >
            {title}
          </label>
          {description && (
            <p
              id={ids.descriptionId}
              className="text-muted-foreground mt-0.5 text-[13px] leading-5"
            >
              {description}
            </p>
          )}
        </div>
        <div
          className={cn(
            "flex shrink-0 items-center gap-2",
            layout === "split" && "@lg:w-72",
          )}
        >
          {children(ids)}
        </div>
      </div>
      {footer}
    </div>
  )
}
