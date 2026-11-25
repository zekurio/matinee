import type { MediaItem } from "@matinee/contracts"
import { createSignal } from "solid-js"

/** One menu's dialogs, with accessors retained while they animate closed. */
export function createTitleActionsStore() {
  const [file, setFile] = createSignal<MediaItem | null>(null)
  const [downloading, setDownloading] = createSignal<boolean | null>(null)
  const [titleId, setTitleId] = createSignal<string | null>(null)
  const [identifying, setIdentifying] = createSignal(false)
  const [editingImages, setEditingImages] = createSignal(false)

  return {
    file,
    downloading,
    titleId,
    identifying,
    editingImages,
    setFile,
    setDownloading,
    setTitleId,
    setIdentifying,
    setEditingImages,
  }
}
