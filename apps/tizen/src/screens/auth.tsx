import type { AuthConfig, DeviceCode } from "@matinee/contracts"
import { ArrowLeft, LogIn, Plus, RefreshCw, Server, Trash, X } from "lucide"
import type { ComponentChildren } from "preact"
import { useEffect, useRef, useState } from "preact/hooks"

import { isServerError } from "@/api/errors"
import { Page } from "@/app/page"
import { hostOf, type SavedServer, session } from "@/auth/session"
import { tr } from "@/i18n"
import { focusOn } from "@/input/focus"
import { useBack } from "@/input/navigation"
import { Spinner } from "@/kit/base"
import { ListItem } from "@/kit/buttons"
import { Field } from "@/kit/fields"
import { QrCode } from "@/kit/misc"
import { SidePanel } from "@/kit/panel"
import { useObserved } from "@/lib/observable"

import { Logo, LogoMark } from "./brand"

/**
 * A TV screen before signing in, laid out as Google TV's setup: the logo
 * at the top left, what this step is about on the left, and the things to
 * pick on the right, both centred down the screen. `side` takes the
 * left's room under the heading, like a code to type; `split` is how much
 * of the width the left gets, in percent.
 */
function AuthFrame(props: {
  title: string
  description: string | null
  split?: number
  start?: () => readonly [string, string] | null | undefined
  side?: ComponentChildren
  children: ComponentChildren
}) {
  const split = props.split ?? 42
  return (
    <Page class="auth fill" start={props.start}>
      <div class="auth-brand">
        <Logo height={24} />
      </div>
      <div class="auth-left" style={{ width: `${split}%` }}>
        <div class="t-display">{props.title}</div>
        {props.description && (
          <div class="t-body muted" style={{ marginTop: "12rem" }}>
            {props.description}
          </div>
        )}
        {props.side}
      </div>
      <div class="auth-right">{props.children}</div>
    </Page>
  )
}

/** A short message under a list, such as what went wrong. */
function AuthNote(props: { text: string; danger?: boolean }) {
  return (
    <div
      class={
        props.danger ? "auth-note t-body danger" : "auth-note t-body muted"
      }
    >
      {props.text}
    </div>
  )
}

/** Checking the saved server and session, as the app starts. */
export function Connecting(props: { server: string }) {
  return (
    <div class="fill center" style={{ flexDirection: "column" }}>
      <LogoMark size={72} />
      <Spinner size={32} class="muted connecting-spinner" />
      <div class="t-body muted">
        {tr("connect_connecting", hostOf(props.server))}
      </div>
    </div>
  )
}

/**
 * Typing the server's address with the TV's keyboard. A Samsung TV can't
 * look for servers on its network, as the Android TV app does, so this is
 * the whole of picking one.
 */
export function Connect(props: { canCancel: boolean }) {
  const [address, setAddress] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Adding a server: Back returns to the one in use, as it was.
  useBack(() => session.cancelAdd(), props.canCancel)
  const connect = () => {
    if (busy) return
    setBusy(true)
    setError(null)
    void session.connect(address).then((failure) => {
      setError(failure)
      setBusy(false)
    })
  }
  const current = session.server
  return (
    <AuthFrame
      title={tr("connect_title")}
      description={tr("connect_description")}
      start={() => ["rows", "address"]}
    >
      <div class="auth-rows" data-fg="rows" data-fk="col">
        <Field
          fid="address"
          class="text t-title"
          type="url"
          value={address}
          onChange={(value) => {
            setAddress(value)
            setError(null)
          }}
          placeholder={tr("connect_placeholder")}
          onDone={connect}
        />
        {error && <AuthNote text={error} danger />}
        <ListItem
          fid="connect"
          title={tr("connect_button")}
          icon={LogIn}
          onPress={connect}
          trailing={busy ? <Spinner size={22} /> : undefined}
        />
        {props.canCancel && current && (
          <ListItem
            fid="back"
            title={tr("servers_back_to", hostOf(current))}
            icon={ArrowLeft}
            quiet
            onPress={() => session.cancelAdd()}
          />
        )}
      </div>
    </AuthFrame>
  )
}

/**
 * The saved server didn't answer: what happened and why on the left, and
 * Retry, focused, over the way to the server list on the right. The app
 * also tries again when the network comes back.
 */
