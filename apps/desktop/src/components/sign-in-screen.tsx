import type { SignInMethod } from "@matinee/desktop-bridge"
import { Button } from "@matinee/ui/components/button"
import { Separator } from "@matinee/ui/components/separator"
import { Spinner } from "@matinee/ui/components/spinner"
import {
  ArrowLeftIcon,
  CheckIcon,
  CopyIcon,
  GlobeIcon,
  QrCodeIcon,
  RefreshCwIcon,
} from "lucide-react"
import { useEffect, useState, useSyncExternalStore } from "react"

import { tr } from "@/i18n"
import { trRich } from "@/i18n/react"
import { hostOf, minutesAndSeconds, withoutScheme } from "@/lib/format"
import { type SignIn, useApp } from "@/stores/app"

import { Page, ServerCard, Waiting } from "./frame"
import { QrCode } from "./qr-code"

type CodeSignIn = Extract<SignIn, { phase: "code" }>
type FailedSignIn = Extract<SignIn, { phase: "failed" }>

/** Signing in to the server at `url`, from choosing how to the end. */
export function SignInScreen({ url }: { url: string }) {
  const signIn = useApp((state) => state.signIn)
  const leave = useApp((state) => state.leaveSignIn)
  const host = hostOf(url)

  // Escape, or a remote's Back, leaves for where the sign-in started.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" && event.key !== "BrowserBack") return
      if (event.defaultPrevented) return
      event.preventDefault()
      leave()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [leave])

  switch (signIn.phase) {
    case "choose":
    case "starting":
      return (
        <Choose
          host={host}
          starting={signIn.phase === "starting" ? signIn.method : null}
        />
      )
    case "browser":
      return <Browser url={signIn.url} />
    case "code":
      // A new code starts its countdown afresh.
      return <Code key={signIn.userCode} signIn={signIn} />
    case "approved":
      return (
        <Page
          title={tr("signIn.approved")}
          description={tr("signIn.approvedDescription", {
            host: hostOf(signIn.server.url),
          })}
        >
          <ServerCard server={signIn.server} />
        </Page>
      )
    case "failed":
      return <Failed host={host} signIn={signIn} />
  }
}

function BackButton() {
  const leave = useApp((state) => state.leaveSignIn)
  return (
    <Button
      variant="ghost"
      size="lg"
      className="text-muted-foreground mt-2"
      onClick={leave}
    >
      <ArrowLeftIcon />
      {tr("signIn.back")}
    </Button>
  )
}

function CancelButton() {
  const leave = useApp((state) => state.leaveSignIn)
  return (
    <Button
      variant="ghost"
      size="lg"
      className="text-muted-foreground"
      onClick={leave}
    >
      {tr("signIn.cancel")}
    </Button>
  )
}

/** The two ways in: the browser, and a code for a computer without a keyboard. */
function Choose({
  host,
  starting,
}: {
  host: string
  starting: SignInMethod | null
}) {
  const start = useApp((state) => state.startSignIn)
  return (
    <Page title={tr("signIn.title")} description={tr("signIn.on", { host })}>
      <div className="flex flex-col gap-3">
        <Button
          size="lg"
          data-primary
          disabled={starting !== null}
          onClick={() => void start("browser")}
        >
          {starting === "browser" ? <Spinner /> : <GlobeIcon />}
          {tr("signIn.browser")}
        </Button>
        <p className="text-muted-foreground text-13px text-pretty">
          {tr("signIn.browserHint")}
        </p>
        <Separator className="my-3" />
        <Button
          variant="outline"
          size="lg"
          disabled={starting !== null}
          onClick={() => void start("code")}
        >
          {starting === "code" ? <Spinner /> : <QrCodeIcon />}
          {tr("signIn.code")}
        </Button>
        <p className="text-muted-foreground text-13px text-pretty">
          {tr("signIn.codeHint")}
        </p>
        <BackButton />
      </div>
    </Page>
  )
}

const COPIED_MS = 2000

/** Waiting for the browser, with its page to open by hand should none have. */
function Browser({ url }: { url: string }) {
  const start = useApp((state) => state.startSignIn)
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      return
    }
    setCopied(true)
    setTimeout(() => setCopied(false), COPIED_MS)
  }

  return (
    <Page
      title={tr("signIn.browserTitle")}
      description={tr("signIn.browserDescription")}
    >
      <div className="flex flex-col gap-8">
        <Waiting>{tr("signIn.waiting")}</Waiting>
        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground text-13px">
            {tr("signIn.noBrowser")}
          </p>
          <div className="flex items-start gap-2">
            <p className="bg-field text-13px min-w-0 flex-1 rounded-lg border px-3 py-1.5 font-mono break-all select-all">
              {url}
            </p>
            <Button variant="outline" size="sm" onClick={() => void copy()}>
              {copied ? <CheckIcon /> : <CopyIcon />}
              {copied ? tr("signIn.copied") : tr("signIn.copy")}
            </Button>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <Button
            variant="outline"
            size="lg"
            data-primary
            onClick={() => void start("code")}
          >
            <QrCodeIcon />
            {tr("signIn.useCode")}
          </Button>
          <CancelButton />
        </div>
      </div>
    </Page>
  )
}

