package io.github.zekurio.matinee.ui.settings

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.SystemClock
import android.provider.Settings
import android.util.Size
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.annotation.DrawableRes
import androidx.camera.compose.CameraXViewfinder
import androidx.camera.core.CameraInfoUnavailableException
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.InitializationException
import androidx.camera.core.Preview
import androidx.camera.core.SurfaceRequest
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.lifecycle.awaitInstance
import androidx.camera.viewfinder.core.ImplementationMode
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.currentStateAsState
import com.google.zxing.BarcodeFormat
import com.google.zxing.BinaryBitmap
import com.google.zxing.DecodeHintType
import com.google.zxing.MultiFormatReader
import com.google.zxing.PlanarYUVLuminanceSource
import com.google.zxing.ReaderException
import com.google.zxing.common.HybridBinarizer
import io.github.zekurio.matinee.R
import io.github.zekurio.matinee.api.ApiException
import io.github.zekurio.matinee.api.DeviceRequest
import io.github.zekurio.matinee.api.name
import io.github.zekurio.matinee.app
import io.github.zekurio.matinee.auth.AuthState
import io.github.zekurio.matinee.auth.ScannedCode
import io.github.zekurio.matinee.auth.UserCode
import io.github.zekurio.matinee.auth.scannedCode
import io.github.zekurio.matinee.ui.LocalNavigator
import io.github.zekurio.matinee.ui.LocalUser
import io.github.zekurio.matinee.ui.TopBar
import io.github.zekurio.matinee.ui.components.LocalApi
import io.github.zekurio.matinee.ui.describeFailure
import io.github.zekurio.matinee.ui.kit.ButtonLook
import io.github.zekurio.matinee.ui.kit.Gap
import io.github.zekurio.matinee.ui.kit.Gutter
import io.github.zekurio.matinee.ui.kit.Lucide
import io.github.zekurio.matinee.ui.kit.LucideIcon
import io.github.zekurio.matinee.ui.kit.MatineeButton
import io.github.zekurio.matinee.ui.kit.MatineeTextField
import io.github.zekurio.matinee.ui.kit.Spinner
import io.github.zekurio.matinee.ui.theme.Palette
import java.io.IOException
import java.util.concurrent.Executors
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/*
 * Signing in a TV or another app as this account, from Settings, Account:
 * the camera reads the QR code the device shows, or the person types its
 * code, and then approves it, as the web's /link page does. The device
 * notices on its next poll.
 */

/** The contract's `DevicePlatform` by name, the same in every language, as the web's `platformLabel`. */
fun platformLabel(platform: String): String = when (platform) {
    "android" -> "Android"
    "androidtv" -> "Android TV"
    "ios" -> "iOS"
    "linux" -> "Linux"
    "macos" -> "macOS"
    "tizen" -> "Samsung TV"
    "windows" -> "Windows"
    else -> platform.replaceFirstChar(Char::titlecase)
}

/** What a device is, at a glance. Null is a browser. */
@DrawableRes
fun platformIcon(platform: String?): Int = when (platform) {
    "androidtv", "tizen" -> Lucide.Tv
    "android", "ios" -> Lucide.Smartphone
    else -> Lucide.Monitor
}

@Composable
fun LinkDeviceScreen() {
    // The code being checked, and the server its QR code named. Typed codes name none.
    var code by rememberSaveable { mutableStateOf<String?>(null) }
    var from by rememberSaveable { mutableStateOf<String?>(null) }
    var typed by rememberSaveable { mutableStateOf(false) }
    Column(Modifier.fillMaxSize()) {
        TopBar(stringResource(R.string.link_title))
        Column(
            Modifier
                .fillMaxSize()
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = Gutter)
                .padding(top = 8.dp, bottom = 24.dp)
                .navigationBarsPadding(),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Column(Modifier.widthIn(max = 440.dp).fillMaxWidth()) {
                val current = code
                if (current == null) {
                    ScanStep { scanned, byHand ->
                        code = scanned.userCode
                        from = scanned.server
                        typed = byHand
                    }
                } else {
                    key(current) {
                        ApproveStep(current, from, typed) {
                            code = null
                            from = null
                        }
                    }
                }
            }
        }
    }
}

