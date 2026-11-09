import { defineMessages } from "../../catalog"

export default defineMessages("transcoding", {
  // The transcoding panel under Settings → Transcoding.
  "transcoding.loadFailed": "Couldn't load the transcoding settings. {error}",
  "transcoding.checkField": "Check {field}.",
  "transcoding.checkFields": "Check the fields.",
  // A check followed by the schema's reason, like "Check CRF. Use 0 to 51."
  "transcoding.checkFieldIssue": "{check} {issue}",
  "transcoding.auto": "Auto",

  // Hardware accelerations, by their value.
  "transcoding.acceleration.none": "None (software)",
  "transcoding.acceleration.vaapi": "VAAPI (Intel, AMD)",
  "transcoding.acceleration.qsv": "Intel Quick Sync",
  "transcoding.acceleration.nvenc": "NVIDIA NVENC",
  "transcoding.acceleration.videotoolbox": "Apple VideoToolbox",

  // Why a switch for something the server may lack is off.
  "transcoding.check.missing": "This ffmpeg build or GPU doesn't have it.",
  "transcoding.check.failed": "It failed on this server: {error}",

  // Field names, also in “Check {field}.”
  "transcoding.field.vaapiDevice": "VAAPI device",
  "transcoding.field.qsvDevice": "QSV device",
  "transcoding.field.h264Crf": "H.264 CRF",
  "transcoding.field.hevcCrf": "HEVC CRF",
  "transcoding.field.tonemappingDesat": "Desaturation",
  "transcoding.field.tonemappingPeak": "Peak",
  "transcoding.field.tonemappingParam": "Parameter",
  "transcoding.field.vppTonemappingBrightness": "VPP brightness",
  "transcoding.field.vppTonemappingContrast": "VPP contrast",
  "transcoding.field.downMixAudioBoost": "Downmix boost",
  "transcoding.field.throttleDelaySeconds": "Throttle after",
  "transcoding.field.segmentKeepSeconds": "Keep segments for",

  // What each number field's row says under its name.
  "transcoding.number.h264Crf":
    "0 to 51, lower is better. Software encoding only.",
  "transcoding.number.hevcCrf": "0 to 51, lower is better.",
  "transcoding.number.tonemappingDesat": "0 turns it off, as recommended.",
  "transcoding.number.tonemappingPeak":
    "When metadata is missing. 100 is 1000 nits.",
  "transcoding.number.tonemappingParam": "Leave at 0.",
  "transcoding.number.vppTonemappingBrightness": "0 to 100. 16 is recommended.",
  "transcoding.number.vppTonemappingContrast": "1 to 2. 1 is recommended.",
  "transcoding.number.downMixAudioBoost":
    "0.5 to 3. Downmixed surround is quiet; 1 leaves it.",
  "transcoding.number.throttleDelaySeconds": "Seconds ahead before pausing.",
  "transcoding.number.segmentKeepSeconds": "Seconds, for seeking back.",

  // The FFmpeg section.
  "transcoding.ffmpeg.failed":
    "ffmpeg didn't run, so nothing can be transcoded.",
  "transcoding.ffmpeg.detected": "{path}, detected {date}.",
  "transcoding.ffmpeg.detecting": "Detecting…",
  "transcoding.ffmpeg.detect": "Detect again",
  "transcoding.ffmpeg.unknownVersion": "unknown",
  "transcoding.ffmpeg.pauseKeys": "pause keys",
  "transcoding.ffmpeg.doviRemoval": "Dolby Vision removal",
  "transcoding.ffmpeg.lacks":
    "This build lacks {features}. Use jellyfin-ffmpeg.",

  // Hardware acceleration.
  "transcoding.hardware.title": "Hardware acceleration",
  "transcoding.hardware.acceleration": "Acceleration",
  "transcoding.hardware.deviceFailed":
    "The device didn't open, so transcodes run in software.",
  "transcoding.hardware.notInBuild": "Not in this ffmpeg build",
  "transcoding.hardware.encoding": "Hardware encoding",
  "transcoding.hardware.lowPower": "Intel low-power {codec} encoder",

  // Hardware decoding.
  "transcoding.decoding.title": "Hardware decoding",
  "transcoding.decoding.hevc10": "HEVC 10-bit",
  "transcoding.decoding.vp910": "VP9 10-bit",
  "transcoding.decoding.hevcRext": "HEVC RExt 8/10-bit",
  "transcoding.decoding.hevcRext12": "HEVC RExt 12-bit",

  // Encoding.
  "transcoding.encoding.title": "Encoding",
  "transcoding.encoding.hevc": "Allow HEVC encoding",
  "transcoding.encoding.hevc.unavailable":
    "No HEVC encoder works on this server.",
  "transcoding.encoding.av1": "Allow AV1 encoding",
  "transcoding.encoding.av1.unavailable":
    "No AV1 encoder works on this server.",
  "transcoding.encoding.preset": "Encoder preset",

  // Tone mapping.
  "transcoding.toneMapping.title": "Tone mapping",
  "transcoding.toneMapping.noTonemapx":
    "This ffmpeg lacks tonemapx, so HDR looks washed out without GPU tone mapping. Install jellyfin-ffmpeg.",
  "transcoding.toneMapping.vpp": "VPP tone mapping",
  "transcoding.toneMapping.videoToolbox": "VideoToolbox tone mapping",
  "transcoding.toneMapping.hardware": "Hardware tone mapping",
  "transcoding.toneMapping.algorithm": "Algorithm",
  "transcoding.toneMapping.mode": "Mode",
  "transcoding.toneMapping.range": "Range",

  // Tone mapping algorithms, by their value.
  "transcoding.algorithm.none": "None",
  "transcoding.algorithm.clip": "Clip",
  "transcoding.algorithm.linear": "Linear",
  "transcoding.algorithm.gamma": "Gamma",
  "transcoding.algorithm.reinhard": "Reinhard",
  "transcoding.algorithm.hable": "Hable",
  "transcoding.algorithm.mobius": "Möbius",
  "transcoding.algorithm.bt2390": "BT.2390",

  // Deinterlacing.
  "transcoding.deinterlacing.title": "Deinterlacing",
  "transcoding.deinterlacing.method": "Method",
  "transcoding.deinterlacing.doubleRate": "Double the frame rate",

  // Audio.
  "transcoding.audio.title": "Audio",
  "transcoding.audio.noOpus":
    "Players get a track as it is when they decode it. The rest becomes AAC, since this ffmpeg lacks libopus.",
  "transcoding.audio.downmix": "Stereo downmix",
  "transcoding.audio.vbr": "Variable bit rate AAC",
  "transcoding.audio.vbr.unavailable":
    "Needs aac_at or libfdk_aac, which this ffmpeg lacks.",

  // Downmix algorithms, by their value.
  "transcoding.downmix.none": "None",
  "transcoding.downmix.dave750": "Dave750",
  "transcoding.downmix.nightmode-dialogue": "Nightmode dialogue",
  "transcoding.downmix.rfc7845": "RFC 7845",
  "transcoding.downmix.ac4": "AC-4",

  // Throttling and segments.
  "transcoding.segments.title": "Throttling and segments",
  "transcoding.segments.throttle": "Throttle transcodes",
  "transcoding.segments.throttle.unavailable": "Needs jellyfin-ffmpeg.",
  "transcoding.segments.delete": "Delete segments",
})
