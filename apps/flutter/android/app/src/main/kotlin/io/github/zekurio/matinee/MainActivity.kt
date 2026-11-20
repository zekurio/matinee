// Copyright (C) edde746 and Plezy contributors for the Flutter view setup.
// SPDX-License-Identifier: GPL-3.0-only
package io.github.zekurio.matinee

import android.content.Context
import android.content.pm.PackageManager
import android.media.tv.TvContract
import android.os.Build
import android.provider.Settings
import androidx.annotation.OptIn
import androidx.media3.common.util.UnstableApi
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.android.RenderMode
import io.flutter.embedding.android.TransparencyMode
import io.flutter.embedding.engine.FlutterEngine
import io.github.zekurio.matinee.platform.DeviceApi
import io.github.zekurio.matinee.platform.DeviceFacts
import io.github.zekurio.matinee.player.PlayerApi
import io.github.zekurio.matinee.player.PlayerBridge
import java.io.File
import java.io.IOException
import java.net.Inet4Address
import java.net.NetworkInterface
import java.security.KeyStore
import kotlin.coroutines.resume
import kotlinx.coroutines.suspendCancellableCoroutine

@OptIn(UnstableApi::class)
class MainActivity : FlutterActivity() {
    private val device by lazy { Device(this) }
    private var playback: PlayerBridge? = null

    // Flutter paints into a transparent Android TextureView above the video SurfaceView.
    override fun getRenderMode(): RenderMode = RenderMode.texture

    override fun getTransparencyMode(): TransparencyMode = TransparencyMode.transparent

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        val messenger = flutterEngine.dartExecutor.binaryMessenger
        DeviceApi.setUp(messenger, device)
        val bridge = PlayerBridge(this, messenger)
        playback = bridge
        PlayerApi.setUp(messenger, bridge)
    }

    override fun onStart() {
        super.onStart()
        playback?.enterForeground()
    }

    override fun onStop() {
        playback?.pauseForBackground()
        super.onStop()
    }

    override fun onDestroy() {
        // The engine may outlive the activity, but the video views and mpv don't.
        playback?.release()
        super.onDestroy()
    }

    override fun cleanUpFlutterEngine(flutterEngine: FlutterEngine) {
        val messenger = flutterEngine.dartExecutor.binaryMessenger
        PlayerApi.setUp(messenger, null)
        DeviceApi.setUp(messenger, null)
        playback?.release()
        playback = null
        super.cleanUpFlutterEngine(flutterEngine)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        if (requestCode == LOCAL_NETWORK_REQUEST) {
            device.localNetworkAnswered()
        } else {
            super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        }
    }

    companion object {
        const val LOCAL_NETWORK_REQUEST = 7421
    }
}

/** What Dart can't read itself: whether this is a TV, what it's called, and what Android asks of the app. */
private class Device(private val activity: MainActivity) : DeviceApi {
    /** Everyone waiting on the one permission prompt, since a second request while it shows answers nothing. */
    private val waiting = mutableListOf<(Boolean) -> Unit>()

    override fun facts(): DeviceFacts {
        val packages = activity.packageManager
        return DeviceFacts(
            // Leanback is what Android TV and Google TV devices declare, and
            // what the Kotlin app checked, so the same devices get the TV app.
            television = packages.hasSystemFeature(PackageManager.FEATURE_LEANBACK),
            name = Settings.Global.getString(activity.contentResolver, Settings.Global.DEVICE_NAME)
                ?.takeIf { it.isNotBlank() }
                ?: Build.MODEL,
            model = Build.MODEL,
            osVersion = Build.VERSION.RELEASE,
            appVersion = packages.getPackageInfo(activity.packageName, 0).versionName ?: "",
            timeZone = java.util.TimeZone.getDefault().id,
        )
    }

    /**
     * Android 17 keeps apps off the local network without
     * ACCESS_LOCAL_NETWORK, and it held the Kotlin app to that at target SDK
     * 36 too, so every Android 17 device is asked. The name is spelled out
     * because the build's compile SDK may predate the constant.
     */
    private fun missing(): Boolean =
        Build.VERSION.SDK_INT >= 37 &&
            activity.checkSelfPermission(LOCAL_NETWORK) != PackageManager.PERMISSION_GRANTED

