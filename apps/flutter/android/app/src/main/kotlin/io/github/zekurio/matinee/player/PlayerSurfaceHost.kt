// Copyright (C) edde746 and Plezy contributors.
// SPDX-License-Identifier: GPL-3.0-only
// The underlay and its stacking order are adapted from Plezy.
package io.github.zekurio.matinee.player

import android.app.Activity
import android.graphics.Color
import android.graphics.PixelFormat
import android.os.Build
import android.util.TypedValue
import android.view.Gravity
import android.view.SurfaceHolder
import android.view.SurfaceView
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.media3.common.text.Cue
import androidx.media3.common.util.UnstableApi
import androidx.media3.ui.CaptionStyleCompat
import androidx.media3.ui.SubtitleView
import kotlin.math.roundToInt

/** The size the Kotlin phone player draws a cue at, in sp, before Settings' size. */
private const val SUBTITLE_SIZE = 20.0

@UnstableApi
internal class PlayerSurfaceHost(
    activity: Activity,
    engine: EngineMessage,
    private val surfacesChanged: (PlaybackSurfaces, Boolean) -> Unit,
) {
    private val content = activity.findViewById<ViewGroup>(android.R.id.content)
    private val container = FrameLayout(activity).apply {
        setBackgroundColor(Color.BLACK)
        visibility = View.GONE
        importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
    }
    private var generation = 0L
    private val video = Plane(SurfaceView(activity), overlay = false)
    private val osd = if (engine == EngineMessage.MPV) Plane(SurfaceView(activity), overlay = true) else null
    private val subtitles = if (engine == EngineMessage.MEDIA3) SubtitleView(activity) else null
    private var gpuSurface = false
    private var aspect = 0.0
    private var fit = FitMessage.CONTAIN
    private var viewport: ViewportMessage? = null

    init {
        container.addView(video.view, FrameLayout.LayoutParams(-1, -1, Gravity.CENTER))
        osd?.let { container.addView(it.view, FrameLayout.LayoutParams(-1, -1)) }
        subtitles?.let { container.addView(it, FrameLayout.LayoutParams(-1, -1)) }
        container.addOnLayoutChangeListener { _, _, _, _, _, _, _, _, _ -> layoutVideo() }
        video.view.addOnLayoutChangeListener { _, _, _, _, _, _, _, _, _ -> reportSurfaces() }
        content.addView(container, 0, FrameLayout.LayoutParams(0, 0))
    }

    /**
     * Places the video at [bounds], in pixels from the Flutter view's top left,
     * or hides it. The container is a sibling beneath the Flutter view, so the
     * activity's content frame and the Flutter view share an origin.
     */
    fun setViewport(bounds: ViewportMessage?) {
        if (viewport == bounds) return
        viewport = bounds
        if (bounds == null || bounds.width <= 0 || bounds.height <= 0) {
            container.visibility = View.GONE
            // No surface may ever have existed, so nothing else tells the engine this view isn't coming.
            if (video.plane == null) reportSurfaces(retiring = true)
            return
        }
        // Physical left, not start: Flutter's coordinates don't mirror in right-to-left layouts.
        container.layoutParams = FrameLayout.LayoutParams(
            bounds.width.toInt(), bounds.height.toInt(), Gravity.TOP or Gravity.LEFT,
        ).apply {
            leftMargin = bounds.left.toInt()
            topMargin = bounds.top.toInt()
        }
        container.visibility = View.VISIBLE
    }

    fun setFit(next: FitMessage) {
        fit = next
        layoutVideo()
    }

    fun setAspect(next: Double) {
        if (aspect == next) return
        aspect = next
        layoutVideo()
    }

    fun useGpuSurface() {
        gpuSurface = true
        osd?.view?.visibility = View.GONE
        layoutVideo()
    }

    /** The screen stays on while the video moves or is about to. */
    fun setKeepAwake(awake: Boolean) {
        container.keepScreenOn = awake
    }

    /**
     * The look Settings gives subtitles, for the cues Media3 draws, as the
     * Kotlin player's `SubtitleLine`: 20sp times the size, in the app's own
     * colors and edge, or Android's caption style whole, its typeface too.
     */
    fun setSubtitleLook(request: OpenMessage) {
        val view = subtitles ?: return
        if (request.systemSubtitleScale) {
            view.setUserDefaultStyle()
            view.setUserDefaultTextSize()
            return
        }
        view.setStyle(
            CaptionStyleCompat(
                request.subtitleColor.toInt(),
                request.subtitleBackground.toInt(),
                Color.TRANSPARENT,
                when (request.subtitleEdge) {
                    SubtitleEdgeMessage.NONE -> CaptionStyleCompat.EDGE_TYPE_NONE
                    SubtitleEdgeMessage.OUTLINE -> CaptionStyleCompat.EDGE_TYPE_OUTLINE
                    SubtitleEdgeMessage.SHADOW -> CaptionStyleCompat.EDGE_TYPE_DROP_SHADOW
                },
                Color.BLACK,
                null,
            ),
        )
        view.setFixedTextSize(TypedValue.COMPLEX_UNIT_SP, (SUBTITLE_SIZE * request.subtitleScale).toFloat())
    }

    fun setCues(cues: List<Cue>) {
        subtitles?.setCues(cues)
    }

    fun close() {
        video.view.holder.removeCallback(video)
        osd?.let { it.view.holder.removeCallback(it) }
        content.removeView(container)
    }

    private fun layoutVideo() {
        val current = video.view.layoutParams as FrameLayout.LayoutParams
        val width = container.width
        val height = container.height
        if (width <= 0 || height <= 0) return
        val surfaceAspect = width.toDouble() / height
        val (videoWidth, videoHeight) = when {
            gpuSurface || fit == FitMessage.FILL || aspect <= 0 -> width to height
            (aspect > surfaceAspect) == (fit == FitMessage.CONTAIN) ->
                width to (width / aspect).roundToInt().coerceAtLeast(1)
            else -> (height * aspect).roundToInt().coerceAtLeast(1) to height
        }
        if (current.width != videoWidth || current.height != videoHeight) {
            video.view.layoutParams = FrameLayout.LayoutParams(videoWidth, videoHeight, Gravity.CENTER)
        }
    }

    private fun reportSurfaces(retiring: Boolean = false) {
        val picture = video.view
        surfacesChanged(
            PlaybackSurfaces(
                video.plane, osd?.plane, container.width, container.height,
                picture.left, picture.top, picture.right, picture.bottom,
            ),
            retiring,
        )
    }

    private inner class Plane(val view: SurfaceView, overlay: Boolean) : SurfaceHolder.Callback {
        var plane: SurfacePlane? = null

        init {
            view.setZOrderOnTop(false)
            view.setZOrderMediaOverlay(overlay)
            if (Build.VERSION.SDK_INT >= 36) view.compositionOrder = if (overlay) -1 else -2
            if (overlay) view.holder.setFormat(PixelFormat.TRANSLUCENT)
            view.holder.addCallback(this)
        }

        override fun surfaceCreated(holder: SurfaceHolder) {
            plane = SurfacePlane(holder.surface, ++generation)
            reportSurfaces()
        }

        override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {
            reportSurfaces()
        }

        override fun surfaceDestroyed(holder: SurfaceHolder) {
            plane = null
            reportSurfaces(retiring = true)
        }
    }
}
