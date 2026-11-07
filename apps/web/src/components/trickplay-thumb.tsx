import type { Trickplay } from "@matinee/contracts"
import { cn } from "@matinee/ui/lib/utils"

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
export function TrickplayThumb({
  tiles,
  time,
  className,
}: {
  tiles: TrickplayTiles
  time: number
  className?: string
}) {
  const { images } = tiles
  const index = Math.min(
    images.count - 1,
    Math.max(0, Math.round(time / images.intervalSeconds)),
  )
  const perTile = images.columns * images.rows
  const cell = index % perTile
  const column = cell % images.columns
  const row = Math.floor(cell / images.columns)
  return (
    <span
      aria-hidden
      className={cn("block bg-black bg-no-repeat", className)}
      style={{
        aspectRatio: `${images.width} / ${images.height}`,
        backgroundImage: `url("${tiles.src(Math.floor(index / perTile))}")`,
        backgroundSize: `${images.columns * 100}% ${images.rows * 100}%`,
        backgroundPosition: `${cellPosition(column, images.columns)} ${cellPosition(row, images.rows)}`,
      }}
    />
  )
}
