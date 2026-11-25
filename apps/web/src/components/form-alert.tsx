import { CircleAlert } from "lucide"
import { Show } from "solid-js"

import { Alert, AlertDescription, AlertTitle } from "@/kit/alert"
import { Icon } from "@/kit/icon"

/** An error that stays visible while it blocks the page or form. */
export function FormAlert(props: {
  message: string
  hint?: string
  class?: string
}) {
  return (
    <Alert variant="destructive" class={props.class}>
      <Icon icon={CircleAlert} />
      <AlertTitle class="text-foreground">{props.message}</AlertTitle>
      <Show when={props.hint}>
        <AlertDescription>{props.hint}</AlertDescription>
      </Show>
    </Alert>
  )
}