/** The camera, where the device has one, and the field for typing the code. */
@Composable
private fun ScanStep(onCode: (ScannedCode, byHand: Boolean) -> Unit) {
    val context = LocalContext.current
    val camera = remember { context.packageManager.hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY) }
    if (camera) {
        CameraScanner { onCode(it, false) }
        Gap(32.dp)
        Text(stringResource(R.string.link_or_enter), style = MaterialTheme.typography.titleMedium)
    } else {
        // A TV signing in another TV: no camera, only the code.
        Text(stringResource(R.string.link_enter_code), style = MaterialTheme.typography.bodyMedium, color = Palette.Muted)
    }
    Gap(12.dp)
    CodeField { onCode(ScannedCode(it, null), true) }
}

@Composable
private fun CodeField(onCode: (String) -> Unit) {
    var text by rememberSaveable { mutableStateOf("") }
    var tried by remember { mutableStateOf(false) }
    val parsed = UserCode.parse(text)
    val submit = {
        tried = true
        if (parsed != null) onCode(parsed)
    }
    MatineeTextField(
        value = text,
        onValueChange = { text = it.take(9) },
        placeholder = stringResource(R.string.link_code_placeholder),
        isError = tried && parsed == null,
        keyboardOptions = KeyboardOptions(
            capitalization = KeyboardCapitalization.Characters,
            autoCorrectEnabled = false,
            keyboardType = KeyboardType.Ascii,
            imeAction = ImeAction.Go,
        ),
        keyboardActions = KeyboardActions(onGo = { submit() }),
    )
    if (tried && parsed == null) {
        Gap(6.dp)
        Text(stringResource(R.string.link_code_invalid), style = MaterialTheme.typography.bodySmall, color = Palette.Danger)
    }
    Gap(12.dp)
    MatineeButton(onClick = submit, enabled = text.isNotBlank(), look = ButtonLook.Secondary, modifier = Modifier.fillMaxWidth()) {
        Text(stringResource(R.string.link_continue))
    }
}

private val ViewfinderShape = RoundedCornerShape(16.dp)

