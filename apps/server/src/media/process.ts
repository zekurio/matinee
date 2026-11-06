import { spawn } from "node:child_process"

const PROCESS_TIMEOUT_MS = 30_000

/** Run a command and resolve with its stdout, or reject with its stderr. */
export function run(
  command: string,
  args: string[],
  timeoutMs = PROCESS_TIMEOUT_MS,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] })
    let stdout = ""
    let stderr = ""
    // Decoding in the stream keeps characters split across chunks whole.
    child.stdout.setEncoding("utf8")
    child.stdout.on("data", (chunk: string) => (stdout += chunk))
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()))
    const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs)
    child.on("error", (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.on("close", (code) => {
      clearTimeout(timer)
      if (code === 0) resolve(stdout)
      else
        reject(
          new Error(
            `${command} exited with ${code}: ${stderr.trim().slice(-300)}`,
          ),
        )
    })
  })
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
