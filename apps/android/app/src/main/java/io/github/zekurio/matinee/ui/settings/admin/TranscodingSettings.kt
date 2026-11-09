package io.github.zekurio.matinee.ui.settings.admin

import android.text.format.DateUtils
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.admin.AdminTranscoding
import io.github.zekurio.matinee.api.admin.detectTranscoding
import io.github.zekurio.matinee.api.admin.setTranscodingSettings
import io.github.zekurio.matinee.api.admin.transcodingSettings
import io.github.zekurio.matinee.ui.components.Gap
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.components.Lucide
import io.github.zekurio.matinee.ui.components.LucideIcon
import io.github.zekurio.matinee.ui.rememberLoader
import io.github.zekurio.matinee.ui.settings.LinkRow
import io.github.zekurio.matinee.ui.settings.Panel
import io.github.zekurio.matinee.ui.settings.PickerRow
import io.github.zekurio.matinee.ui.settings.RowDivider
import io.github.zekurio.matinee.ui.settings.Section
import io.github.zekurio.matinee.ui.settings.SettingsScaffold
import io.github.zekurio.matinee.ui.settings.SwitchRow
import io.github.zekurio.matinee.ui.theme.Palette
import io.github.zekurio.matinee.ui.videoCodecName
import java.time.Instant
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/* The contract's choices for transcoding, in its order. */
private val ACCELERATIONS = listOf("none", "vaapi", "qsv", "nvenc", "videotoolbox")
private val DECODE_SUPPORT = mapOf(
    "vaapi" to listOf("h264", "hevc", "mpeg2video", "vc1", "vp8", "vp9", "av1"),
    "qsv" to listOf("h264", "hevc", "mpeg2video", "vc1", "vp8", "vp9", "av1"),
    "nvenc" to listOf("h264", "hevc", "mpeg2video", "mpeg4", "vc1", "vp8", "vp9", "av1"),
    "videotoolbox" to listOf("h264", "hevc", "vp8", "vp9"),
)
private val PRESETS = listOf("auto", "veryslow", "slower", "slow", "medium", "fast", "faster", "veryfast", "superfast", "ultrafast")
private val ALGORITHMS = listOf("none", "clip", "linear", "gamma", "reinhard", "hable", "mobius", "bt2390")
private val MODES = listOf("auto", "max", "rgb", "lum", "itp")
private val RANGES = listOf("auto", "tv", "pc")
private val DEINTERLACERS = listOf("yadif", "bwdif")
private val DOWNMIXES = listOf("none", "dave750", "nightmode-dialogue", "rfc7845", "ac4")

/** A number field's limits, as the contract has them, and whether it takes only whole numbers. */
private data class Limits(val min: Double, val max: Double, val whole: Boolean)

private val NUMBERS = mapOf(
    "h264Crf" to Limits(0.0, 51.0, true),
    "hevcCrf" to Limits(0.0, 51.0, true),
    "tonemappingDesat" to Limits(0.0, 100.0, false),
    "tonemappingPeak" to Limits(0.0, 10_000.0, false),
    "tonemappingParam" to Limits(0.0, 1000.0, false),
    "vppTonemappingBrightness" to Limits(0.0, 100.0, false),
    "vppTonemappingContrast" to Limits(1.0, 2.0, false),
    "downMixAudioBoost" to Limits(0.5, 3.0, false),
    "throttleDelaySeconds" to Limits(10.0, 3600.0, true),
    "segmentKeepSeconds" to Limits(60.0, 86_400.0, true),
)

private fun JsonObject.bool(key: String) = this[key]?.jsonPrimitive?.booleanOrNull ?: false
private fun JsonObject.text(key: String) = this[key]?.jsonPrimitive?.contentOrNull.orEmpty()
private fun JsonObject.number(key: String) = this[key]?.jsonPrimitive?.doubleOrNull ?: 0.0
private fun JsonObject.with(key: String, value: JsonElement) = JsonObject(this + (key to value))
private fun JsonObject.with(key: String, value: Boolean) = with(key, JsonPrimitive(value))
private fun JsonObject.with(key: String, value: String) = with(key, JsonPrimitive(value))

/** "12" for 12.0, "0.5" for 0.5, as a field shows a number. */
private fun show(number: Double): String = if (number % 1.0 == 0.0) number.toLong().toString() else number.toString()

/**
 * How the server transcodes video, as the web's transcoding panel: what
 * its ffmpeg and GPUs can do, the acceleration and its decoders, what
 * encodes produce, tone mapping, deinterlacing, audio, and throttling.
 * The fields save together.
 */
