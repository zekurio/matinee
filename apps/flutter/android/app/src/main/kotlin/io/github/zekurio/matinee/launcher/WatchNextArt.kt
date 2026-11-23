package io.github.zekurio.matinee.launcher

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.util.Log
import androidx.core.content.FileProvider
import java.io.File
import java.io.IOException
import java.security.MessageDigest

/**
 * The cards' pictures. Artwork needs a session, which the launcher doesn't
 * have, so Dart fetches each one and it's kept here in private files. The
 * launchers and the TV provider read them through [WatchNextArtwork], one
 * grant per picture.
 */
internal class WatchNextArt(private val context: Context) {
    private val root = File(context.filesDir, FOLDER)
    private val authority = "${context.packageName}.watch-next-art"

    fun file(identity: String, artworkId: String): File {
        require(WatchNextLink.isIdentity(identity)) { "Not an identity" }
        return File(File(root, identity), "${digest(artworkId)}.$EXTENSION")
    }

    fun save(identity: String, artworkId: String, bytes: ByteArray) {
        val file = file(identity, artworkId)
        val folder = checkNotNull(file.parentFile).apply { mkdirs() }
        // Written aside, then moved, so the launcher never reads half a picture.
        val part = File.createTempFile("art", ".part", folder)
        try {
            part.writeBytes(bytes)
            if (!part.renameTo(file)) throw IOException("Couldn't keep a launcher picture")
        } finally {
            part.delete()
        }
    }

    /**
     * Every launcher, and the TV provider that hands the row to them. Not
     * only the default one: Fire OS shows its own whatever is set, and a
     * device with several and none chosen resolves to the chooser.
     */
    fun readers(): Set<String> {
        val home = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME)
        return context.packageManager.queryIntentActivities(home, PackageManager.MATCH_ALL)
            .mapNotNullTo(mutableSetOf()) { it.activityInfo?.packageName } + TV_PROVIDER
    }

    /** Lets [readers] read [file], and answers with the address they read it at. */
    fun share(file: File, readers: Set<String>): Uri {
        val uri = FileProvider.getUriForFile(context, authority, file)
        for (reader in readers) {
            try {
                context.grantUriPermission(reader, uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
            } catch (e: SecurityException) {
                Log.w(TAG, "Couldn't let $reader read a launcher picture", e)
            }
        }
        return uri
    }

    /** Grants don't outlive a restart, so every picture is shared again after one. */
    fun shareAll() {
        val readers = readers()
        pictures().forEach { share(it, readers) }
    }

    /** Deletes [identity]'s pictures that aren't one of [artworkIds]. */
    fun keepOnly(identity: String, artworkIds: Set<String>) {
        val kept = artworkIds.map { file(identity, it).name }.toSet()
        File(root, identity).listFiles()?.filter { it.name !in kept }?.forEach(::forget)
    }

    fun clear() {
        pictures().forEach(::forget)
        root.deleteRecursively()
    }

    private fun pictures(): List<File> =
        if (root.exists()) root.walkTopDown().filter { it.isFile && it.extension == EXTENSION }.toList() else emptyList()

    private fun forget(file: File) {
        if (file.extension == EXTENSION) {
            try {
                context.revokeUriPermission(FileProvider.getUriForFile(context, authority, file), Intent.FLAG_GRANT_READ_URI_PERMISSION)
            } catch (e: IllegalArgumentException) {
                Log.w(TAG, "Couldn't take back a launcher picture", e)
            }
        }
        file.delete()
    }

    private fun digest(value: String): String =
        MessageDigest.getInstance("SHA-256").digest(value.toByteArray()).joinToString("") { "%02x".format(it) }

    private companion object {
        const val TAG = "MatineeWatchNext"
        const val FOLDER = "launcher-art"
        const val EXTENSION = "img"
        const val TV_PROVIDER = "com.android.providers.tv"
    }
}

/** Serves only the cards' pictures, each through its own read grant. Off in the manifest; [WatchNext] turns it on, on a TV. */
class WatchNextArtwork : FileProvider()

/**
 * After the TV restarts, the launcher shows the row before the app runs, and
 * the grants to its pictures are gone, so they're made again here. Off in
 * the manifest; [WatchNext] turns it on, on a TV.
 */
class WatchNextBoot : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        val pending = goAsync()
        Thread {
            try {
                WatchNextArt(context.applicationContext).shareAll()
            } catch (e: RuntimeException) {
                Log.w("MatineeWatchNext", "Couldn't share the launcher pictures after a restart", e)
            } finally {
                pending.finish()
            }
        }.start()
    }
}