export function Unreachable(props: {
  server: string
  offline: boolean
  retrying: boolean
}) {
  const [switching, setSwitching] = useState(false)
  const host = hostOf(props.server)
  return (
    <>
      <AuthFrame
        title={tr(
          props.offline ? "unreachable_offline_title" : "unreachable_title",
        )}
        description={
          props.offline
            ? tr("unreachable_offline")
            : tr("unreachable_other", host)
        }
        start={() => ["rows", "retry"]}
        side={
          <div class="t-label muted" style={{ marginTop: "36rem" }}>
            {props.server}
          </div>
        }
      >
        <div class="auth-rows" data-fg="rows" data-fk="col">
          <ListItem
            fid="retry"
            title={tr(
              props.retrying ? "tv_unreachable_retrying" : "common_retry",
            )}
            icon={RefreshCw}
            // While it tries, Select waits for the answer.
            onPress={() => {
              if (!props.retrying) session.start()
            }}
            trailing={props.retrying ? <Spinner size={22} /> : undefined}
          />
          <ListItem
            fid="change"
            title={tr("connect_change_server")}
            icon={Server}
            quiet
            onPress={() => setSwitching(true)}
          />
        </div>
      </AuthFrame>
      <ServerPanel open={switching} onClose={() => setSwitching(false)} />
    </>
  )
}

type CodeFlow = {
  code: DeviceCode | null
  error: string | null
  expired: boolean
  newCode: () => void
}

/**
 * Starts the device grant and polls until someone signed in approves this
 * TV, then signs the session in. A code that runs out waits for a new one
 * to be asked for, so a TV left here doesn't keep asking the server for
 * codes. A poll that fails tries again on its own.
 */
function useDeviceCode(): CodeFlow {
  const [attempt, setAttempt] = useState(0)
  const [code, setCode] = useState<DeviceCode | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [expired, setExpired] = useState(false)
  useEffect(() => {
    let over = false
    let timer = 0
    const api = session.signInApi
    setError(null)
    setExpired(false)
    setCode(null)
    const poll = (started: DeviceCode) => {
      timer = window.setTimeout(() => {
        api.auth.device.poll({ deviceCode: started.deviceCode }).then(
          (answer) => {
            if (over) return
            setError(null)
            if (answer.status === "approved") {
              session.signedIn(answer.token, answer.user)
            } else poll(started)
          },
          (cause: unknown) => {
            if (over) return
            // The code expired.
            if (isServerError(cause) && cause.status === 404) {
              setCode(null)
              setExpired(true)
              return
            }
            // Too soon, as when other TVs behind the same address poll
            // too: nothing's wrong, so it waits and asks again.
            if (isServerError(cause) && cause.status === 429) {
              poll(started)
              return
            }
            // The network dropping: keep asking about the same code,
            // which someone may have approved meanwhile.
            setError(session.describe(cause))
            poll(started)
          },
        )
      }, started.interval * 1000)
    }
    api.auth.device.start(session.device).then(
      (started) => {
        if (over) return
        setCode(started)
        poll(started)
      },
      (cause: unknown) => {
        if (!over) setError(session.describe(cause))
      },
    )
    return () => {
      over = true
      window.clearTimeout(timer)
    }
  }, [attempt])
  return { code, error, expired, newCode: () => setAttempt(attempt + 1) }
}

const QR_SIZE = 272

/**
 * Signing a TV in with a code, the only way it has: the QR code to scan
 * on the right, large enough for a phone across the room, and on the left
 * the address and the code to type there, read from the couch.
 */
export function SignIn(props: {
  server: string
  config: AuthConfig
  adding: boolean
}) {
  const flow = useDeviceCode()
  const { code } = flow
  const [switching, setSwitching] = useState(false)
  // A code that ran out, or never came, puts focus on getting one; else the one way out.
  const stuck = flow.expired || (code === null && flow.error !== null)
  const frame = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const row = frame.current?.querySelector<HTMLElement>(
      `[data-f="${stuck ? "again" : "way"}"]`,
    )
    if (!switching) focusOn(row)
  }, [stuck])
  // A server being added: Back goes to typing another.
  useBack(() => session.addServer(), props.adding)
  const current = props.adding ? session.server : null
  return (
    <div ref={frame} class="fill">
      <AuthFrame
        title={tr("tv_signin_title")}
        // A server not set up yet can't approve anyone; its setup runs in a browser.
        description={tr(
          props.config.setup ? "signin_setup" : "tv_signin_description",
        )}
        split={56}
        start={() => ["rows", stuck ? "again" : "way"]}
        side={
          <div style={{ marginTop: "28rem" }}>
            {code ? (
              <>
                <div class="t-facts dim85">
                  {tr("tv_signin_enter", hostOf(code.verificationUri))}
                </div>
                <div class="t-code one-line" style={{ marginTop: "8rem" }}>
                  {code.userCode}
                </div>
                <div class="auth-waiting t-body muted">
                  <Spinner size={18} />
                  <span>{tr("signin_code_waiting")}</span>
                </div>
              </>
            ) : flow.expired ? (
              <div class="t-title">{tr("tv_signin_expired")}</div>
            ) : (
              flow.error === null && (
                <div class="t-body muted">{tr("signin_code_loading")}</div>
              )
            )}
            {flow.error && (
              <div class="t-body danger" style={{ marginTop: "12rem" }}>
                {flow.error}
              </div>
            )}
            <div class="auth-rows narrow" data-fg="rows" data-fk="col">
              {stuck && (
                <ListItem
                  fid="again"
                  title={tr(
                    flow.expired ? "tv_signin_new_code" : "common_retry",
                  )}
                  icon={RefreshCw}
                  onPress={flow.newCode}
                />
              )}
              {current ? (
                <ListItem
                  fid="way"
                  title={tr("servers_back_to", hostOf(current))}
                  subtitle={hostOf(props.server)}
                  icon={ArrowLeft}
                  quiet
                  onPress={() => session.cancelAdd()}
                />
              ) : (
                <ListItem
                  fid="way"
                  title={tr("connect_change_server")}
                  subtitle={hostOf(props.server)}
                  icon={Server}
                  quiet
                  onPress={() => setSwitching(true)}
                />
              )}
            </div>
          </div>
        }
      >
        <div class="center">
          {code ? (
            <QrCode
              text={code.verificationUriComplete}
              label={tr("signin_code_qr", code.userCode)}
              size={QR_SIZE}
            />
          ) : (
            <div class="auth-qr center">
              {flow.expired ? (
                <span class="t-title muted">
                  {tr("tv_signin_expired_short")}
                </span>
              ) : (
                flow.error === null && <Spinner size={32} />
              )}
            </div>
          )}
        </div>
      </AuthFrame>
      <ServerPanel open={switching} onClose={() => setSwitching(false)} />
    </div>
  )
}

