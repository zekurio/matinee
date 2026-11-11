package io.github.zekurio.matinee.launcher

import android.app.Activity
import android.app.Application
import android.os.Bundle

/** Count activities, not resumes, so opening the player isn't another foreground. */
internal class WatchNextForeground(private val publisher: WatchNext) : Application.ActivityLifecycleCallbacks {
    private var started = 0

    override fun onActivityStarted(activity: Activity) {
        if (started++ == 0) publisher.requestSync()
    }

    override fun onActivityStopped(activity: Activity) {
        started--
    }

    override fun onActivityCreated(activity: Activity, state: Bundle?) = Unit
    override fun onActivityResumed(activity: Activity) = Unit
    override fun onActivityPaused(activity: Activity) = Unit
    override fun onActivitySaveInstanceState(activity: Activity, state: Bundle) = Unit
    override fun onActivityDestroyed(activity: Activity) = Unit
}
