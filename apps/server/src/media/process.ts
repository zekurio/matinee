import { type ChildProcess, spawn } from "node:child_process"
import { setPriority } from "node:os"
import type { Readable } from "node:stream"

const PROCESS_TIMEOUT_MS = 30_000
// Between SIGTERM and SIGKILL when stopping a stuck process.
const KILL_GRACE_MS = 5_000
const STDERR_TAIL_LINES = 20

/**
 * Why a run failed: the command never started (not installed), ran out of
 * time, or exited with an error. Only an exit says something about the
 * input itself.
 */
export type ProcessFailureKind = "start" | "timeout" | "exit"

class ProcessError extends Error {
  constructor(
    message: string,
    readonly kind: ProcessFailureKind,
    detail: string,
  ) {
    super(detail ? `${message}: ${detail}` : message)
    this.name = "ProcessError"
  }
}

export function processFailureKind(cause: unknown): ProcessFailureKind | null {
  return cause instanceof ProcessError ? cause.kind : null
}

function abortError(): DOMException {
  return new DOMException("Aborted", "AbortError")
}

export type RunProcessOptions = {
  /** For error messages, like "ffmpeg". */
  name: string
  command: string
  args: readonly string[]
  timeoutMs?: number
  signal?: AbortSignal
  /** Niceness for the child, see `os.setPriority`. Background work uses 10. */
  priority?: number
  /**
   * Put the child in the idle IO class with `ionice`, so its reads and
   * writes wait for everything else. Skipped where ionice is missing.
   */
  idleIo?: boolean
  /** Called per stdout line. Without it, stdout is ignored. */
  onStdoutLine?: (line: string) => void
  /** Called per chunk of stdout, for binary output. */
  onStdoutData?: (chunk: Buffer) => void
  /** Called per stderr line, on top of the tail kept for errors. */
  onStderrLine?: (line: string) => void
  /** Written to stdin, which then closes. Without it, stdin is ignored. */
  stdin?: string
}

/**
 * Run a command to completion. Resolves on exit code 0, rejects with an
 * AbortError when `signal` aborts, and otherwise with an error that
 * `processFailureKind` classifies, ending in the last lines of stderr. On
 * abort or timeout the process gets SIGTERM, then SIGKILL, so one that
 * ignores SIGTERM can't hold its caller forever.
 */
export function runProcess(options: RunProcessOptions): Promise<void> {
  if (options.signal?.aborted) return Promise.reject(abortError())
  const timeoutMs = options.timeoutMs ?? PROCESS_TIMEOUT_MS
  const child = spawnChild(options)

  const stderr: string[] = []
  const flushStdout = readLines(child.stdout, options.onStdoutLine)
  const onData = options.onStdoutData
  if (onData) child.stdout?.on("data", (chunk: Buffer) => onData(chunk))
  const flushStderr = readLines(child.stderr, (line) => {
    options.onStderrLine?.(line)
    if (!line.trim()) return
    stderr.push(line.trim())
    if (stderr.length > STDERR_TAIL_LINES) stderr.shift()
  })

  let timedOut = false
  let aborted = false
  let hardKill: ReturnType<typeof setTimeout> | null = null
  const stop = () => {
    child.kill("SIGTERM")
    hardKill ??= setTimeout(() => child.kill("SIGKILL"), KILL_GRACE_MS)
    hardKill.unref()
  }
  const timer = setTimeout(() => {
    timedOut = true
    stop()
  }, timeoutMs)
  const onAbort = () => {
    aborted = true
    stop()
  }
  options.signal?.addEventListener("abort", onAbort, { once: true })

  const fail = (message: string, kind: ProcessFailureKind) =>
    new ProcessError(message, kind, stderr.join("\n").slice(-500))

  return new Promise<void>((resolve, reject) => {
    // `error` also fires when kill() fails; only a missing pid means the
    // process never started. Otherwise wait for `close`.
    child.on("error", (error) => {
      if (child.pid !== undefined) return
      reject(
        fail(
          `Couldn't start ${options.name} (${options.command}): ${error.message}`,
          "start",
        ),
      )
    })
    child.once("close", (code) => {
      flushStdout()
      flushStderr()
      if (aborted) reject(abortError())
      else if (timedOut) {
        reject(
          fail(
            `${options.name} timed out after ${Math.round(timeoutMs / 1000)} s`,
            "timeout",
          ),
        )
      } else if (code !== 0) {
        reject(fail(`${options.name} exited with ${code}`, "exit"))
      } else resolve()
    })
  }).finally(() => {
    clearTimeout(timer)
    if (hardKill) clearTimeout(hardKill)
    options.signal?.removeEventListener("abort", onAbort)
  })
}