    override fun localNetworkMissing(): Boolean = missing()

    override suspend fun requestLocalNetwork(): Boolean {
        if (!missing()) return true
        return suspendCancellableCoroutine { continuation ->
            waiting += { granted -> if (continuation.isActive) continuation.resume(granted) }
            // Already asked and not answered yet: the answer reaches this one too.
            if (waiting.size == 1) {
                activity.requestPermissions(arrayOf(LOCAL_NETWORK), MainActivity.LOCAL_NETWORK_REQUEST)
            }
        }
    }

    fun localNetworkAnswered() {
        val granted = !missing()
        val callbacks = waiting.toList()
        waiting.clear()
        callbacks.forEach { it(granted) }
    }

    /**
     * Discovery probes go to each active interface's broadcast address, as
     * the Kotlin app sent them; Dart can't tell an interface's netmask.
     */
    override fun broadcastAddresses(): List<String> {
        val found = mutableSetOf<String>()
        try {
            for (network in NetworkInterface.getNetworkInterfaces()?.toList().orEmpty()) {
                try {
                    if (!network.isUp || network.isLoopback) continue
                    for (address in network.interfaceAddresses) {
                        val broadcast = address.broadcast
                        if (broadcast is Inet4Address) broadcast.hostAddress?.let(found::add)
                    }
                } catch (_: IOException) {
                    // An interface can disappear during enumeration.
                } catch (_: SecurityException) {
                    // Keep what was found.
                }
            }
        } catch (_: IOException) {
            // Limited broadcast may still work when enumeration fails.
        } catch (_: SecurityException) {
            // The socket operation will also check permission.
        }
        return found.toList()
    }

    /**
     * This APK installs over the Kotlin app, and existing installs start
     * fresh, once: its preference files, its folders, the key its session
     * was encrypted with, and the programs it put in the TV launcher's Watch
     * Next row, which would open screens this app doesn't have. Flutter's
     * own files (FlutterSharedPreferences, FlutterSecureStorage, app_flutter)
     * stay, and so does anything else that isn't named here.
     */
    override fun freshStart(): Boolean {
        val marker = activity.getSharedPreferences(MARKER_FILE, Context.MODE_PRIVATE)
        if (marker.getBoolean(MARKER_KEY, false)) return false
        for (name in KOTLIN_PREFERENCES) {
            runCatching { activity.deleteSharedPreferences(name) }
        }
        for (name in KOTLIN_FILES) {
            runCatching { File(activity.filesDir, name).deleteRecursively() }
        }
        for (name in KOTLIN_CACHES) {
            runCatching { File(activity.cacheDir, name).deleteRecursively() }
        }
        runCatching {
            KeyStore.getInstance("AndroidKeyStore").apply { load(null) }.deleteEntry(KOTLIN_KEY)
        }
        // Only a TV has the provider; elsewhere the URI is unknown and throws.
        if (activity.packageManager.hasSystemFeature(PackageManager.FEATURE_LEANBACK)) {
            runCatching { activity.contentResolver.delete(TvContract.WatchNextPrograms.CONTENT_URI, null, null) }
        }
        marker.edit().putBoolean(MARKER_KEY, true).commit()
        return true
    }

    private companion object {
        const val LOCAL_NETWORK = "android.permission.ACCESS_LOCAL_NETWORK"
        const val MARKER_FILE = "matinee_fresh_start"
        const val MARKER_KEY = "done"

        /** The Kotlin app's SharedPreferences files. */
        val KOTLIN_PREFERENCES = listOf(
            "downloads",
            "home_snapshot",
            "player",
            "profile_snapshot",
            "session",
            "theme",
            "watch-next",
        )

        /** Folders the Kotlin app kept in filesDir and cacheDir. */
        val KOTLIN_FILES = listOf("downloads", "mpv", "watch-next-art")
        val KOTLIN_CACHES = listOf("artwork", "fontconfig", "mpv")

        /** The Android Keystore alias the Kotlin app encrypted its session with. */
        const val KOTLIN_KEY = "matinee-session"
    }
}
