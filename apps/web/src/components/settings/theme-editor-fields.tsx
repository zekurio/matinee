import {
  MAX_THEME_VARIANTS,
  THEME_NAME_MAX_LENGTH,
  THEME_VARIANT_NAME_MAX_LENGTH,
} from "@matinee/contracts"
import { Button } from "@matinee/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@matinee/ui/components/dropdown-menu"
import { Input } from "@matinee/ui/components/input"
import { Switch } from "@matinee/ui/components/switch"
import {
  normalizeThemeColor,
  type ThemeColorRole,
} from "@matinee/ui/lib/theme-colors"
import { customVariantLabel } from "@matinee/ui/lib/theme-custom"
import { cn } from "@matinee/ui/lib/utils"
import { CopyIcon, MoonIcon, PlusIcon, SunIcon, Trash2Icon } from "lucide-react"
import type { RefObject } from "react"
import { useShallow } from "zustand/react/shallow"

import {
  guidedSeed,
  selectedVariant,
  useThemeEditor,
  useThemeEditorActions,
} from "@/stores/theme-editor"

import { HexColorInput } from "./hex-color-input"
import { ROLE_GROUPS, roleLabel } from "./theme-editor-draft"

/** The theme's name, its variants, and the selected variant's name. */
export function ThemeDetailsFields({
  nameRef,
}: {
  nameRef: RefObject<HTMLInputElement | null>
}) {
  const actions = useThemeEditorActions()
  const { name, variants, nameMissing } = useThemeEditor(
    useShallow((state) => ({
      name: state.draft.name,
      variants: state.draft.variants,
      nameMissing: state.attempted && !state.draft.name.trim(),
    })),
  )
  const selected = useThemeEditor(selectedVariant)
  if (!selected) return null
  const full = variants.length >= MAX_THEME_VARIANTS

  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-3">
      <label htmlFor="theme-editor-name" className="text-sm font-medium">
        Name
      </label>
      <Input
        ref={nameRef}
        id="theme-editor-name"
        value={name}
        maxLength={THEME_NAME_MAX_LENGTH}
        autoComplete="off"
        aria-invalid={nameMissing || undefined}
        onChange={(event) => actions.setName(event.target.value)}
      />
      <span
        id="theme-editor-variants"
        className="self-start pt-1 text-sm font-medium"
      >
        Variants
      </span>
      <div
        role="group"
        aria-labelledby="theme-editor-variants"
        className="flex min-w-0 flex-wrap items-center gap-1"
      >
        {variants.map((variant) => (
          <button
            key={variant.id}
            type="button"
            aria-pressed={variant === selected}
            onClick={() => actions.selectVariant(variant.id)}
            className={cn(
              "focus-visible:ring-ring flex h-7 max-w-full min-w-0 items-center gap-1.5 rounded-md border px-2 text-xs font-medium outline-none transition-colors focus-visible:ring-2",
              variant === selected
                ? "border-accent-border bg-accent-soft text-foreground"
                : "text-muted-foreground hover:text-foreground hover:border-foreground/20",
            )}
          >
            {variant.appearance === "light" ? (
              <SunIcon aria-hidden className="size-3.5 shrink-0" />
            ) : (
              <MoonIcon aria-hidden className="size-3.5 shrink-0" />
            )}
            <span className="truncate">
              {customVariantLabel(variants, variant)}
            </span>
          </button>
        ))}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="Add variant"
                disabled={full}
              >
                <PlusIcon className="size-4" />
              </Button>
            }
          />
          <DropdownMenuContent align="start" sideOffset={6}>
            <DropdownMenuItem onClick={() => actions.addVariant("light")}>
              <SunIcon /> Light
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => actions.addVariant("dark")}>
              <MoonIcon /> Dark
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <label
        htmlFor="theme-editor-variant-name"
        className="text-sm font-medium"
      >
        Variant
      </label>
      <Input
        id="theme-editor-variant-name"
        value={selected.name ?? ""}
        maxLength={THEME_VARIANT_NAME_MAX_LENGTH}
        autoComplete="off"
        placeholder={customVariantLabel(variants, {
          ...selected,
          name: null,
        })}
        onChange={(event) => actions.setVariantName(event.target.value)}
      />
    </div>
  )
}

/**
 * The selected variant's colors: two in the guided mode, every role in
 * Advanced. `fieldRefs` collects the role fields so Inspect can scroll to one.
 */
