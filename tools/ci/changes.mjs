/*
 * The first job of .github/workflows/ci.yml: says which of its checks a
 * change needs. A workflow skipped by a `paths` filter never reports its
 * checks, so a required one stays pending; a job skipped by `if:` passes.
 * So ci.yml always runs, and its jobs read the outputs this sets.
 *
 * Each argument names a check, and `PATHS_<NAME>` holds its patterns, one
 * per line, with GitHub's `paths` syntax: `*` stays within a directory,
 * `**` crosses them, and a later `!pattern` takes files back out. The
 * check runs when a changed file is left in. Without a base to compare to,
 * as on a manual run, every check runs.
 */

import { execFileSync } from "node:child_process"

import { fail, root, setForWorkflow } from "../release/lib.mjs"

const names = process.argv.slice(2)
if (names.length === 0) fail("Name the checks to decide on")

const changed = changedFiles(process.env.BASE ?? "")

for (const name of names) {
  const variable = `PATHS_${name.toUpperCase()}`
  const patterns = (process.env[variable] ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
  if (patterns.length === 0) fail(`${variable} isn't set`)

  const rules = patterns.map((pattern) => {
    const exclude = pattern.startsWith("!")
    return { exclude, regex: globToRegex(exclude ? pattern.slice(1) : pattern) }
  })
  const runs =
    changed === null ||
    changed.some((file) => {
      let included = false
      for (const rule of rules) {
        if (rule.regex.test(file)) included = !rule.exclude
      }
      return included
    })

  process.stdout.write(`${name}: ${runs ? "runs" : "skipped"}\n`)
  setForWorkflow("GITHUB_OUTPUT", name, String(runs))
}

/** The files changed since `base`, or null when every check should run. */
function changedFiles(base) {
  if (!base || /^0+$/.test(base)) return null
  const git = (args) =>
    execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim()
  try {
    git(["fetch", "--quiet", "--depth=1", "origin", base])
    const files = git(["diff", "--name-only", base, "HEAD"])
    process.stdout.write(
      files ? `Changed since ${base}:\n${files}\n` : "Nothing changed\n",
    )
    return files ? files.split("\n") : []
  } catch {
    // A force push can leave `before` unreachable. Check everything then.
    process.stdout.write(`Can't compare to ${base}, running every check\n`)
    return null
  }
}

/** A `paths` pattern as a regex over a whole repository path. */
function globToRegex(pattern) {
  let source = ""
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i]
    if (char === "*" && pattern[i + 1] === "*") {
      i++
      if (pattern[i + 1] === "/") {
        i++
        source += "(?:.*/)?"
      } else {
        source += ".*"
      }
    } else if (char === "*") {
      source += "[^/]*"
    } else if (char === "?") {
      source += "[^/]"
    } else {
      source += char.replace(/[.+^${}()|[\]\\]/g, "\\$&")
    }
  }
  return new RegExp(`^${source}$`)
}
