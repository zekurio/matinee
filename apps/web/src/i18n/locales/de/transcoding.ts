import type { TranslationOf } from "../../catalog"
import type source from "../en/transcoding"

export default {
  "transcoding.loadFailed":
    "Die Transkodierungseinstellungen konnten nicht geladen werden. {error}",
  "transcoding.checkField": "Überprüfe {field}.",
  "transcoding.checkFields": "Überprüfe die Felder.",
  "transcoding.checkFieldIssue": "{check} {issue}",
  "transcoding.auto": "Automatisch",

  "transcoding.acceleration.none": "Keine (Software)",
  "transcoding.acceleration.vaapi": "VAAPI (Intel, AMD)",
  "transcoding.acceleration.qsv": "Intel Quick Sync",
  "transcoding.acceleration.nvenc": "NVIDIA NVENC",
  "transcoding.acceleration.videotoolbox": "Apple VideoToolbox",

  "transcoding.check.missing":
    "Dieser ffmpeg-Build oder diese GPU unterstützt das nicht.",
  "transcoding.check.failed":
    "Auf diesem Server ist es fehlgeschlagen: {error}",

  "transcoding.field.vaapiDevice": "VAAPI-Gerät",
  "transcoding.field.qsvDevice": "QSV-Gerät",
  "transcoding.field.h264Crf": "H.264-CRF",
  "transcoding.field.hevcCrf": "HEVC-CRF",
  "transcoding.field.tonemappingDesat": "Entsättigung",
  "transcoding.field.tonemappingPeak": "Spitzenwert",
  "transcoding.field.tonemappingParam": "Parameter",
  "transcoding.field.vppTonemappingBrightness": "VPP-Helligkeit",
  "transcoding.field.vppTonemappingContrast": "VPP-Kontrast",
  "transcoding.field.downMixAudioBoost": "Downmix-Verstärkung",
  "transcoding.field.throttleDelaySeconds": "Drosseln nach",
  "transcoding.field.segmentKeepSeconds": "Segmente behalten für",

  "transcoding.number.h264Crf":
    "0 bis 51, niedriger ist besser. Nur bei Software-Kodierung.",
  "transcoding.number.hevcCrf": "0 bis 51, niedriger ist besser.",
  "transcoding.number.tonemappingDesat": "0 schaltet sie aus, wie empfohlen.",
  "transcoding.number.tonemappingPeak":
    "Wenn Metadaten fehlen. 100 entspricht 1000 Nits.",
  "transcoding.number.tonemappingParam": "Auf 0 lassen.",
  "transcoding.number.vppTonemappingBrightness": "0 bis 100. Empfohlen ist 16.",
  "transcoding.number.vppTonemappingContrast": "1 bis 2. Empfohlen ist 1.",
  "transcoding.number.downMixAudioBoost":
    "0,5 bis 3. Heruntergemischter Surround-Ton ist leise; 1 lässt ihn, wie er ist.",
  "transcoding.number.throttleDelaySeconds":
    "Sekunden Vorsprung, bevor pausiert wird.",
  "transcoding.number.segmentKeepSeconds": "Sekunden, zum Zurückspulen.",

  "transcoding.ffmpeg.failed":
    "ffmpeg ließ sich nicht starten, daher kann nichts transkodiert werden.",
  "transcoding.ffmpeg.detected": "{path}, erkannt am {date}.",
  "transcoding.ffmpeg.detecting": "Wird erkannt…",
  "transcoding.ffmpeg.detect": "Erneut erkennen",
  "transcoding.ffmpeg.unknownVersion": "unbekannt",
  "transcoding.ffmpeg.pauseKeys": "Pause-Tasten",
  "transcoding.ffmpeg.doviRemoval": "Entfernen von Dolby Vision",
  "transcoding.ffmpeg.lacks":
    "Diesem Build fehlt {features}. Verwende jellyfin-ffmpeg.",

  "transcoding.hardware.title": "Hardwarebeschleunigung",
  "transcoding.hardware.acceleration": "Beschleunigung",
  "transcoding.hardware.deviceFailed":
    "Das Gerät ließ sich nicht öffnen, daher laufen Transkodierungen in Software.",
  "transcoding.hardware.notInBuild": "Nicht in diesem ffmpeg-Build",
  "transcoding.hardware.vaapiDevice": "Der Render-Node der GPU.",
  "transcoding.hardware.qsvDevice": "Der Render-Node der Intel-GPU.",
  "transcoding.hardware.encoding": "Hardware-Kodierung",
  "transcoding.hardware.lowPower": "Intel-Low-Power-Encoder für {codec}",
  "transcoding.hardware.lowPower.description":
    "Spart CPU-GPU-Synchronisierungen, was bei 4K und Tone-Mapping hilft. Braucht die HuC-Firmware.",

  "transcoding.decoding.title": "Hardware-Dekodierung",
  "transcoding.decoding.hevc10": "HEVC 10 Bit",
  "transcoding.decoding.hevc10.description":
    "Das meiste HDR. Intel ab 7. Generation, AMD Polaris, NVIDIA Pascal oder neuer.",
  "transcoding.decoding.vp910": "VP9 10 Bit",
  "transcoding.decoding.hevcRext": "HEVC RExt 8/10 Bit",
  "transcoding.decoding.hevcRext.description":
    "Kameraaufnahmen in 4:2:2 und 4:4:4. Intel ab 11. Generation.",
  "transcoding.decoding.hevcRext12": "HEVC RExt 12 Bit",

  "transcoding.encoding.title": "Kodierung",
  "transcoding.encoding.description":
    "H.264 ist immer an. HEVC und AV1 gehen nur an Player, die sie unterstützen.",
  "transcoding.encoding.hevc": "HEVC-Kodierung erlauben",
  "transcoding.encoding.hevc.unavailable":
    "Auf diesem Server funktioniert kein HEVC-Encoder.",
  "transcoding.encoding.av1": "AV1-Kodierung erlauben",
  "transcoding.encoding.av1.unavailable":
    "Auf diesem Server funktioniert kein AV1-Encoder.",
  "transcoding.encoding.preset": "Encoder-Preset",
  "transcoding.encoding.preset.description":
    "Langsamer sieht besser aus. Automatisch ist veryfast.",

  "transcoding.toneMapping.title": "Tone-Mapping",
  "transcoding.toneMapping.description":
    "Wandelt HDR in SDR um, für Player ohne HDR.",
  "transcoding.toneMapping.noTonemapx":
    "Diesem ffmpeg fehlt tonemapx, daher sieht HDR ohne GPU-Tone-Mapping blass aus. Installiere jellyfin-ffmpeg.",
  "transcoding.toneMapping.vpp": "VPP-Tone-Mapping",
  "transcoding.toneMapping.vpp.description":
    "Intels Tone-Mapping, vor OpenCL verwendet. Braucht Hardware-Dekodierung.",
  "transcoding.toneMapping.videoToolbox": "VideoToolbox-Tone-Mapping",
  "transcoding.toneMapping.videoToolbox.description":
    "Apples Tone-Mapping, vor Metal verwendet.",
  "transcoding.toneMapping.hardware": "Hardware-Tone-Mapping",
  "transcoding.toneMapping.cuda": "Läuft über CUDA.",
  "transcoding.toneMapping.metal": "Läuft über Metal.",
  "transcoding.toneMapping.openCl":
    "Läuft über OpenCL. Braucht die OpenCL-Laufzeit des Treibers.",
  "transcoding.toneMapping.algorithm": "Algorithmus",
  "transcoding.toneMapping.algorithm.description": "Empfohlen ist BT.2390.",
  "transcoding.toneMapping.mode": "Modus",
  "transcoding.toneMapping.mode.description":
    "Nur GPU. Versuch RGB, wenn Lichter ausbrennen.",
  "transcoding.toneMapping.range": "Bereich",
  "transcoding.toneMapping.range.description":
    "Automatisch behält den Bereich der Quelle.",

  "transcoding.algorithm.none": "Keiner",
  "transcoding.algorithm.clip": "Abschneiden",
  "transcoding.algorithm.linear": "Linear",
  "transcoding.algorithm.gamma": "Gamma",
  "transcoding.algorithm.reinhard": "Reinhard",
  "transcoding.algorithm.hable": "Hable",
  "transcoding.algorithm.mobius": "Möbius",
  "transcoding.algorithm.bt2390": "BT.2390",

  "transcoding.deinterlacing.title": "Deinterlacing",
  "transcoding.deinterlacing.method": "Methode",
  "transcoding.deinterlacing.doubleRate": "Bildrate verdoppeln",
  "transcoding.deinterlacing.doubleRate.description":
    "25 und 30 fps laufen mit 50 und 60.",

  "transcoding.audio.title": "Audio",
  "transcoding.audio.description":
    "Player bekommen eine Spur unverändert, wenn sie sie dekodieren können. Der Rest wird zu Opus, oder zu AAC für Player ohne Opus.",
  "transcoding.audio.noOpus":
    "Player bekommen eine Spur unverändert, wenn sie sie dekodieren können. Der Rest wird zu AAC, da diesem ffmpeg libopus fehlt.",
  "transcoding.audio.downmix": "Stereo-Downmix",
  "transcoding.audio.downmix.description":
    "Wie Surround zu Stereo wird. Keiner verwirft den LFE-Kanal; Nachtmodus-Dialog bevorzugt Sprache.",
  "transcoding.audio.vbr": "AAC mit variabler Bitrate",
  "transcoding.audio.vbr.description":
    "Nutzt den VBR-Modus von {encoder}. Opus ist immer variabel.",
  "transcoding.audio.vbr.unavailable":
    "Braucht aac_at oder libfdk_aac, die diesem ffmpeg fehlen.",

  "transcoding.downmix.none": "Keiner",
  "transcoding.downmix.dave750": "Dave750",
  "transcoding.downmix.nightmode-dialogue": "Nachtmodus-Dialog",
  "transcoding.downmix.rfc7845": "RFC 7845",
  "transcoding.downmix.ac4": "AC-4",

  "transcoding.segments.title": "Drosselung und Segmente",
  "transcoding.segments.description":
    "Schalte das aus, wenn die Wiedergabe hängt.",
  "transcoding.segments.throttle": "Transkodierungen drosseln",
  "transcoding.segments.throttle.description":
    "Pausiert ffmpeg, wenn es dem Player weit voraus ist.",
  "transcoding.segments.throttle.unavailable": "Braucht jellyfin-ffmpeg.",
  "transcoding.segments.delete": "Segmente löschen",
  "transcoding.segments.delete.description":
    "Gibt Speicherplatz frei, sobald der Player sie abgerufen hat.",
} satisfies TranslationOf<typeof source>
