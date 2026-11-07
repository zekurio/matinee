import { Button } from "@matinee/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@matinee/ui/components/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@matinee/ui/components/tooltip"
import {
  selectThemeFamily,
  selectThemeVariant,
  themeVariantColors,
  type ThemeState,
} from "@matinee/ui/lib/theme"
import {
  THEME_APPEARANCES,
  type ThemeAppearance,
  type ThemeColors,
} from "@matinee/ui/lib/theme-colors"
import {
  serializeThemeFile,
  type CustomTheme,
} from "@matinee/ui/lib/theme-custom"
import type { ThemeFamily, ThemeVariant } from "@matinee/ui/lib/theme-presets"
import { cn } from "@matinee/ui/lib/utils"
import {
  CopyIcon,
  DownloadIcon,
  MoonIcon,
  MoreHorizontalIcon,
  PencilIcon,
  SunIcon,
  TextCursorInputIcon,
  Trash2Icon,
} from "lucide-react"

import { downloadTextFile } from "@/lib/download"

import { variantShortName } from "./theme-seeds"

/**
 * A theme as a paint chip: one striped swatch per variant across the top,
 * then its name and the variants it currently lends to light and dark mode.
 */
export function ThemeCard({
  family,
  theme,
  custom,
  onDuplicate,
  onEdit,
  onRename,
  onDelete,
}: {
  family: ThemeFamily
  theme: ThemeState
  /** The editable theme behind a custom card; null for bundled ones. */
  custom: CustomTheme | null
  onDuplicate: () => void
  onEdit: (theme: CustomTheme) => void
  onRename: (theme: CustomTheme) => void
  onDelete: (theme: CustomTheme) => void
}) {
  const shownId = theme[theme.appearance].id
  const used = THEME_APPEARANCES.flatMap((appearance) => {
    const variant = theme[appearance]
    return family.variants.includes(variant) ? [{ appearance, variant }] : []
  })

  return (
    <div
      className={cn(
        "bg-foreground/[0.02] relative flex min-w-0 flex-col overflow-hidden rounded-xl border transition-colors",
        used.length > 0 ? "border-accent-border" : "hover:border-foreground/20",
      )}
    >
      <button
        type="button"
        aria-pressed={used.length > 0}
        aria-label={`Use ${family.label} for light and dark`}
        onClick={() => selectThemeFamily(family.id)}
        className="focus-visible:ring-ring absolute inset-0 rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-inset"
      />
      <div className="bg-border pointer-events-none relative flex h-16 gap-px border-b">
        {family.variants.map((variant) => (
          <ThemeSwatch
            key={variant.id}
            label={swatchLabel(family, variant)}
            colors={themeVariantColors(theme, variant)}
            slot={
              theme[variant.appearance].id === variant.id
                ? variant.appearance
                : null
            }
            shown={shownId === variant.id}
            onSelect={() => selectThemeVariant(variant.id)}
          />
        ))}
      </div>
      <div className="pointer-events-none relative flex items-center gap-2 py-2 pr-2 pl-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{family.label}</p>
          <p className="text-muted-foreground flex min-w-0 items-center gap-2.5 text-xs">
            {used.length > 0
              ? used.map(({ appearance, variant }) => (
                  <span
                    key={appearance}
                    className="flex min-w-0 items-center gap-1"
                  >
                    {appearance === "light" ? (
                      <SunIcon aria-hidden className="size-3 shrink-0" />
                    ) : (
                      <MoonIcon aria-hidden className="size-3 shrink-0" />
                    )}
                    <span className="truncate">
                      {variantShortName(family, variant)}
                    </span>
                  </span>
                ))
              : family.variants.length === 1
                ? "1 variant"
                : `${family.variants.length} variants`}
          </p>
        </div>
        {custom ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`${family.label} actions`}
                  className="pointer-events-auto"
                >
                  <MoreHorizontalIcon />
                </Button>
              }
            />
            <DropdownMenuContent align="end" sideOffset={6}>
              <DropdownMenuItem onClick={() => onEdit(custom)}>
                <PencilIcon /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onRename(custom)}>
                <TextCursorInputIcon /> Rename
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDuplicate}>
                <CopyIcon /> Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportTheme(custom)}>
                <DownloadIcon /> Export
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => onDelete(custom)}
              >
                <Trash2Icon /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Duplicate ${family.label}`}
                  className="pointer-events-auto"
                  onClick={onDuplicate}
                >
                  <CopyIcon />
                </Button>
              }
            />
            <TooltipContent>Duplicate</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  )
}

/**
 * One variant as diagonal bands of its key colors, with its status colors as
 * dots in the corner. The chip marks the mode it's used for, filled with the
 * accent while it's the one on screen.
 */
function ThemeSwatch({
  label,
  colors,
  slot,
  shown,
  onSelect,
}: {
  label: string
  colors: ThemeColors
  slot: ThemeAppearance | null
  shown: boolean
  onSelect: () => void
}) {
  const description =
    slot === "light"
      ? `${label}, used in light mode`
      : slot === "dark"
        ? `${label}, used in dark mode`
        : label

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={description}
            aria-pressed={slot !== null}
            onClick={onSelect}
            style={{ backgroundImage: swatchStripes(colors) }}
            className="pointer-events-auto relative min-w-0 flex-1 transition-shadow outline-none hover:shadow-[inset_0_0_0_2px_color-mix(in_oklab,var(--foreground)_40%,transparent)] focus-visible:shadow-[inset_0_0_0_2px_var(--ring)]"
          >
            <span
              aria-hidden
              className="absolute top-1.5 right-1.5 flex gap-[3px]"
            >
              {STATUS_DOT_ROLES.map((role) => (
                <span
                  key={role}
                  className="size-1.75 rounded-full"
                  style={{
                    background: colors[role],
                    boxShadow: `0 0 0 1px ${colors.background}`,
                  }}
                />
              ))}
            </span>
            {slot && (
              <span
                aria-hidden
                className={cn(
                  "absolute bottom-1.5 left-1.5 grid size-5 place-items-center rounded-full shadow-sm",
                  shown
                    ? "bg-accent text-accent-foreground"
                    : "bg-background/85 text-foreground",
                )}
              >
                {slot === "light" ? (
                  <SunIcon className="size-3" strokeWidth={2.5} />
                ) : (
                  <MoonIcon className="size-3" strokeWidth={2.5} />
                )}
              </span>
            )}
          </button>
        }
      />
      <TooltipContent>{description}</TooltipContent>
    </Tooltip>
  )
}

const STATUS_DOT_ROLES = [
  "success",
  "warning",
  "danger",
] as const satisfies readonly (keyof ThemeColors)[]

/**
 * Background, accent, and text as diagonal bands. Each edge blends over a
 * fraction of a percent so the diagonal doesn't render as steps.
 */
function swatchStripes(colors: ThemeColors): string {
  const bands: readonly (readonly [string, number])[] = [
    [colors.background, 50],
    [colors.accent, 75],
    [colors.text, 100],
  ]
  const edge = 0.4
  let from = 0
  const stops = bands.map(([color, to], index) => {
    const start = index === 0 ? 0 : from + edge
    const end = to === 100 ? 100 : to - edge
    from = to
    return `${color} ${start}% ${end}%`
  })
  return `linear-gradient(135deg, ${stops.join(", ")})`
}

function swatchLabel(family: ThemeFamily, variant: ThemeVariant): string {
  return family.custom ? `${family.label} (${variant.label})` : variant.label
}

function exportTheme(custom: CustomTheme) {
  const slug =
    custom.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "theme"
  downloadTextFile(serializeThemeFile(custom), `${slug}.matinee-theme.json`)
}
