package io.github.zekurio.matinee.player.system

import android.app.Activity
import android.app.PendingIntent
import android.content.Intent
import android.net.Uri
import android.os.Looper
import androidx.annotation.OptIn
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.common.SimpleBasePlayer
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSourceBitmapLoader
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.session.CommandButton
import androidx.media3.session.MediaController
import androidx.media3.session.MediaSession
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import io.github.zekurio.matinee.PlaybackService

/**
 * The system's handle on the player, its media session: its controls in the
 * notification shade, on the lock screen, and on headsets, with play and pause,
 * seeking, and the server's skip steps. Dart says what plays and where it is,
 * and gets each press back to do its own way, so both engines show the same
 * controls. Tapping the notification brings the app back.
 */
@OptIn(UnstableApi::class)
internal class MediaControls(
    private val activity: Activity,
    send: (MediaCommandMessage) -> Unit,
) {
    /** The artwork's requests, with the session's headers. */
    private val http = DefaultHttpDataSource.Factory()
    private val player = RemotePlayer(send)
    private var session: MediaSession? = null
    private var controller: ListenableFuture<MediaController>? = null

    val info: MediaInfoMessage? get() = player.info
    val playing: Boolean get() = player.media?.playing == true

    fun show(info: MediaInfoMessage) {
        http.setDefaultRequestProperties(info.headers)
        player.show(info)
        val shown = session ?: MediaSession.Builder(activity, player)
            .setId(SESSION_ID)
            .setSessionActivity(
                PendingIntent.getActivity(
                    activity,
                    0,
                    Intent(activity, activity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
                    PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
                ),
            )
            .setBitmapLoader(DataSourceBitmapLoader.Builder(activity).setDataSourceFactory(http).build())
            .build()
            .also {
                session = it
                controller = PlaybackService.start(activity, it)
            }
        shown.setMediaButtonPreferences(buttons(info))
    }

    fun update(state: MediaStateMessage) = player.update(state)

    fun hide() {
        controller?.let { PlaybackService.stop(activity, it) }
        controller = null
        session?.release()
        session = null
        player.hide()
    }

    /** The skip steps beside play in the notification, with icons for the usual steps. */
    private fun buttons(info: MediaInfoMessage): List<CommandButton> = listOfNotNull(
        info.backMs?.let { ms ->
            CommandButton.Builder(backIcon(ms))
                .setPlayerCommand(Player.COMMAND_SEEK_BACK)
                .setDisplayName(info.backLabel ?: "")
                .setSlots(CommandButton.SLOT_BACK)
                .build()
        },
        info.aheadMs?.let { ms ->
            CommandButton.Builder(aheadIcon(ms))
                .setPlayerCommand(Player.COMMAND_SEEK_FORWARD)
                .setDisplayName(info.aheadLabel ?: "")
                .setSlots(CommandButton.SLOT_FORWARD)
                .build()
        },
    )

    private fun backIcon(ms: Long): Int = when (ms) {
        5_000L -> CommandButton.ICON_SKIP_BACK_5
        10_000L -> CommandButton.ICON_SKIP_BACK_10
        15_000L -> CommandButton.ICON_SKIP_BACK_15
        30_000L -> CommandButton.ICON_SKIP_BACK_30
        else -> CommandButton.ICON_SKIP_BACK
    }

    private fun aheadIcon(ms: Long): Int = when (ms) {
        5_000L -> CommandButton.ICON_SKIP_FORWARD_5
        10_000L -> CommandButton.ICON_SKIP_FORWARD_10
        15_000L -> CommandButton.ICON_SKIP_FORWARD_15
        30_000L -> CommandButton.ICON_SKIP_FORWARD_30
        else -> CommandButton.ICON_SKIP_FORWARD
    }

    private companion object {
        const val SESSION_ID = "matinee-player"
    }
}

/**
 * A Media3 player that only reports what Dart says and passes presses
 * back, so the session shows either engine and a seek still goes through
 * the server when the video is a transcode.
 */
@OptIn(UnstableApi::class)
internal class RemotePlayer(private val send: (MediaCommandMessage) -> Unit) : SimpleBasePlayer(Looper.getMainLooper()) {
    var info: MediaInfoMessage? = null
        private set
    var media: MediaStateMessage? = null
        private set

    fun show(info: MediaInfoMessage) {
        this.info = info
        invalidateState()
    }

    fun update(state: MediaStateMessage) {
        media = state
        invalidateState()
    }

    fun hide() {
        info = null
        media = null
        invalidateState()
    }

    override fun getState(): State {
        val info = info
        val builder = State.Builder()
        if (info == null) {
            return builder.setAvailableCommands(Player.Commands.EMPTY).setPlaybackState(Player.STATE_IDLE).build()
        }
        val media = media
        val commands = Player.Commands.Builder().addAll(
            Player.COMMAND_PLAY_PAUSE,
            Player.COMMAND_SEEK_IN_CURRENT_MEDIA_ITEM,
            Player.COMMAND_GET_CURRENT_MEDIA_ITEM,
            Player.COMMAND_GET_TIMELINE,
            Player.COMMAND_GET_METADATA,
        )
        if (info.backMs != null) commands.add(Player.COMMAND_SEEK_BACK)
        if (info.aheadMs != null) commands.add(Player.COMMAND_SEEK_FORWARD)
        val metadata = MediaMetadata.Builder()
            .setTitle(info.title)
            .setArtist(info.subtitle)
            .setArtworkUri(info.artworkUrl?.let(Uri::parse))
            .build()
        val item = MediaItemData.Builder(ITEM_ID)
            .setMediaItem(MediaItem.Builder().setMediaId(ITEM_ID).setMediaMetadata(metadata).build())
            .setMediaMetadata(metadata)
            .setDurationUs(media?.durationMs?.let { it * 1000 } ?: C.TIME_UNSET)
            .setIsSeekable(true)
            .build()
        val phase = when (media?.phase) {
            MediaPhaseMessage.READY -> Player.STATE_READY
            MediaPhaseMessage.ENDED -> Player.STATE_ENDED
            else -> Player.STATE_BUFFERING
        }
        val playing = media?.playing == true
        val rate = (media?.rate ?: 1.0).toFloat()
        val moving = playing && phase == Player.STATE_READY
        val position = media?.positionMs ?: 0
        return builder
            .setAvailableCommands(commands.build())
            .setPlaylist(listOf(item))
            .setCurrentMediaItemIndex(0)
            .setPlayWhenReady(playing, Player.PLAY_WHEN_READY_CHANGE_REASON_USER_REQUEST)
            .setPlaybackState(phase)
            .setPlaybackParameters(PlaybackParameters(rate))
            .setSeekBackIncrementMs(info.backMs ?: C.DEFAULT_SEEK_BACK_INCREMENT_MS)
            .setSeekForwardIncrementMs(info.aheadMs ?: C.DEFAULT_SEEK_FORWARD_INCREMENT_MS)
            .setContentPositionMs(PositionSupplier.getExtrapolating(position, if (moving) rate else 0f))
            .build()
    }

    override fun handleSetPlayWhenReady(playWhenReady: Boolean): ListenableFuture<*> {
        send(MediaCommandMessage(if (playWhenReady) MediaCommandKind.PLAY else MediaCommandKind.PAUSE))
        return Futures.immediateVoidFuture()
    }

    override fun handleSeek(mediaItemIndex: Int, positionMs: Long, seekCommand: Int): ListenableFuture<*> {
        send(
            when (seekCommand) {
                Player.COMMAND_SEEK_BACK -> MediaCommandMessage(MediaCommandKind.BACK)
                Player.COMMAND_SEEK_FORWARD -> MediaCommandMessage(MediaCommandKind.AHEAD)
                else -> MediaCommandMessage(MediaCommandKind.SEEK_TO, positionMs.coerceAtLeast(0))
            },
        )
        return Futures.immediateVoidFuture()
    }

    private companion object {
        const val ITEM_ID = "matinee"
    }
}