export function ThemeColorFields({
  fieldRefs,
}: {
  fieldRefs: RefObject<Map<ThemeColorRole, HTMLDivElement>>
}) {
  const actions = useThemeEditorActions()
  const { variantCount, advanced, filter, pickedRole } = useThemeEditor(
    useShallow((state) => ({
      variantCount: state.draft.variants.length,
      advanced: state.draft.advanced,
      filter: state.view.filter,
      pickedRole: state.view.pickedRole,
    })),
  )
  const selected = useThemeEditor(selectedVariant)
  const seed = useThemeEditor((state) => {
    const variant = selectedVariant(state)
    return variant ? state.draft.seeds.get(variant.id) : undefined
  })
  if (!selected) return null
  const { colors } = selected
  const full = variantCount >= MAX_THEME_VARIANTS
  const guided = seed ?? guidedSeed(colors)
  const query = filter.trim().toLowerCase()
  const groups = ROLE_GROUPS.map((group) => ({
    label: group.label,
    roles: group.roles.filter(
      (role) => !query || roleLabel(role).toLowerCase().includes(query),
    ),
  })).filter((group) => group.roles.length > 0)

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="flex-1 text-sm font-medium">Colors</span>
        {advanced && (
          <Input
            value={filter}
            placeholder="Filter"
            aria-label="Filter colors"
            className="h-7 w-28 text-xs md:h-7"
            onChange={(event) => actions.setFilter(event.target.value)}
          />
        )}
        <label className="flex items-center gap-2 text-xs font-medium">
          Advanced
          <Switch
            size="sm"
            checked={advanced}
            onCheckedChange={(next) => actions.setAdvanced(next)}
          />
        </label>
      </div>

      {advanced ? (
        groups.map((group) => (
          <div key={group.label} className="flex flex-col gap-1">
            <h3 className="text-foreground-faint px-1.5 text-xs font-medium">
              {group.label}
            </h3>
            {group.roles.map((role) => (
              <ColorField
                key={role}
                id={`theme-color-${role}`}
                label={roleLabel(role)}
                value={colors[role]}
                highlighted={pickedRole === role}
                fieldRef={(element) => {
                  if (element) fieldRefs.current.set(role, element)
                  else fieldRefs.current.delete(role)
                }}
                onChange={(value) => actions.setRoleColor(role, value)}
              />
            ))}
          </div>
        ))
      ) : (
        <div className="flex flex-col gap-1">
          <p className="text-muted-foreground px-1.5 pb-1 text-xs">
            Pick two colors. Matinee fills in the rest.
          </p>
          <ColorField
            id="theme-guided-background"
            label="Background"
            value={guided.background}
            highlighted={false}
            onChange={(value) => actions.setGuidedColor("background", value)}
          />
          <ColorField
            id="theme-guided-accent"
            label="Accent"
            value={guided.accent}
            highlighted={false}
            onChange={(value) => actions.setGuidedColor("accent", value)}
          />
        </div>
      )}

      <div className="flex flex-wrap gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={full}
          onClick={actions.duplicateVariant}
        >
          <CopyIcon />
          Duplicate variant
        </Button>
        {variantCount > 1 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={actions.removeVariant}
          >
            <Trash2Icon />
            Remove variant
          </Button>
        )}
      </div>
    </div>
  )
}

function ColorField({
  id,
  label,
  value,
  highlighted,
  fieldRef,
  onChange,
}: {
  id: string
  label: string
  value: string
  highlighted: boolean
  fieldRef?: (element: HTMLDivElement | null) => void
  onChange: (value: string) => void
}) {
  return (
    <div
      ref={fieldRef}
      className={cn(
        "flex items-center gap-3 rounded-md px-1.5 py-1 transition-colors",
        highlighted && "bg-accent-soft",
      )}
    >
      <label
        htmlFor={id}
        className="text-muted-foreground min-w-0 flex-1 truncate text-sm"
      >
        {label}
      </label>
      <div className="w-40 shrink-0">
        <HexColorInput
          id={id}
          value={value}
          label={label}
          className="h-8 text-xs md:h-8 [@media(pointer:coarse)]:h-9"
          commit={normalizeThemeColor}
          onChange={(color) => onChange(color.toLowerCase())}
        />
      </div>
    </div>
  )
}
