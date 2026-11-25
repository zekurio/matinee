import type { JSX } from "@solidjs/web"
/** A Lucide icon as `lucide` exports it: `import { House } from "lucide"`. */
export type IconNode = readonly (readonly [
  tag: string,
  attributes: { readonly [name: string]: string | number | undefined },
])[]

const ESCAPES = new Map([
  ["&", "&amp;"],
  ['"', "&quot;"],
  ["<", "&lt;"],
])

/** What the icon draws, as markup, made once per icon. */
const markup = new WeakMap<IconNode, string>()

function drawing(icon: IconNode): string {
  let made = markup.get(icon)
  if (made === undefined) {
    made = icon
      .map(([tag, attributes]) => {
        const written = Object.entries(attributes)
          .filter(([, value]) => value !== undefined)
          .map(
            ([name, value]) =>
              ` ${name}="${String(value).replace(/[&"<]/g, (character) => ESCAPES.get(character) ?? character)}"`,
          )
          .join("")
        return `<${tag}${written}/>`
      })
      .join("")
    markup.set(icon, made)
  }
  return made
}

type IconProps = {
  icon: IconNode
  class?: JSX.SvgSVGAttributes<SVGSVGElement>["class"]
  /** Lucide draws with 2. */
  "stroke-width"?: number | string
  /** `currentColor` for a solid icon. */
  fill?: string
  "aria-label"?: string
  role?: JSX.AriaAttributes["role"]
  "data-slot"?: string
  "data-icon"?: string
}

/**
 * A Lucide icon, 16px unless a `size-*` class says otherwise, in the text
 * color. Decorative unless it gets an `aria-label`.
 *
 * `lucide` holds each icon as data, so only the ones imported are bundled,
 * and its shapes go in as one string rather than an element each.
 *
 * It takes the props listed and no spread. A spread would make Solid set
 * every attribute below one call at a time for each icon on the page,
 * where it now clones them with the element.
 */
export function Icon(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
      fill={props.fill ?? "none"}
      stroke-width={props["stroke-width"] ?? 2}
      aria-hidden={props["aria-label"] === undefined ? "true" : undefined}
      aria-label={props["aria-label"]}
      role={
        props.role ?? (props["aria-label"] === undefined ? undefined : "img")
      }
      data-slot={props["data-slot"]}
      data-icon={props["data-icon"]}
      class={props.class}
      innerHTML={drawing(props.icon)}
    />
  )
}
