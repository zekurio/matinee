/** `value` as literal text in a LIKE pattern: its wildcards don't match. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`)
}