@Composable
fun TranscodingSettings() {
    val api = LocalApi.current
    val loader = rememberLoader("admin-transcoding") { transcodingSettings() }
    val saver = rememberSaver()
    SettingsScaffold(stringResource(R.string.settings_admin_transcoding)) {
        loaded(loader, { stringResource(R.string.web_transcoding_loadFailed, it) }) { saved ->
            item(key = "form") {
                TranscodingForm(
                    saved,
                    saver,
                    onDetect = { saver { loader.show(api.detectTranscoding()) } },
                ) { settings -> saver { loader.show(api.setTranscodingSettings(settings)) } }
            }
        }
    }
}

@Composable
private fun TranscodingForm(saved: AdminTranscoding, saver: Saver, onDetect: () -> Unit, save: (JsonObject) -> Unit) {
    var draft by remember(saved) { mutableStateOf(saved.settings) }
    // What each number field holds while it's typed, kept apart until it's a number in range.
    var typed by remember(saved) { mutableStateOf(mapOf<String, String>()) }
    val invalid = typed.filter { (key, text) ->
        val limits = NUMBERS.getValue(key)
        val value = text.trim().replace(',', '.').toDoubleOrNull()
        value == null || value < limits.min || value > limits.max || (limits.whole && value % 1.0 != 0.0)
    }.keys
    val acceleration = draft.text("hardwareAcceleration")
    val hardware = acceleration != "none"
    val capabilities = saved.capabilities

    @Composable
    fun Switch(key: String, label: Int) = SwitchRow(stringResource(label), draft.bool(key)) { draft = draft.with(key, it) }

    @Composable
    fun Pick(key: String, label: Int, options: List<Pair<String, String>>) =
        PickerRow(stringResource(label), options, draft.text(key)) { draft = draft.with(key, it) }

    @Composable
    fun Number(key: String, label: Int) {
        val limits = NUMBERS.getValue(key)
        val text = typed[key] ?: show(draft.number(key))
        TextRow(
            stringResource(label),
            text,
            { input ->
                typed = typed + (key to input)
                input.trim().replace(',', '.').toDoubleOrNull()
                    ?.takeIf { it >= limits.min && it <= limits.max && (!limits.whole || it % 1.0 == 0.0) }
                    ?.let { value ->
                        draft = draft.with(key, if (limits.whole) JsonPrimitive(value.toLong()) else JsonPrimitive(value))
                        typed = typed - key
                    }
            },
            keyboard = KeyboardType.Decimal,
            error = if (key in invalid) stringResource(R.string.web_transcoding_checkField, stringResource(label)) else null,
        )
    }

    Column(verticalArrangement = Arrangement.spacedBy(28.dp)) {
        FfmpegSection(capabilities, saver, onDetect)

        Section(stringResource(R.string.web_transcoding_hardware_title)) {
            Panel {
                Pick(
                    "hardwareAcceleration",
                    R.string.web_transcoding_hardware_acceleration,
                    ACCELERATIONS.map { it to accelerationName(it) },
                )
                when (acceleration) {
                    "vaapi" -> {
                        RowDivider()
                        TextRow(stringResource(R.string.web_transcoding_field_vaapiDevice), draft.text("vaapiDevice"), { draft = draft.with("vaapiDevice", it) },
                            placeholder = saved.defaults.text("vaapiDevice").ifBlank { "/dev/dri/renderD128" })
                    }
                    "qsv" -> {
                        RowDivider()
                        TextRow(stringResource(R.string.web_transcoding_field_qsvDevice), draft.text("qsvDevice"), { draft = draft.with("qsvDevice", it) },
                            placeholder = saved.defaults.text("qsvDevice").ifBlank { null })
                    }
                }
                if (hardware) {
                    RowDivider()
                    Switch("enableHardwareEncoding", R.string.web_transcoding_hardware_encoding)
                }
                // Intel's low-power encoders, on QSV and on VAAPI.
                if (acceleration == "qsv" || acceleration == "vaapi") {
                    RowDivider()
                    SwitchRow(stringResource(R.string.web_transcoding_hardware_lowPower, "H.264"), draft.bool("enableIntelLowPowerH264HwEncoder")) {
                        draft = draft.with("enableIntelLowPowerH264HwEncoder", it)
                    }
                    RowDivider()
                    SwitchRow(stringResource(R.string.web_transcoding_hardware_lowPower, "HEVC"), draft.bool("enableIntelLowPowerHevcHwEncoder")) {
                        draft = draft.with("enableIntelLowPowerHevcHwEncoder", it)
                    }
                }
            }
            deviceFailure(capabilities, acceleration)?.let {
                Gap(8.dp)
                Text(it, style = MaterialTheme.typography.bodySmall, color = Palette.Danger)
            }
        }

        if (hardware) {
            Section(stringResource(R.string.web_transcoding_decoding_title)) {
                val codecs = draft["hardwareDecodingCodecs"]?.jsonArray?.map { it.jsonPrimitive.content }.orEmpty()
                Panel {
                    DECODE_SUPPORT[acceleration].orEmpty().forEachIndexed { index, codec ->
                        if (index > 0) RowDivider()
                        SwitchRow(videoCodecName(codec), codec in codecs) { on ->
                            val next = if (on) codecs + codec else codecs - codec
                            draft = draft.with("hardwareDecodingCodecs", JsonArray(next.distinct().map(::JsonPrimitive)))
                        }
                    }
                }
                Gap(12.dp)
                Panel {
                    Switch("enableDecodingColorDepth10Hevc", R.string.web_transcoding_decoding_hevc10)
                    RowDivider()
                    Switch("enableDecodingColorDepth10Vp9", R.string.web_transcoding_decoding_vp910)
                    RowDivider()
                    Switch("enableDecodingColorDepth10HevcRext", R.string.web_transcoding_decoding_hevcRext)
                    RowDivider()
                    Switch("enableDecodingColorDepth12HevcRext", R.string.web_transcoding_decoding_hevcRext12)
                }
            }
        }

        Section(stringResource(R.string.web_transcoding_encoding_title)) {
            Panel {
                Switch("allowHevcEncoding", R.string.web_transcoding_encoding_hevc)
                RowDivider()
                Switch("allowAv1Encoding", R.string.web_transcoding_encoding_av1)
                RowDivider()
                Pick("encoderPreset", R.string.web_transcoding_encoding_preset, PRESETS.map { it to if (it == "auto") stringResource(R.string.web_transcoding_auto) else it })
                RowDivider()
                Number("h264Crf", R.string.web_transcoding_field_h264Crf)
                RowDivider()
                Number("hevcCrf", R.string.web_transcoding_field_hevcCrf)
            }
        }

        Section(stringResource(R.string.web_transcoding_toneMapping_title)) {
            Panel {
                Switch("enableTonemapping", R.string.web_transcoding_toneMapping_hardware)
                if (acceleration == "qsv" || acceleration == "vaapi") {
                    RowDivider()
                    Switch("enableVppTonemapping", R.string.web_transcoding_toneMapping_vpp)
                }
                if (acceleration == "videotoolbox") {
                    RowDivider()
                    Switch("enableVideoToolboxTonemapping", R.string.web_transcoding_toneMapping_videoToolbox)
                }
                RowDivider()
                Pick("tonemappingAlgorithm", R.string.web_transcoding_toneMapping_algorithm, ALGORITHMS.map { it to algorithmName(it) })
                RowDivider()
                Pick("tonemappingMode", R.string.web_transcoding_toneMapping_mode, MODES.map { it to if (it == "auto") stringResource(R.string.web_transcoding_auto) else it.uppercase() })
                RowDivider()
                Pick("tonemappingRange", R.string.web_transcoding_toneMapping_range, RANGES.map { it to if (it == "auto") stringResource(R.string.web_transcoding_auto) else it.uppercase() })
                RowDivider()
                Number("tonemappingDesat", R.string.web_transcoding_field_tonemappingDesat)
                RowDivider()
                Number("tonemappingPeak", R.string.web_transcoding_field_tonemappingPeak)
                RowDivider()
                Number("tonemappingParam", R.string.web_transcoding_field_tonemappingParam)
                if (draft.bool("enableVppTonemapping") && (acceleration == "qsv" || acceleration == "vaapi")) {
                    RowDivider()
                    Number("vppTonemappingBrightness", R.string.web_transcoding_field_vppTonemappingBrightness)
                    RowDivider()
                    Number("vppTonemappingContrast", R.string.web_transcoding_field_vppTonemappingContrast)
                }
            }
        }

        Section(stringResource(R.string.web_transcoding_deinterlacing_title)) {
            Panel {
                Pick("deinterlaceMethod", R.string.web_transcoding_deinterlacing_method, DEINTERLACERS.map { it to it })
                RowDivider()
                Switch("deinterlaceDoubleRate", R.string.web_transcoding_deinterlacing_doubleRate)
            }
        }

        Section(stringResource(R.string.web_transcoding_audio_title)) {
            Panel {
                Pick("downMixStereoAlgorithm", R.string.web_transcoding_audio_downmix, DOWNMIXES.map { it to downmixName(it) })
                RowDivider()
                Number("downMixAudioBoost", R.string.web_transcoding_field_downMixAudioBoost)
                RowDivider()
                Switch("enableAudioVbr", R.string.web_transcoding_audio_vbr)
            }
        }

        Section(stringResource(R.string.web_transcoding_segments_title)) {
            Panel {
                Switch("enableThrottling", R.string.web_transcoding_segments_throttle)
                if (draft.bool("enableThrottling")) {
                    RowDivider()
                    Number("throttleDelaySeconds", R.string.web_transcoding_field_throttleDelaySeconds)
                }
                RowDivider()
                Switch("enableSegmentDeletion", R.string.web_transcoding_segments_delete)
                if (draft.bool("enableSegmentDeletion")) {
                    RowDivider()
                    Number("segmentKeepSeconds", R.string.web_transcoding_field_segmentKeepSeconds)
                }
            }
        }

        SaveButtons(
            dirty = (draft != saved.settings || typed.isNotEmpty()) && invalid.isEmpty(),
            saver = saver,
            onReset = {
                draft = saved.settings
                typed = emptyMap()
            },
        ) { save(draft) }
    }
}