/** The current time, every second, while a code counts down. */
function useNow(): number {
  return useSyncExternalStore(subscribeSeconds, readNow)
}

let now = Date.now()
function readNow(): number {
  return now
}
function subscribeSeconds(listener: () => void): () => void {
  now = Date.now()
  const timer = setInterval(() => {
    now = Date.now()
    listener()
  }, 1000)
  return () => clearInterval(timer)
}

/**
 * A code to approve elsewhere: big enough to read from the couch, the
 * page to enter it on, its QR code, and how long it still works.
 */
function Code({ signIn }: { signIn: CodeSignIn }) {
  const start = useApp((state) => state.startSignIn)
  const left = Math.max(0, signIn.expiresAt - useNow())
  const expired = left === 0
  const share = signIn.lifetime > 0 ? Math.min(1, left / signIn.lifetime) : 0

  return (
    <Page
      wide
      title={tr("signIn.codeTitle")}
      description={tr("signIn.codeDescription")}
    >
      <div className="flex flex-col-reverse items-start gap-10 sm:flex-row sm:items-center sm:gap-16">
        <div className="flex min-w-0 flex-col gap-6">
          {expired ? (
            <p className="text-2xl font-semibold">{tr("signIn.codeExpired")}</p>
          ) : (
            <div>
              <p className="text-muted-foreground text-sm">
                {trRich("signIn.codeEnter", {
                  address: (
                    <span className="text-foreground font-medium">
                      {withoutScheme(signIn.verificationUri)}
                    </span>
                  ),
                })}
              </p>
              <p className="mt-2 font-mono text-5xl font-semibold tracking-wider tabular-nums sm:text-6xl">
                {signIn.userCode}
              </p>
            </div>
          )}
          {!expired && (
            <div className="flex flex-col gap-2">
              <div
                aria-hidden
                className="bg-secondary h-1 w-full max-w-64 overflow-hidden rounded-full"
              >
                <div
                  className="bg-primary h-full origin-left rounded-full"
                  style={{ transform: `scaleX(${share})` }}
                />
              </div>
              <p className="text-muted-foreground text-13px tabular-nums">
                {tr("signIn.expiresIn", {
                  time: minutesAndSeconds(left / 1000),
                })}
              </p>
            </div>
          )}
          {!expired && <Waiting>{tr("signIn.waiting")}</Waiting>}
          <div className="flex flex-col items-start gap-3">
            {expired && (
              <Button size="lg" data-primary onClick={() => void start("code")}>
                <RefreshCwIcon />
                {tr("signIn.newCode")}
              </Button>
            )}
            <Button
              variant="outline"
              size="lg"
              data-primary={!expired || undefined}
              onClick={() => void start("browser")}
            >
              <GlobeIcon />
              {tr("signIn.useBrowser")}
            </Button>
            <CancelButton />
          </div>
        </div>
        {expired ? (
          <div className="text-muted-foreground grid size-56 shrink-0 place-items-center rounded-2xl border-2 border-dashed p-6 text-center text-sm sm:size-64">
            {tr("signIn.codeExpiredShort")}
          </div>
        ) : (
          <QrCode
            text={signIn.verificationUriComplete}
            label={tr("signIn.codeQr", { code: signIn.userCode })}
            className="size-56 shrink-0 sm:size-64 sm:p-5"
          />
        )}
      </div>
    </Page>
  )
}

function failure(signIn: FailedSignIn, host: string) {
  switch (signIn.reason) {
    case "expired":
      return {
        title: tr("signIn.expiredTitle"),
        description: tr("signIn.expiredDescription"),
      }
    case "denied":
      return {
        title: tr("signIn.deniedTitle"),
        description: tr("signIn.deniedDescription"),
      }
    case "unreachable":
      return {
        title: tr("signIn.unreachableTitle", { host }),
        description: tr("signIn.unreachableDescription"),
      }
    case "failed":
      return {
        title: tr("signIn.failedTitle"),
        // The server's own words, in its language, where it sent some.
        description: signIn.message ?? tr("signIn.failedDescription"),
      }
    case "start":
      return {
        title: tr("signIn.startFailedTitle"),
        description: tr("signIn.startFailedDescription", { host }),
      }
  }
}

/** A sign-in that ended without a session, and the ways on from it. */
function Failed({ host, signIn }: { host: string; signIn: FailedSignIn }) {
  const start = useApp((state) => state.startSignIn)
  const { title, description } = failure(signIn, host)
  const other: SignInMethod = signIn.method === "browser" ? "code" : "browser"
  const again =
    signIn.method === "code" && signIn.reason === "expired"
      ? tr("signIn.newCode")
      : tr("signIn.retry")

  return (
    <Page title={title} description={description}>
      <div className="flex flex-col gap-3">
        <Button
          size="lg"
          data-primary
          onClick={() => void start(signIn.method)}
        >
          <RefreshCwIcon />
          {again}
        </Button>
        <Button variant="outline" size="lg" onClick={() => void start(other)}>
          {other === "browser" ? <GlobeIcon /> : <QrCodeIcon />}
          {other === "browser" ? tr("signIn.useBrowser") : tr("signIn.useCode")}
        </Button>
        <BackButton />
      </div>
    </Page>
  )
}