function serverFacts(server: SavedServer): string {
  return server.userName
    ? tr("servers_signed_in_as", server.userName)
    : tr("servers_signed_out")
}

type ServerStep =
  | { kind: "list" }
  | { kind: "remove" }
  | { kind: "confirm"; origin: string }

/**
 * The saved servers in the right-edge panel, the one in use checked and
 * focused. Select on another switches to it, signed in still where its
 * session stands. Add server goes to typing one, which Back leaves again.
 * Remove a server turns the panel to picking one, then to asking, focused
 * on Cancel; Back goes a step back, then closes.
 */
export function ServerPanel(props: { open: boolean; onClose: () => void }) {
  const { servers, server: active } = useObserved(session)
  const [step, setStep] = useState<ServerStep>({ kind: "list" })
  // Each time it opens, it starts at the list.
  useEffect(() => {
    if (props.open) setStep({ kind: "list" })
  }, [props.open])
  const asked =
    step.kind === "confirm"
      ? servers.find((server) => server.origin === step.origin)
      : undefined
  const back = () => {
    if (step.kind === "list") props.onClose()
    else setStep(step.kind === "remove" ? { kind: "list" } : { kind: "remove" })
  }
  const title = asked
    ? tr("servers_remove_title", hostOf(asked.origin))
    : step.kind === "remove"
      ? tr("tv_servers_remove")
      : tr("servers_title")
  const description = asked
    ? tr("servers_remove_body_tv")
    : step.kind === "remove"
      ? tr("tv_servers_remove_description")
      : null
  return (
    <SidePanel
      open={props.open}
      title={title}
      description={description}
      onBack={back}
      initial={
        step.kind === "list"
          ? (active ?? "add")
          : step.kind === "confirm"
            ? "cancel"
            : undefined
      }
      focusKey={step.kind}
    >
      {step.kind === "list" && (
        <>
          {servers.map((server) => (
            <ListItem
              key={server.origin}
              fid={server.origin}
              title={hostOf(server.origin)}
              subtitle={serverFacts(server)}
              subtitleLabel
              icon={Server}
              quiet
              checked={server.origin === active}
              minHeight={72}
              onPress={() => {
                props.onClose()
                if (server.origin !== active) session.switchTo(server.origin)
              }}
            />
          ))}
          <ListItem
            fid="add"
            title={tr("servers_add")}
            icon={Plus}
            quiet
            onPress={() => {
              props.onClose()
              session.addServer()
            }}
          />
          {servers.length > 0 && (
            <ListItem
              fid="remove"
              title={tr("tv_servers_remove")}
              icon={Trash}
              quiet
              destructive
              onPress={() => setStep({ kind: "remove" })}
            />
          )}
        </>
      )}
      {step.kind === "remove" &&
        servers.map((server) => (
          <ListItem
            key={server.origin}
            fid={server.origin}
            title={hostOf(server.origin)}
            subtitle={serverFacts(server)}
            subtitleLabel
            icon={Server}
            quiet
            minHeight={72}
            onPress={() => setStep({ kind: "confirm", origin: server.origin })}
          />
        ))}
      {step.kind === "confirm" && (
        <>
          <ListItem
            fid="confirm"
            title={tr("common_remove")}
            icon={Trash}
            quiet
            destructive
            onPress={() => {
              if (asked) session.removeServer(asked.origin)
              setStep({ kind: "list" })
            }}
          />
          <ListItem
            fid="cancel"
            title={tr("common_cancel")}
            icon={X}
            quiet
            onPress={() => setStep({ kind: "remove" })}
          />
        </>
      )}
    </SidePanel>
  )
}
