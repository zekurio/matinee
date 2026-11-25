import type { Trickplay } from "@matinee/contracts"
import { cn } from "@matinee/ui/lib/utils"
import { createMemo } from "solid-js"

/** A file's trickplay images and where their tiles load from. */
export type TrickplayTiles = {
  images: Trickplay
  src: (tile: number) => string
}

/**
 * A cell's place along a tile as a background position: 0% puts the first
 * cell in view, 100% the last.
 */
function cellPosition(cell: number, cells: number): string {
  return cells > 1 ? `${(cell / (cells - 1)) * 100}%` : "0%"
}

/**
 * The thumbnail nearest `time`, cut from its tile by the background
 * position, so it fills whatever width the class gives it. Black until the
 * tile loads.
 */
export function TrickplayThumb(props: {
  tiles: TrickplayTiles
  time: number
  class?: string
}) {
  const style = createMemo(() => {
    const { images } = props.tiles
    const index = Math.min(
      images.count - 1,
      Math.max(0, Math.round(props.time / images.intervalSeconds)),
    )
    const perTile = images.columns * images.rows
    const cell = index % perTile
    const column = cell % images.columns
    const row = Math.floor(cell / images.columns)
    return {
      "aspect-ratio": `${images.width} / ${images.height}`,
      "background-image": `url("${props.tiles.src(Math.floor(index / perTile))}")`,
      "background-size": `${images.columns * 100}% ${images.rows * 100}%`,
      "background-position": `${cellPosition(column, images.columns)} ${cellPosition(row, images.rows)}`,
    }
  })
  return (
    <span
      aria-hidden="true"
      class={cn("block bg-black bg-no-repeat", props.class)}
      style={style()}
    />
  )
}
