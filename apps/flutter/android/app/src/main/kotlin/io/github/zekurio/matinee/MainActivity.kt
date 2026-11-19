package io.github.zekurio.matinee

import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.github.zekurio.matinee.platform.DeviceApi
import io.github.zekurio.matinee.platform.DeviceFacts

class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        DeviceApi.setUp(flutterEngine.dartExecutor.binaryMessenger, Device(this))
    }
}

/** What Dart can't read itself: whether this is a TV, and what it's called. */
private class Device(private val activity: FlutterActivity) : DeviceApi {
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
        )
    }
}
