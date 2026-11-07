import type { CapabilityCheck } from "@matinee/contracts"

import { env } from "../../env"
import { processFailureKind, runProcess } from "../../media/process"

const CHECK_TIMEOUT_MS = 20_000
const ERROR_LINES = 4

type Run = {
  ok: boolean
  /** The command didn't start: ffmpeg isn't there. */
  missing: boolean
  stdout: string
  stderr: string[]
  error: string | null
}

export async function ffmpeg(args: string[], stdin?: string): Promise<Run> {
  const stdout: string[] = []
  const stderr: string[] = []
  try {
    await runProcess({
      name: "ffmpeg",
      command: env.MATINEE_FFMPEG_PATH,
      args,
      timeoutMs: CHECK_TIMEOUT_MS,
      stdin,
      // Detection is background work on what may be a busy home server.
      priority: 19,
      idleIo: true,
      onStdoutLine: (line) => stdout.push(line),
      onStderrLine: (line) => {
        stderr.push(line)
        if (stderr.length > 400) stderr.shift()
      },
    })
    return {
      ok: true,
      missing: false,
      stdout: stdout.join("\n"),
      stderr,
      error: null,
    }
  } catch (cause) {
    const kind = processFailureKind(cause)
    return {
      ok: false,
      missing: kind === "start",
      stdout: stdout.join("\n"),
      stderr,
      error:
        kind === "timeout"
          ? "Timed out."
          : (errorTail(stderr) ??
            (cause instanceof Error ? cause.message : String(cause))),
    }
  }
}

/** The last lines that say something, without libva's chatter. */
function errorTail(stderr: string[]): string | null {
  const lines = stderr
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("libva info:"))
  return lines.length > 0 ? lines.slice(-ERROR_LINES).join("\n") : null
}

export const ok = (): CapabilityCheck => ({ status: "ok", error: null })
export const missing = (): CapabilityCheck => ({
  status: "missing",
  error: null,
})
export const failed = (error: string | null): CapabilityCheck => ({
  status: "failed",
  error: error ?? "ffmpeg failed.",
})

/** Runs a check: `ok` when ffmpeg exits 0, `failed` with its last words. */
export async function check(args: string[]): Promise<CapabilityCheck> {
  const run = await ffmpeg(["-hide_banner", "-nostdin", "-v", "error", ...args])
  return run.ok ? ok() : failed(run.error)
}
