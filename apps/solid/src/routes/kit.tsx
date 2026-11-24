import { createFileRoute } from "@tanstack/solid-router"
import { Download, Play } from "lucide"
import { For } from "solid-js"

import { Button } from "@/kit/button"
import { KitControls } from "@/kit/gallery/controls"
import { KitOverlays } from "@/kit/gallery/overlays"
import { Icon } from "@/kit/icon"

export const Route = createFileRoute("/kit")({ component: KitGallery })

const VARIANTS = [
  "default",
  "secondary",
  "outline",
  "ghost",
  "destructive",
  "link",
] as const

/** Every kit component on one page, signed in or not. Not linked from the app. */
function KitGallery() {
  return (
    <main class="mx-auto flex max-w-5xl flex-col gap-10 p-8">
      <h1 class="text-2xl font-bold">Kit</h1>
      <section class="flex flex-col gap-3">
        <h2 class="text-lg font-semibold">Button</h2>
        <div class="flex flex-wrap items-center gap-2">
          <For each={VARIANTS}>
            {(variant) => <Button variant={variant}>{variant}</Button>}
          </For>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <Button size="xs">xs</Button>
          <Button size="sm">sm</Button>
          <Button>default</Button>
          <Button size="lg">
            <Icon icon={Play} />
            Play
          </Button>
          <Button size="icon" variant="secondary" aria-label="Download">
            <Icon icon={Download} />
          </Button>
          <Button disabled>disabled</Button>
          <Button
            onClick={() => new Promise((resolve) => setTimeout(resolve, 1500))}
          >
            pending for 1.5s
          </Button>
        </div>
      </section>
      <KitControls />
      <KitOverlays />
    </main>
  )
}
