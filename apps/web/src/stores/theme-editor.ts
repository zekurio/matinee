import {
  THEME_NAME_MAX_LENGTH,
  THEME_VARIANT_NAME_MAX_LENGTH,
} from "@matinee/contracts"
import {
  canonicalThemeColors,
  defaultThemeBackground,
  generateThemeColors,
  withDerivedAccentFamily,
  type ThemeAppearance,
  type ThemeColorRole,
  type ThemeColors,
} from "@matinee/ui/lib/theme-colors"
import {
  newCustomThemeId,
  newThemeVariantId,
  type CustomTheme,
  type CustomThemeVariant,
} from "@matinee/ui/lib/theme-custom"
import { createContext, useContext } from "react"
import { useStore } from "zustand"
import { createStore, type StoreApi } from "zustand/vanilla"

/**
 * The theme editor's draft and view, one store per opening: the editor
 * creates it when it mounts and drops it when it closes. Its parts read it
 * through {@link useThemeEditor}.
 */

/** What the editor opens with. */
export interface ThemeEditorOpening {
  /** The custom theme being edited; null creates a new one. */
  themeId: string | null
  name: string
  /** At least one. */
  variants: CustomThemeVariant[]
  /** The id of the variant to open. */
  selected: string
  /** Open in the two-color mode rather than with every role. */
  guided: boolean
}

/** The theme being edited. */
export interface EditorDraft {
  name: string
  variants: CustomThemeVariant[]
  /** The two colors each variant's guided palette comes from. */
  seeds: ReadonlyMap<string, GuidedSeed>
  advanced: boolean
}

/** The editor's own view state. */
export interface EditorView {
  /** The variant being edited. */
  selectedId: string
  filter: string
  collapsed: boolean
  /** Whether Inspect is picking, or its last pick found no theme color. */
  inspect: "off" | "picking" | "miss"
  pickedRole: ThemeColorRole | null
}

/** What the two-color mode shows; the palette is generated from these. */
export interface GuidedSeed {
  background: string
  accent: string
}

export interface ThemeEditorState {
  /** Made up front for a new theme, so a retried save can't add it twice. */
  id: string
  /** Whether saving adds the theme rather than replacing it. */
  creating: boolean
  draft: EditorDraft
  view: EditorView
  /** Set by the first save, so a missing name shows from then on. */
  attempted: boolean
  actions: ThemeEditorActions
}

interface ThemeEditorActions {
  setName: (name: string) => void
  selectVariant: (id: string) => void
  /** Names the variant being edited. */
  setVariantName: (name: string) => void
  /**
   * A fresh palette on the appearance's default background, keeping the
   * selected variant's accent. It joins the theme's other variants for that
   * appearance, light ones first.
   */
  addVariant: (appearance: ThemeAppearance) => void
  duplicateVariant: () => void
  /** Removing a variant always leaves at least one. */
  removeVariant: () => void
  /** Sets one of the two guided colors and regenerates the palette. */
  setGuidedColor: (field: keyof GuidedSeed, value: string) => void
  setRoleColor: (role: ThemeColorRole, value: string) => void
  setAdvanced: (advanced: boolean) => void
  setFilter: (filter: string) => void
  toggleCollapsed: () => void
  toggleInspect: () => void
  /** Inspect's pick: the role it found, or null for nothing themed. */
  pickRole: (role: ThemeColorRole | null) => void
  cancelInspect: () => void
  /**
   * Marks the save as attempted and gives the theme to save, or null while
   * it has no name.
   */
  attemptSave: () => CustomTheme | null
}

export type ThemeEditorStore = StoreApi<ThemeEditorState>

export function guidedSeed(colors: ThemeColors): GuidedSeed {
  return { background: colors.background, accent: colors.accent }
}

function guidedSeeds(
  variants: readonly CustomThemeVariant[],
): Map<string, GuidedSeed> {
  return new Map(
    variants.map((variant) => [variant.id, guidedSeed(variant.colors)]),
  )
}

/** The variant being edited, or the first when its id is gone. */
export function selectedVariant(
  state: ThemeEditorState,
): CustomThemeVariant | undefined {
  const { variants } = state.draft
  return (
    variants.find((variant) => variant.id === state.view.selectedId) ??
    variants[0]
  )
}

