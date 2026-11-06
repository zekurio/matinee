import { createHash, randomBytes, timingSafeEqual } from "node:crypto"

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url")
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("base64url")
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}