/** A square of the camera's picture, once the person allows it, with what it found under it. */
@Composable
private fun CameraScanner(onCode: (ScannedCode) -> Unit) {
    val context = LocalContext.current
    val haptics = LocalHapticFeedback.current
    // Checked again on coming back, as from the app's page in the system settings.
    val lifecycle by LocalLifecycleOwner.current.lifecycle.currentStateAsState()
    var answers by remember { mutableIntStateOf(0) }
    val granted = remember(lifecycle, answers) {
        ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
    }
    var asked by rememberSaveable { mutableIntStateOf(0) }
    val ask = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { answers++ }
    LaunchedEffect(Unit) {
        if (!granted && asked == 0) {
            asked = 1
            ask.launch(Manifest.permission.CAMERA)
        }
    }
    // When the camera last saw a QR code that isn't a Matinee sign-in.
    var foreignAt by remember { mutableLongStateOf(0L) }
    LaunchedEffect(foreignAt) {
        if (foreignAt != 0L) {
            delay(2500)
            foreignAt = 0L
        }
    }
    var failed by remember { mutableStateOf(false) }

    Box(
        Modifier
            .fillMaxWidth()
            .aspectRatio(1f)
            .clip(ViewfinderShape)
            .background(Palette.Card)
            .border(1.dp, Palette.Border, ViewfinderShape),
        contentAlignment = Alignment.Center,
    ) {
        when {
            failed -> CameraNotice(stringResource(R.string.link_camera_failed))
            granted -> {
                Viewfinder(onFailed = { failed = true }) { text ->
                    val scanned = scannedCode(text)
                    if (scanned != null) {
                        haptics.performHapticFeedback(HapticFeedbackType.Confirm)
                        onCode(scanned)
                    } else if (SystemClock.uptimeMillis() - foreignAt > 500) {
                        foreignAt = SystemClock.uptimeMillis()
                    }
                    scanned != null
                }
                ScanCorners(Modifier.fillMaxSize().padding(40.dp))
            }
            else -> CameraNotice(stringResource(R.string.link_camera_needed)) {
                MatineeButton(
                    onClick = {
                        // Android stops asking after the second no; then only its settings can allow it.
                        if (asked >= 2) {
                            context.openAppSettings()
                        } else {
                            asked++
                            ask.launch(Manifest.permission.CAMERA)
                        }
                    },
                    look = ButtonLook.Outline,
                ) {
                    Text(stringResource(R.string.link_camera_allow))
                }
            }
        }
    }
    // What to do with the picture, while there is one.
    if (granted && !failed) {
        Gap(12.dp)
        Text(
            stringResource(if (foreignAt != 0L) R.string.link_scan_foreign else R.string.link_scan_hint),
            style = MaterialTheme.typography.bodyMedium,
            color = if (foreignAt != 0L) Palette.Foreground else Palette.Muted,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
private fun CameraNotice(text: String, action: (@Composable () -> Unit)? = null) {
    Column(Modifier.padding(28.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        LucideIcon(Lucide.CameraOff, null, size = 28.dp, tint = Palette.Muted)
        Gap(12.dp)
        Text(text, style = MaterialTheme.typography.bodyMedium, color = Palette.Muted, textAlign = TextAlign.Center)
        if (action != null) {
            Gap(16.dp)
            action()
        }
    }
}

/** Four corners over the picture, where the QR code should go. */
@Composable
private fun ScanCorners(modifier: Modifier) {
    Canvas(modifier) {
        val arm = size.minDimension / 6
        val width = 3.dp.toPx()
        val corners = listOf(
            Offset(0f, 0f) to Offset(1f, 1f),
            Offset(size.width, 0f) to Offset(-1f, 1f),
            Offset(0f, size.height) to Offset(1f, -1f),
            Offset(size.width, size.height) to Offset(-1f, -1f),
        )
        for ((corner, direction) in corners) {
            drawLine(Color.White, corner, corner + Offset(arm * direction.x, 0f), width, StrokeCap.Round)
            drawLine(Color.White, corner, corner + Offset(0f, arm * direction.y), width, StrokeCap.Round)
        }
    }
}

/**
 * The back camera's picture, with every frame read for a QR code. [onText]
 * gets what one holds, on the main thread, and answers whether that was
 * the code it wanted; after that the frames go unread.
 */
@Composable
private fun Viewfinder(onFailed: () -> Unit, onText: (String) -> Boolean) {
    val context = LocalContext.current
    val owner = LocalLifecycleOwner.current
    var request by remember { mutableStateOf<SurfaceRequest?>(null) }
    val latest by rememberUpdatedState(onText)
    val failed by rememberUpdatedState(onFailed)
    LaunchedEffect(owner) {
        val main = ContextCompat.getMainExecutor(context)
        val reading = Executors.newSingleThreadExecutor()
        val preview = Preview.Builder().build().apply { setSurfaceProvider { request = it } }
        val analysis = ImageAnalysis.Builder()
            // Enough detail for a QR code across the room, little enough to read every frame.
            .setResolutionSelector(
                ResolutionSelector.Builder()
                    .setResolutionStrategy(ResolutionStrategy(Size(1280, 720), ResolutionStrategy.FALLBACK_RULE_CLOSEST_HIGHER_THEN_LOWER))
                    .build(),
            )
            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
            .build()
        var found = false
        analysis.setAnalyzer(reading, QrReader { text -> main.execute { if (!found) found = latest(text) } })
        var provider: ProcessCameraProvider? = null
        try {
            val camera = ProcessCameraProvider.awaitInstance(context)
            provider = camera
            val selector = if (camera.hasCamera(CameraSelector.DEFAULT_BACK_CAMERA)) {
                CameraSelector.DEFAULT_BACK_CAMERA
            } else {
                CameraSelector.DEFAULT_FRONT_CAMERA
            }
            camera.bindToLifecycle(owner, selector, preview, analysis)
            awaitCancellation()
        } catch (e: CancellationException) {
            throw e
        } catch (_: InitializationException) {
            failed()
        } catch (_: CameraInfoUnavailableException) {
            failed()
        } catch (_: IllegalArgumentException) {
            // No camera the selector matches.
            failed()
        } catch (_: IllegalStateException) {
            failed()
        } finally {
            provider?.unbind(preview, analysis)
            analysis.clearAnalyzer()
            reading.shutdown()
        }
    }
    // A TextureView rather than the default SurfaceView, which the box's
    // rounded clip doesn't reach. The picture is small, so it costs little.
    request?.let { CameraXViewfinder(it, Modifier.fillMaxSize(), implementationMode = ImplementationMode.EMBEDDED) }
}

/**
 * Reads QR codes in camera frames with ZXing. The first plane of a
 * YUV_420_888 frame is its brightness, all a QR code needs, and a QR code
 * reads the same at any angle, so the frame's rotation doesn't matter.
 */
private class QrReader(private val onText: (String) -> Unit) : ImageAnalysis.Analyzer {
    private val reader = MultiFormatReader().apply {
        setHints(
            mapOf(
                DecodeHintType.POSSIBLE_FORMATS to listOf(BarcodeFormat.QR_CODE),
                // Light on dark, as some apps draw them.
                DecodeHintType.ALSO_INVERTED to true,
            ),
        )
    }
    private var bytes = ByteArray(0)

    override fun analyze(image: ImageProxy) {
        image.use {
            val plane = it.planes[0]
            val buffer = plane.buffer
            val length = buffer.remaining()
            if (bytes.size < length) bytes = ByteArray(length)
            buffer.get(bytes, 0, length)
            val source = PlanarYUVLuminanceSource(bytes, plane.rowStride, it.height, 0, 0, it.width, it.height, false)
            try {
                onText(reader.decodeWithState(BinaryBitmap(HybridBinarizer(source))).text)
            } catch (_: ReaderException) {
                // No QR code in this frame.
            } finally {
                reader.reset()
            }
        }
    }
}

private fun Context.openAppSettings() {
    runCatching {
        startActivity(
            Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", packageName, null))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    }
}

/** Where checking a code stands. */
private sealed interface Approval {
    data object Checking : Approval

    data class Waiting(val request: DeviceRequest) : Approval

    data class Approved(val request: DeviceRequest) : Approval

    /** It expired, was used, or never was: on this server, at least. */
    data object Gone : Approval

    data class Failed(val message: String) : Approval
}

/**
 * The device [userCode] belongs to, for the person to check, and approving
 * it. [from] is the server the QR code named, to say so when it isn't this
 * one. [typed] when the person typed the code rather than scanned it.
 */
@Composable
private fun ApproveStep(userCode: String, from: String?, typed: Boolean, onAgain: () -> Unit) {
    val api = LocalApi.current
    val nav = LocalNavigator.current
    val user = LocalUser.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val authState by context.app.session.state.collectAsState()
    val server = (authState as? AuthState.SignedIn)?.server
    var state by remember { mutableStateOf<Approval>(Approval.Checking) }
    var attempt by remember { mutableIntStateOf(0) }
    var approving by remember { mutableStateOf(false) }
    var approveError by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(attempt) {
        state = Approval.Checking
        state = try {
            Approval.Waiting(api.auth.device.get(userCode))
        } catch (e: IOException) {
            if (e is ApiException && e.status == 404) Approval.Gone else Approval.Failed(describeFailure(context.resources, e))
        }
    }
    val again = stringResource(if (typed) R.string.link_again_typed else R.string.link_again)

    when (val current = state) {
        Approval.Checking -> Box(Modifier.fillMaxWidth().height(160.dp), contentAlignment = Alignment.Center) {
            Spinner(size = 32.dp, color = Palette.Accent)
        }
        is Approval.Waiting -> {
            val request = current.request
            DeviceCard(request)
            Gap(20.dp)
            Text(
                emphasized(stringResource(R.string.link_wants, user.name), user.name, SpanStyle(fontWeight = FontWeight.SemiBold)),
                style = MaterialTheme.typography.bodyLarge,
            )
            Gap(6.dp)
            Text(
                emphasized(
                    stringResource(R.string.link_code_shown, request.userCode),
                    request.userCode,
                    SpanStyle(fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Medium, color = Palette.Foreground),
                ),
                style = MaterialTheme.typography.bodyMedium,
                color = Palette.Muted,
            )
            Gap(24.dp)
            MatineeButton(
                onClick = {
                    if (approving) return@MatineeButton
                    approving = true
                    approveError = null
                    scope.launch {
                        try {
                            api.auth.device.approve(userCode)
                            state = Approval.Approved(request)
                        } catch (e: IOException) {
                            if (e is ApiException && e.status == 404) {
                                state = Approval.Gone
                            } else {
                                approveError = context.getString(R.string.link_approve_failed, describeFailure(context.resources, e))
                            }
                        } finally {
                            approving = false
                        }
                    }
                },
                enabled = !approving,
                modifier = Modifier.fillMaxWidth(),
            ) {
                if (approving) {
                    Spinner(size = 18.dp, color = Palette.AccentForeground)
                } else {
                    LucideIcon(Lucide.Check, null, size = 18.dp)
                }
                Text(stringResource(R.string.link_approve))
            }
            approveError?.let {
                Gap(10.dp)
                Text(it, style = MaterialTheme.typography.bodySmall, color = Palette.Danger)
            }
            Gap(10.dp)
            MatineeButton(onClick = onAgain, look = ButtonLook.Ghost, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.common_cancel))
            }
            Gap(20.dp)
            Text(stringResource(R.string.link_warning), style = MaterialTheme.typography.bodySmall, color = Palette.Muted)
        }
        is Approval.Approved -> Outcome(
            icon = Lucide.CircleCheck,
            tint = Palette.Accent,
            title = stringResource(R.string.link_signed_in),
            description = stringResource(R.string.link_signed_in_description, deviceLabel(current.request), user.name),
        ) {
            MatineeButton(onClick = nav::back, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.link_done))
            }
        }
        Approval.Gone -> Outcome(
            icon = Lucide.CircleAlert,
            tint = Palette.Muted,
            title = stringResource(R.string.link_code_gone),
            description = stringResource(R.string.link_code_gone_description),
            detail = if (from != null && server != null && from != server) stringResource(R.string.link_other_server, from, server) else null,
        ) {
            MatineeButton(onClick = onAgain, look = ButtonLook.Outline, modifier = Modifier.fillMaxWidth()) {
                Text(again)
            }
        }
        is Approval.Failed -> Outcome(
            icon = Lucide.CircleAlert,
            tint = Palette.Muted,
            title = stringResource(R.string.link_lookup_failed),
            description = current.message,
        ) {
            MatineeButton(onClick = { attempt++ }, look = ButtonLook.Outline, modifier = Modifier.fillMaxWidth()) {
                LucideIcon(Lucide.RefreshCw, null, size = 16.dp)
                Text(stringResource(R.string.common_retry))
            }
            Gap(10.dp)
            MatineeButton(onClick = onAgain, look = ButtonLook.Ghost, modifier = Modifier.fillMaxWidth()) {
                Text(again)
            }
        }
    }
}

/** [text] with [part], a value put into a message, in [style]. */
private fun emphasized(text: String, part: String, style: SpanStyle) = buildAnnotatedString {
    append(text)
    val at = text.indexOf(part)
    if (at >= 0) addStyle(style, at, at + part.length)
}

/** An app's device by its name, or by what it runs on: `Android TV app`. */
@Composable
private fun deviceLabel(request: DeviceRequest): String =
    request.deviceName ?: stringResource(R.string.account_device_app, platformLabel(request.platform))

/** The device a code belongs to, as the web's DeviceCard. */
@Composable
private fun DeviceCard(request: DeviceRequest) {
    Row(
        Modifier.fillMaxWidth().clip(PanelShape).background(Palette.Card).border(1.dp, Palette.Border, PanelShape).padding(14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Box(Modifier.size(44.dp).clip(RoundedCornerShape(10.dp)).background(Palette.Secondary), contentAlignment = Alignment.Center) {
            LucideIcon(platformIcon(request.platform), null, tint = Palette.Muted)
        }
        Column(Modifier.weight(1f)) {
            Text(deviceLabel(request), style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium)
            Text(platformLabel(request.platform), style = MaterialTheme.typography.bodySmall, color = Palette.Muted)
        }
    }
}

/** How checking a code ended, with what to do next. */
@Composable
private fun Outcome(
    @DrawableRes icon: Int,
    tint: Color,
    title: String,
    description: String,
    detail: String? = null,
    actions: @Composable ColumnScope.() -> Unit,
) {
    Gap(24.dp)
    LucideIcon(icon, null, size = 36.dp, tint = tint)
    Gap(16.dp)
    Text(title, style = MaterialTheme.typography.headlineSmall)
    Gap(8.dp)
    Text(description, style = MaterialTheme.typography.bodyMedium, color = Palette.Muted)
    if (detail != null) {
        Gap(8.dp)
        Text(detail, style = MaterialTheme.typography.bodyMedium, color = Palette.Muted)
    }
    Gap(28.dp)
    Column(Modifier.fillMaxWidth(), content = actions)
}