/** What the server's ffmpeg is, when it was looked at, and looking again. */
@Composable
private fun FfmpegSection(capabilities: JsonObject, saver: Saver, onDetect: () -> Unit) {
    val version = capabilities.text("version").ifBlank { stringResource(R.string.web_transcoding_ffmpeg_unknownVersion) }
    val detectedAt = capabilities.text("detectedAt")
    val when_ = runCatching {
        DateUtils.getRelativeTimeSpanString(Instant.parse(detectedAt).toEpochMilli(), System.currentTimeMillis(), DateUtils.MINUTE_IN_MILLIS).toString()
    }.getOrDefault(detectedAt)
    val error = capabilities.text("error").ifBlank { null }
    Column {
        Panel {
            // What runs, and when the server last looked; not a link.
            Row(Modifier.padding(horizontal = 16.dp, vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                LucideIcon(Lucide.Film, null, size = 20.dp, tint = Palette.Muted)
                Gap(14.dp)
                Column(Modifier.weight(1f)) {
                    Text("ffmpeg", style = MaterialTheme.typography.bodyLarge)
                    if (error == null) {
                        Text(stringResource(R.string.web_transcoding_ffmpeg_detected, version, when_), style = MaterialTheme.typography.bodySmall, color = Palette.Muted)
                    }
                }
            }
            RowDivider()
            LinkRow(
                stringResource(if (saver.saving) R.string.web_transcoding_ffmpeg_detecting else R.string.web_transcoding_ffmpeg_detect),
                icon = Lucide.RefreshCw,
                onClick = onDetect,
            )
        }
        if (error != null) {
            Gap(8.dp)
            Text(stringResource(R.string.web_transcoding_ffmpeg_failed), style = MaterialTheme.typography.bodySmall, color = Palette.Danger)
            Text(error, style = MaterialTheme.typography.bodySmall, color = Palette.Muted, modifier = Modifier)
        }
    }
}

/** Why the chosen GPU won't be used, when detection says its device didn't open. */
@Composable
private fun deviceFailure(capabilities: JsonObject, acceleration: String): String? {
    if (acceleration == "none") return null
    val hardware = capabilities["hardware"] as? JsonArray ?: return null
    val entry = hardware.firstOrNull { it.jsonObject.text("acceleration") == acceleration }?.jsonObject
        ?: return stringResource(R.string.web_transcoding_hardware_notInBuild)
    val device = entry["device"]?.jsonObject ?: return null
    return if (device.text("status") == "ok") null else stringResource(R.string.web_transcoding_hardware_deviceFailed)
}

@Composable
private fun accelerationName(id: String): String = stringResource(
    when (id) {
        "vaapi" -> R.string.web_transcoding_acceleration_vaapi
        "qsv" -> R.string.web_transcoding_acceleration_qsv
        "nvenc" -> R.string.web_transcoding_acceleration_nvenc
        "videotoolbox" -> R.string.web_transcoding_acceleration_videotoolbox
        else -> R.string.web_transcoding_acceleration_none
    },
)

@Composable
private fun algorithmName(id: String): String = stringResource(
    when (id) {
        "clip" -> R.string.web_transcoding_algorithm_clip
        "linear" -> R.string.web_transcoding_algorithm_linear
        "gamma" -> R.string.web_transcoding_algorithm_gamma
        "reinhard" -> R.string.web_transcoding_algorithm_reinhard
        "hable" -> R.string.web_transcoding_algorithm_hable
        "mobius" -> R.string.web_transcoding_algorithm_mobius
        "bt2390" -> R.string.web_transcoding_algorithm_bt2390
        else -> R.string.web_transcoding_algorithm_none
    },
)

@Composable
private fun downmixName(id: String): String = stringResource(
    when (id) {
        "dave750" -> R.string.web_transcoding_downmix_dave750
        "nightmode-dialogue" -> R.string.web_transcoding_downmix_nightmode_dialogue
        "rfc7845" -> R.string.web_transcoding_downmix_rfc7845
        "ac4" -> R.string.web_transcoding_downmix_ac4
        else -> R.string.web_transcoding_downmix_none
    },
)
