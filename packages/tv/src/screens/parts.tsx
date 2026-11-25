import type { JSX } from "@solidjs/web"
import { RefreshCw } from "lucide"
import { Match, Switch } from "solid-js"

import { Page, type Start } from "../app/page"
import { tr } from "../i18n"
import { Spinner } from "../kit/base"
import { Button } from "../kit/buttons"
import type { Load } from "../model/loader"

/** A page as one message, with Try again where there's a way to. */
export function Message(props: {
  title: string
  message?: string | null
  retry?: (() => void) | null
}) {
  return (
    <Page class="page fill message" start={() => ["message", "retry"]}>
      <div class="t-headline">{props.title}</div>
      {props.message && <div class="t-body muted">{props.message}</div>}
      {props.retry && (
        <div data-fg="message" data-fk="row">
          <Button
            fid="retry"
            label={tr("commonRetry")}
            icon={RefreshCw}
            onPress={() => props.retry?.()}
          />
        </div>
      )}
    </Page>
  )
}

/**
 * A page that has nothing to show but its load: a spinner while it loads,
 * why it failed with Try again, or `children` once it's there.
 */
export function Loaded<T>(props: {
  load: Load<T>
  error: string
  retry: () => void
  children: (value: T) => JSX.Element
}) {
  return (
    <Switch>
      <Match when={props.load.kind === "loading"}>
        <Page class="page fill center">
          <Spinner size={36} class="muted" />
        </Page>
      </Match>
      <Match when={props.load.kind === "failed" ? props.load : null} keyed>
        {(load) => (
          <Message
            title={props.error}
            message={load.message}
            retry={props.retry}
          />
        )}
      </Match>
      <Match when={props.load.kind === "ready" ? props.load.value : null} keyed>
        {(value) => props.children(value)}
      </Match>
    </Switch>
  )
}

export type { Start }
