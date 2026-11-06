/**
 * Shared look and timing for every modal layer: dialogs, alert dialogs, and
 * the settings sheet. Change them here, not per component.
 */

/**
 * Backdrops tint the page with the theme background and blur it, so what
 * sits underneath stays visible as context instead of dropping to black.
 */
export const MODAL_OVERLAY_CLASS_NAME = "bg-background/60 backdrop-blur-xs"

/**
 * Base UI drops the backdrop of a modal opened inside another one. We want
 * the opposite: a confirm over Settings dims Settings, so every backdrop
 * renders regardless of nesting.
 */
export const MODAL_OVERLAY_FORCE_RENDER = true

/**
 * A settled entrance and a quicker exit, shared by backdrop and popup so the
 * two move together. Uses tw-animate's `animation-duration-*`, not
 * `duration-*`, which would also transition every property on resize.
 */
export const MODAL_MOTION_CLASS_NAME =
  "animation-duration-200 data-open:ease-out data-closed:animation-duration-150 data-closed:ease-in motion-reduce:animate-none"
