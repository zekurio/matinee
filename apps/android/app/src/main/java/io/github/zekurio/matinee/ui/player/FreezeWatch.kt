package io.github.zekurio.matinee.ui.player

/**
 * Notices a video decoder that stopped putting out frames while playback
 * goes on: the clock runs, audio and subtitles move, and the picture holds
 * still. ExoPlayer reports no error for that, so nothing would fall back.
 * Some hardware decoders do it with files past their level, often right
 * after a seek. Frames come from the player's thread through [frame]; the
 * player's tick asks [check].
 */
class FreezeWatch(private val limitMs: Long = FREEZE_MS) {
    @Volatile
    private var lastFrameAt = NEVER
    private var watchingSince = NEVER

    /** A frame went to the screen at [atMs]. */
    fun frame(atMs: Long) {
        lastFrameAt = atMs
    }

    /** Start over, as after a fallback or a new source. */
    fun reset() {
        lastFrameAt = NEVER
        watchingSince = NEVER
    }

    /**
     * Whether the picture has held still for [limitMs] while [playing], with
     * video [shown] on a surface. Paused, buffering, audio alone, or off
     * screen, nothing is expected, so the wait starts again.
     */
    fun check(nowMs: Long, playing: Boolean, shown: Boolean): Boolean {
        if (!playing || !shown) {
            watchingSince = NEVER
            return false
        }
        if (watchingSince == NEVER) watchingSince = nowMs
        return nowMs - maxOf(lastFrameAt, watchingSince) >= limitMs
    }

    private companion object {
        const val NEVER = -1L

        /** Long past a slow frame, short enough that the viewer isn't left staring. */
        const val FREEZE_MS = 5_000L
    }
}
