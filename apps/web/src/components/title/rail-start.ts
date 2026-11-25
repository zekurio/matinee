/**
 * Starts a rail on its `index`th card rather than its first, as a season's
 * row starts on the episode up next. For the rail's `ref`; it runs once,
 * as the row first lays out.
 */
export function railStart(index: number) {
  return (section: HTMLElement) => {
    if (index <= 0) return
    requestAnimationFrame(() => {
      const list = section.querySelector("ul")
      const card = list?.children[index]
      if (!list || !(card instanceof HTMLElement)) return
      const padding =
        Number.parseFloat(getComputedStyle(list).scrollPaddingLeft) || 0
      list.scrollLeft +=
        card.getBoundingClientRect().left -
        list.getBoundingClientRect().left -
        padding
    })
  }
}