/** Start the child with the pipes, stdin, and priority the options ask for. */
function spawnChild(options: RunProcessOptions): ChildProcess {
  const child = spawn(options.command, options.args, {
    stdio: [
      options.stdin === undefined ? "ignore" : "pipe",
      options.onStdoutLine || options.onStdoutData ? "pipe" : "ignore",
      "pipe",
    ],
  })
  if (options.stdin !== undefined) {
    // A process that exits before reading closes the pipe; that's fine.
    child.stdin?.on("error", () => undefined)
    child.stdin?.end(options.stdin)
  }
  if (options.priority !== undefined && child.pid !== undefined) {
    try {
      setPriority(child.pid, options.priority)
    } catch {
      // Unsupported platforms and exited processes keep the default.
    }
  }
  if (options.idleIo && child.pid !== undefined) {
    spawn("ionice", ["-c", "3", "-p", String(child.pid)], {
      stdio: "ignore",
    }).on("error", () => undefined)
  }
  return child
}

/** Split a stream into lines; the returned flush emits a last partial line. */
function readLines(
  stream: Readable | null,
  onLine: ((line: string) => void) | undefined,
): () => void {
  if (!stream || !onLine) return () => undefined
  let rest = ""
  stream.setEncoding("utf8")
  stream.on("data", (chunk: string) => {
    rest += chunk
    const lines = rest.split("\n")
    rest = lines.pop() ?? ""
    for (const line of lines) onLine(line)
  })
  return () => {
    if (rest) onLine(rest)
    rest = ""
  }
}

/** Run a command and resolve with its stdout, or reject with its stderr. */
export async function run(
  command: string,
  args: string[],
  timeoutMs?: number,
): Promise<string> {
  const lines: string[] = []
  await runProcess({
    name: command.split("/").at(-1) ?? command,
    command,
    args,
    timeoutMs,
    onStdoutLine: (line) => lines.push(line),
  })
  return lines.join("\n")
}

/** Run a command and resolve with its stdout as bytes. */
export async function runBytes(
  command: string,
  args: string[],
  timeoutMs?: number,
): Promise<Buffer> {
  const chunks: Buffer[] = []
  await runProcess({
    name: command.split("/").at(-1) ?? command,
    command,
    args,
    timeoutMs,
    onStdoutData: (chunk) => chunks.push(chunk),
  })
  return Buffer.concat(chunks)
}

/**
 * Runs at most `max` tasks at once; the rest wait their turn in order.
 * `spacingMs` also keeps that much time between task starts.
 */
export function limiter(max: number, spacingMs = 0) {
  let running = 0
  let lastStart = 0
  const waiting: (() => void)[] = []

  return async function limit<T>(task: () => Promise<T>): Promise<T> {
    if (running >= max) {
      await new Promise<void>((resolve) => waiting.push(resolve))
    }
    running++
    try {
      if (spacingMs > 0) {
        const wait = lastStart + spacingMs - Date.now()
        lastStart = Date.now() + Math.max(0, wait)
        if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
      }
      return await task()
    } finally {
      running--
      waiting.shift()?.()
    }
  }
}
