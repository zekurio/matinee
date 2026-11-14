import { PushSubscriptionInput } from "@matinee/contracts"

import { client } from "./rpc"

/**
 * Where web push stands on this device, as the switch in Account settings
 * says it: browsers offer push only on HTTPS (and localhost), some not at
 * all, and a person can block it for the site in the browser's settings.
 */
export type PushState = "insecure" | "unsupported" | "blocked" | "off" | "on"

export function pushSupported() {
  return (
    window.isSecureContext &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  )
}

async function registration() {
  return navigator.serviceWorker.register("/push-worker.js", {
    scope: "/",
    type: "module",
  })
}

export async function pushState(): Promise<PushState> {
  if (!window.isSecureContext) return "insecure"
  if (!pushSupported()) return "unsupported"
  if (Notification.permission === "denied") return "blocked"
  const worker = await registration()
  return (await worker.pushManager.getSubscription()) ? "on" : "off"
}

export async function subscribePush() {
  if (
    !pushSupported() ||
    (await Notification.requestPermission()) !== "granted"
  )
    return false
  const { publicKey } = await client.notifications.pushPublicKey()
  if (!publicKey) return false
  const worker = await registration()
  await navigator.serviceWorker.ready
  const existing = await worker.pushManager.getSubscription()
  const subscription =
    existing ??
    (await worker.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: publicKey,
    }))
  await client.notifications.subscribe(
    PushSubscriptionInput.parse(subscription.toJSON()),
  )
  return true
}

export async function unsubscribePush() {
  if (!pushSupported()) return
  const worker = await registration()
  const subscription = await worker.pushManager.getSubscription()
  if (!subscription) return
  await client.notifications.unsubscribe({ endpoint: subscription.endpoint })
  await subscription.unsubscribe()
}
