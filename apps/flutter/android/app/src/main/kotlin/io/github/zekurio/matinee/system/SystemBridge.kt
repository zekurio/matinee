package io.github.zekurio.matinee.system

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Process
import android.os.ext.SdkExtensions
import android.provider.MediaStore
import java.io.ByteArrayOutputStream
import java.io.IOException
import java.io.InputStream
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext

/**
 * What Dart asks of the system around the app. The activity hands it the
 * results of what it starts, through [onActivityResult].
 */
class SystemBridge(private val activity: Activity) : SystemApi {
    /** Waiting on the photo picker, which answers once. */
    private var picking: ((Uri?) -> Unit)? = null

    /**
     * The system's photo picker where it has one, as `PickVisualMedia`
     * opens it, else the document picker, both for images only.
     */
    override suspend fun pickImage(maxBytes: Long): PickedImage? {
        val uri = suspendCancellableCoroutine<Uri?> { continuation ->
            // A second pick while one is open gets nothing.
            picking?.invoke(null)
            picking = { uri -> if (continuation.isActive) continuation.resume(uri) }
            val intent = if (hasPhotoPicker()) {
                Intent(MediaStore.ACTION_PICK_IMAGES).setType("image/*")
            } else {
                Intent(Intent.ACTION_OPEN_DOCUMENT)
                    .addCategory(Intent.CATEGORY_OPENABLE)
                    .setType("image/*")
                    .putExtra(Intent.EXTRA_MIME_TYPES, IMAGE_TYPES)
            }
            try {
                activity.startActivityForResult(intent, PICK_IMAGE_REQUEST)
            } catch (_: ActivityNotFoundException) {
                picking = null
                continuation.resume(null)
            }
        } ?: return null
        val resolver = activity.contentResolver
        val type = resolver.getType(uri)
        val limit = (maxBytes + 1).coerceAtMost(Int.MAX_VALUE.toLong()).toInt()
        val bytes = withContext(Dispatchers.IO) {
            try {
                resolver.openInputStream(uri)?.use { it.readAtMost(limit) }
            } catch (_: IOException) {
                null
            } catch (_: SecurityException) {
                null
            }
        }
        return PickedImage(type, bytes)
    }

    override suspend fun readLog(maxLines: Long): List<String> = withContext(Dispatchers.IO) {
        try {
            val process = ProcessBuilder(
                "logcat", "-d", "-v", "threadtime", "--pid=${Process.myPid()}", "-t", "$maxLines",
            )
                .redirectErrorStream(true)
                .start()
            try {
                process.inputStream.bufferedReader().readLines().also {
                    process.waitFor(LOGCAT_TIMEOUT_SECONDS, TimeUnit.SECONDS)
                }
            } finally {
                process.destroy()
            }
        } catch (e: IOException) {
            listOf("logcat unavailable: ${e.javaClass.simpleName}")
        }
    }

    override fun shareText(subject: String, text: String) {
        val send = Intent(Intent.ACTION_SEND)
            .setType("text/plain")
            .putExtra(Intent.EXTRA_SUBJECT, subject)
            .putExtra(Intent.EXTRA_TEXT, text)
        try {
            activity.startActivity(Intent.createChooser(send, null))
        } catch (_: ActivityNotFoundException) {
            // Nothing takes text.
        }
    }

    /** True when it took the result, which was for something it started. */
    fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?): Boolean {
        if (requestCode != PICK_IMAGE_REQUEST) return false
        val answer = picking
        picking = null
        answer?.invoke(if (resultCode == Activity.RESULT_OK) data?.data else null)
        return true
    }

    /** Whatever was waiting gets nothing, as the activity goes. */
    fun release() {
        picking?.invoke(null)
        picking = null
    }

    private companion object {
        const val PICK_IMAGE_REQUEST = 7422
        const val LOGCAT_TIMEOUT_SECONDS = 5L
        val IMAGE_TYPES = arrayOf("image/jpeg", "image/png", "image/webp")

        /** Android 13, or 11 and 12 with the photo picker's system update, as `PickVisualMedia` checks. */
        fun hasPhotoPicker(): Boolean = when {
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU -> true
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.R -> SdkExtensions.getExtensionVersion(Build.VERSION_CODES.R) >= 2
            else -> false
        }
    }
}

/** Up to [limit] bytes of the stream: enough to tell one over a limit without reading all of it. */
private fun InputStream.readAtMost(limit: Int): ByteArray {
    val out = ByteArrayOutputStream()
    val buffer = ByteArray(64 * 1024)
    while (out.size() < limit) {
        val read = read(buffer, 0, minOf(buffer.size, limit - out.size()))
        if (read < 0) break
        out.write(buffer, 0, read)
    }
    return out.toByteArray()
}
