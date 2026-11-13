import { defineMessages } from "../../catalog"

export default defineMessages("network", {
  // The network panel under Settings → Network.
  "network.loadFailed": "Couldn't load the network settings. {error}",
  "network.checkFields": "Check the fields.",
  "network.title": "Local and remote",
  "network.connection.local":
    "You're connected from {address}, which counts as local.",
  "network.connection.remote":
    "You're connected from {address}, which counts as remote.",
  "network.connection.unknown":
    "The server can't tell where you're connected from, so you count as remote.",
  "network.unheededProxy":
    "A reverse proxy passes your requests on, but it isn't a trusted proxy. Every request looks like it comes from {address}. Add that address under Trusted proxies.",
  "network.localNetworks": "Local networks",
  "network.trustedProxies": "Trusted proxies",
  "network.ranges.note": "One address or range per line, like 192.168.0.0/16.",
  "network.trustedProxies.note":
    "Reverse proxies whose X-Forwarded-For the server believes. One address or range per line.",
  "network.upload.title": "Watch parties",
  "network.upload": "Upload speed (Mbit/s)",
  "network.upload.note":
    "A watch party's remote members share this as their bit rate limit. Local members aren't limited by it. Empty for no limit.",
  "network.upload.placeholder": "No limit",
})
