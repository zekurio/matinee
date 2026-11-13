import type { TranslationOf } from "../../catalog"
import type source from "../en/network"

export default {
  "network.loadFailed":
    "Die Netzwerkeinstellungen konnten nicht geladen werden. {error}",
  "network.checkFields": "Prüfe die Felder.",
  "network.title": "Lokal und entfernt",
  "network.connection.local":
    "Du bist von {address} verbunden. Das zählt als lokal.",
  "network.connection.remote":
    "Du bist von {address} verbunden. Das zählt als entfernt.",
  "network.connection.unknown":
    "Der Server kann nicht erkennen, von wo du verbunden bist. Du zählst deshalb als entfernt.",
  "network.unheededProxy":
    "Ein Reverse-Proxy reicht deine Anfragen weiter, ist aber kein vertrauenswürdiger Proxy. Jede Anfrage sieht aus, als käme sie von {address}. Trag diese Adresse unter „Vertrauenswürdige Proxys“ ein.",
  "network.localNetworks": "Lokale Netzwerke",
  "network.trustedProxies": "Vertrauenswürdige Proxys",
  "network.ranges.note":
    "Eine Adresse oder ein Bereich pro Zeile, etwa 192.168.0.0/16.",
  "network.trustedProxies.note":
    "Reverse-Proxys, deren X-Forwarded-For der Server glaubt. Eine Adresse oder ein Bereich pro Zeile.",
  "network.upload.title": "Watch-Partys",
  "network.upload": "Upload-Geschwindigkeit (Mbit/s)",
  "network.upload.note":
    "Die entfernten Mitglieder einer Watch-Party teilen sich das als Bitraten-Limit. Lokale Mitglieder begrenzt es nicht. Leer für kein Limit.",
  "network.upload.placeholder": "Kein Limit",
} satisfies TranslationOf<typeof source>