export function createThemeEditorStore(
  opening: ThemeEditorOpening,
): ThemeEditorStore {
  return createStore<ThemeEditorState>()((set, get) => {
    const patchView = (patch: Partial<EditorView>) =>
      set((state) => ({ view: { ...state.view, ...patch } }))

    /** Changes the selected variant, if there is one. */
    const updateSelected = (
      change: (variant: CustomThemeVariant) => Partial<CustomThemeVariant>,
      seeds?: (
        current: ReadonlyMap<string, GuidedSeed>,
      ) => ReadonlyMap<string, GuidedSeed>,
    ) => {
      const selected = selectedVariant(get())
      if (!selected) return
      set(({ draft }) => ({
        draft: {
          ...draft,
          variants: draft.variants.map((variant) =>
            variant.id === selected.id
              ? { ...variant, ...change(variant) }
              : variant,
          ),
          seeds: seeds ? seeds(draft.seeds) : draft.seeds,
        },
      }))
    }

    const insertVariant = (variant: CustomThemeVariant, index: number) =>
      set(({ draft, view }) => ({
        draft: {
          ...draft,
          variants: draft.variants.toSpliced(index, 0, variant),
          seeds: new Map(draft.seeds).set(
            variant.id,
            guidedSeed(variant.colors),
          ),
        },
        view: { ...view, selectedId: variant.id },
      }))

    return {
      id: opening.themeId ?? newCustomThemeId(),
      creating: opening.themeId === null,
      draft: {
        name: opening.name,
        variants: opening.variants,
        seeds: guidedSeeds(opening.variants),
        advanced: !opening.guided,
      },
      view: {
        selectedId: opening.selected,
        filter: "",
        collapsed: false,
        inspect: "off",
        pickedRole: null,
      },
      attempted: false,
      actions: {
        setName: (name) => set(({ draft }) => ({ draft: { ...draft, name } })),
        selectVariant: (selectedId) => patchView({ selectedId }),
        setVariantName: (name) => updateSelected(() => ({ name })),
        addVariant: (target) => {
          const state = get()
          const selected = selectedVariant(state)
          if (!selected) return
          const { variants } = state.draft
          const last = variants.findLastIndex(
            (variant) => variant.appearance === target,
          )
          insertVariant(
            {
              id: newThemeVariantId(variants),
              name: null,
              appearance: target,
              colors: generateThemeColors(
                target,
                defaultThemeBackground(target),
                selected.colors.accent,
              ),
            },
            last >= 0 ? last + 1 : target === "light" ? 0 : variants.length,
          )
        },
        duplicateVariant: () => {
          const state = get()
          const selected = selectedVariant(state)
          if (!selected) return
          const { variants } = state.draft
          const copiedName = selected.name?.trim()
          insertVariant(
            {
              ...selected,
              id: newThemeVariantId(variants),
              name: copiedName
                ? `${copiedName} copy`.slice(0, THEME_VARIANT_NAME_MAX_LENGTH)
                : null,
            },
            variants.indexOf(selected) + 1,
          )
        },
        removeVariant: () => {
          const state = get()
          const selected = selectedVariant(state)
          const { variants } = state.draft
          if (!selected || variants.length < 2) return
          const index = variants.indexOf(selected)
          const remaining = variants.filter((variant) => variant !== selected)
          set(({ draft, view }) => ({
            draft: { ...draft, variants: remaining },
            view: {
              ...view,
              selectedId:
                remaining[Math.min(index, remaining.length - 1)]?.id ?? "",
            },
          }))
        },
        setGuidedColor: (field, value) => {
          const state = get()
          const selected = selectedVariant(state)
          if (!selected) return
          const seed = {
            ...(state.draft.seeds.get(selected.id) ??
              guidedSeed(selected.colors)),
            [field]: value,
          }
          updateSelected(
            (variant) => ({
              colors: generateThemeColors(
                variant.appearance,
                seed.background,
                seed.accent,
              ),
            }),
            (seeds) => new Map(seeds).set(selected.id, seed),
          )
        },
        setRoleColor: (role, value) =>
          updateSelected((variant) => {
            const colors = { ...variant.colors, [role]: value }
            // The accent's hover, pressed, and text colors follow it; they
            // can be tuned again afterwards.
            return {
              colors:
                role === "accent" ? withDerivedAccentFamily(colors) : colors,
            }
          }),
        setAdvanced: (advanced) =>
          // Guided fields pick up from wherever the hand edits left the
          // palettes.
          set(({ draft }) => ({
            draft: {
              ...draft,
              advanced,
              seeds: advanced ? draft.seeds : guidedSeeds(draft.variants),
            },
          })),
        setFilter: (filter) => patchView({ filter }),
        toggleCollapsed: () =>
          set(({ view }) => ({
            view: { ...view, collapsed: !view.collapsed },
          })),
        toggleInspect: () =>
          set(({ view }) => ({
            view: {
              ...view,
              inspect: view.inspect === "picking" ? "off" : "picking",
            },
          })),
        pickRole: (role) => {
          if (!role) {
            patchView({ inspect: "miss" })
            return
          }
          set(({ draft, view }) => ({
            draft: { ...draft, advanced: true },
            view: {
              ...view,
              inspect: "off",
              collapsed: false,
              filter: "",
              pickedRole: role,
            },
          }))
        },
        cancelInspect: () => patchView({ inspect: "off" }),
        attemptSave: () => {
          set({ attempted: true })
          const { id, draft } = get()
          const name = draft.name.trim()
          if (!name) {
            patchView({ collapsed: false })
            return null
          }
          return {
            id,
            name: name.slice(0, THEME_NAME_MAX_LENGTH),
            variants: draft.variants.map((variant) => ({
              ...variant,
              name:
                variant.name
                  ?.trim()
                  .slice(0, THEME_VARIANT_NAME_MAX_LENGTH)
                  .trim() || null,
              colors: canonicalThemeColors(variant.colors),
            })),
            guided: !draft.advanced,
          }
        },
      },
    }
  })
}

export const ThemeEditorContext = createContext<ThemeEditorStore | null>(null)

/** Reads the open editor's store, re-rendering when `select`'s result changes. */
export function useThemeEditor<Slice>(
  select: (state: ThemeEditorState) => Slice,
): Slice {
  const store = useContext(ThemeEditorContext)
  if (!store) throw new Error("useThemeEditor needs a ThemeEditorContext")
  return useStore(store, select)
}

export function useThemeEditorActions(): ThemeEditorActions {
  return useThemeEditor((state) => state.actions)
}
