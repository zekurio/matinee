package io.github.zekurio.matinee.scanner

import android.Manifest
import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.provider.Settings
import android.util.Size
import android.view.Surface
import androidx.camera.core.CameraInfoUnavailableException
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.InitializationException
import androidx.camera.core.Preview
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.lifecycle.awaitInstance
import androidx.lifecycle.LifecycleOwner
import com.google.zxing.BarcodeFormat
import com.google.zxing.BinaryBitmap
import com.google.zxing.DecodeHintType
import com.google.zxing.MultiFormatReader
import com.google.zxing.PlanarYUVLuminanceSource
import com.google.zxing.ReaderException
import com.google.zxing.common.HybridBinarizer
import io.flutter.plugin.common.BinaryMessenger
import io.flutter.view.TextureRegistry
import java.util.concurrent.Executor
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import kotlin.coroutines.resume
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.MainScope
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull

/**
 * The camera reading QR codes: the back camera's picture into a texture Flutter
 * draws, and every frame read with ZXing. The camera is bound to the activity's
 * lifecycle, so it closes while the app is away and opens again when it's back.
 */
class ScannerBridge(
    private val activity: Activity,
    private val owner: LifecycleOwner,
    private val textures: TextureRegistry,
    messenger: BinaryMessenger,
) : ScannerApi {
    private val events = ScannerEvents(messenger)
    private val scope = MainScope()
    private val handler = Handler(Looper.getMainLooper())
    private val main = Executor { handler.post(it) }

    /** Everyone waiting on the one permission prompt. */
    private val waiting = mutableListOf<(Boolean) -> Unit>()

    private var running: Running? = null

    /** The last code sent, so one held in view doesn't flood Dart. */
    private var lastText: String? = null
    private var lastAt = 0L

    private class Running(
        val provider: ProcessCameraProvider,
        val preview: Preview,
        val analysis: ImageAnalysis,
        val producer: TextureRegistry.SurfaceProducer,
        val reading: ExecutorService,
    )

    override fun hasCamera(): Boolean =
        activity.packageManager.hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY)

    override fun cameraAllowed(): Boolean =
        activity.checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED

    override suspend fun requestCamera(): CameraAnswer {
        if (cameraAllowed()) return CameraAnswer.ALLOWED
        // Android wants the reason shown only between the first no and the
        // second. False both before the ask and after a no means it didn't
        // show the prompt, so a tap that asks again would do nothing.
        val explainedBefore = explainCamera()
        val granted = suspendCancellableCoroutine { continuation ->
            waiting += { granted -> if (continuation.isActive) continuation.resume(granted) }
            if (waiting.size == 1) {
                activity.requestPermissions(arrayOf(Manifest.permission.CAMERA), CAMERA_REQUEST)
            }
        }
        return when {
            granted -> CameraAnswer.ALLOWED
            !explainedBefore && !explainCamera() -> CameraAnswer.BLOCKED
            else -> CameraAnswer.DENIED
        }
    }

    private fun explainCamera(): Boolean =
        activity.shouldShowRequestPermissionRationale(Manifest.permission.CAMERA)

    /** True when it took the answer, which was to its own prompt. */
    fun onRequestPermissionsResult(requestCode: Int): Boolean {
        if (requestCode != CAMERA_REQUEST) return false
        val granted = cameraAllowed()
        val callbacks = waiting.toList()
        waiting.clear()
        callbacks.forEach { it(granted) }
        return true
    }

    override fun openAppSettings() {
        try {
            activity.startActivity(
                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", activity.packageName, null)),
            )
        } catch (_: ActivityNotFoundException) {
            // A device without the page: nothing else to open.
        }
    }

    override suspend fun start(): ScannerView {
        stop()
        val provider = try {
            ProcessCameraProvider.awaitInstance(activity)
        } catch (e: CancellationException) {
            throw e
        } catch (e: InitializationException) {
            throw failure(e)
        }
        val selector = try {
            if (provider.hasCamera(CameraSelector.DEFAULT_BACK_CAMERA)) {
                CameraSelector.DEFAULT_BACK_CAMERA
            } else {
                CameraSelector.DEFAULT_FRONT_CAMERA
            }
        } catch (e: CameraInfoUnavailableException) {
            throw failure(e)
        }
        val rotation = displayRotation()
        val preview = Preview.Builder().setTargetRotation(rotation).build()
        val analysis = ImageAnalysis.Builder()
            // Enough detail for a QR code across the room, little enough to read every frame.
            .setResolutionSelector(
                ResolutionSelector.Builder()
                    .setResolutionStrategy(ResolutionStrategy(Size(1280, 720), ResolutionStrategy.FALLBACK_RULE_CLOSEST_HIGHER_THEN_LOWER))
                    .build(),
            )
            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
            .setTargetRotation(rotation)
            .build()
        val reading = Executors.newSingleThreadExecutor()
        val producer = textures.createSurfaceProducer()
        val current = Running(provider, preview, analysis, producer, reading)
        running = current
        lastText = null

        analysis.setAnalyzer(reading, QrReader { text -> main.execute { if (running === current) found(text) } })
        val resolution = CompletableDeferred<Size>()
        fun provide() {
            preview.setSurfaceProvider(main) { request ->
                if (running !== current) {
                    request.willNotProvideSurface()
                    return@setSurfaceProvider
                }
                val size = request.resolution
                producer.setSize(size.width, size.height)
                // The producer owns the surface, so there's nothing to release when it's done.
                request.provideSurface(producer.surface, main) {}
                resolution.complete(size)
            }
        }
        // Flutter lets the surface go while the app is away, on some
        // backends, and makes a new one when it's back: ask for that.
        producer.setCallback(
            object : TextureRegistry.SurfaceProducer.Callback {
                override fun onSurfaceAvailable() {
                    if (running === current) provide()
                }
            },
        )
        provide()
        try {
            provider.bindToLifecycle(owner, selector, preview, analysis)
        } catch (e: IllegalArgumentException) {
            // No camera the selector matches.
            stop()
            throw failure(e)
        } catch (e: IllegalStateException) {
            stop()
            throw failure(e)
        }
        val size = withTimeoutOrNull(START_TIMEOUT_MS) { resolution.await() }
        if (size == null || running !== current) {
            if (running === current) stop()
            throw FlutterError("camera", "The camera didn't start", null)
        }
        val info = provider.getCameraInfo(selector)
        val front = info.lensFacing == CameraSelector.LENS_FACING_FRONT
        val handled = producer.handlesCropAndRotation()
        val turns = if (handled) {
            // The texture's transform already stands the picture upright for
            // the device held as it naturally is, mirrored for a front
            // camera, so only the screen's own turn is left.
            val display = degrees(rotation)
            if (front) display else (360 - display) % 360
        } else {
            info.getSensorRotationDegrees(rotation)
        }
        val upright = handled && info.sensorRotationDegrees % 180 != 0
        return ScannerView(
            textureId = producer.id(),
            width = (if (upright) size.height else size.width).toLong(),
            height = (if (upright) size.width else size.height).toLong(),
            quarterTurns = (turns / 90).toLong(),
            mirrored = front && !handled,
        )
    }

    override fun stop() {
        val current = running ?: return
        running = null
        current.provider.unbind(current.preview, current.analysis)
        current.analysis.clearAnalyzer()
        current.reading.shutdown()
        current.producer.setCallback(null)
        current.producer.release()
    }

    /** As the activity goes: the camera, and anyone waiting on the prompt. */
    fun release() {
        stop()
        onRequestPermissionsResult(CAMERA_REQUEST)
        scope.cancel()
    }

    private fun found(text: String) {
        val now = SystemClock.uptimeMillis()
        if (text == lastText && now - lastAt < REPEAT_MS) return
        lastText = text
        lastAt = now
        scope.launch {
            try {
                events.scanned(text)
            } catch (_: FlutterError) {
                // Nobody listening on the Dart side any more.
            }
        }
    }

    @Suppress("DEPRECATION")
    private fun displayRotation(): Int =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            activity.display?.rotation ?: Surface.ROTATION_0
        } else {
            activity.windowManager.defaultDisplay.rotation
        }

    private companion object {
        const val CAMERA_REQUEST = 7423
        const val START_TIMEOUT_MS = 10_000L
        const val REPEAT_MS = 500L

        fun degrees(rotation: Int): Int = when (rotation) {
            Surface.ROTATION_90 -> 90
            Surface.ROTATION_180 -> 180
            Surface.ROTATION_270 -> 270
            else -> 0
        }

        fun failure(cause: Exception) = FlutterError("camera", cause.message, null)
    }
}

/**
 * Reads QR codes in camera frames with ZXing. The first plane of a YUV_420_888
 * frame is its brightness, all a QR code needs, and a QR code reads the same at
 * any angle, so the frame's rotation doesn't matter.
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
