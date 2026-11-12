package io.github.zekurio.matinee.auth

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.core.content.edit
import io.github.zekurio.matinee.api.MatineeJson
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import kotlinx.serialization.Serializable
import io.github.zekurio.matinee.api.decodeSaved
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray

/**
 * A server saved on this device. [origin] is the server's root, as
 * `https://media.example.com/`, and names it everywhere else in the app,
 * such as on its downloads.
 */
@Serializable
internal data class StoredServer(
    val origin: String,
    /** The session token, encrypted with the Keystore key; null while signed out. */
    val token: String? = null,
    /** The account signed in, as JSON, for the server list and for downloads while the server is away. */
    val user: String? = null,
    /** What the server calls itself, when it was found on the local network. */
    val name: String? = null,
)

/** A browser sign-in under way, and the server whose page it opened. */
internal data class PendingSignIn(val state: String, val verifier: String, val origin: String?)

/**
 * The servers this app knows, which one is in use, and a session token for
 * each. Tokens are encrypted with a key that never leaves the Android
 * Keystore, as the contract asks apps to keep them where the platform keeps
 * secrets, and the preferences stay out of backups
 * (res/xml/data_extraction_rules.xml).
 */
internal class SessionStore(context: Context) {
    private val prefs = context.getSharedPreferences("session", Context.MODE_PRIVATE)
    private val json = Json(MatineeJson) { encodeDefaults = false }
    private val serializer = ListSerializer(StoredServer.serializer())

    init {
        // A migration that fails leaves the old keys as they are, for the next start to try again.
        runCatching { migrate() }
    }

    /**
     * The saved servers, in the order they were added. Each entry is read on
     * its own, so one this app can't read any more doesn't lose the others.
     */
    var servers: List<StoredServer>
        get() = decode(prefs.getString(KEY_SERVERS, null))
        set(value) = prefs.edit { putString(KEY_SERVERS, json.encodeToString(serializer, value)) }

    private fun decode(text: String?): List<StoredServer> {
        if (text == null) return emptyList()
        val entries = runCatching { MatineeJson.parseToJsonElement(text) as? JsonArray }.getOrNull()
        return entries.orEmpty().mapNotNull { runCatching { decodeSaved(StoredServer.serializer(), it) }.getOrNull() }
    }

    /** The origin of the server in use, one of [servers]. */
    var active: String?
        get() = prefs.getString(KEY_ACTIVE, null)
        set(value) = prefs.edit { if (value == null) remove(KEY_ACTIVE) else putString(KEY_ACTIVE, value) }

    /** The last server connected to, kept after switching away or removing it, for a TV to offer again. */
    var lastServer: String?
        get() = prefs.getString(KEY_LAST_SERVER, null)
        set(value) = prefs.edit { putString(KEY_LAST_SERVER, value) }

    /** Offline mode, as Findroid's: start with the downloads and leave the server alone until it's off. */
    var offlineMode: Boolean
        get() = prefs.getBoolean(KEY_OFFLINE, false)
        set(value) = prefs.edit { putBoolean(KEY_OFFLINE, value) }

    /** A browser sign-in under way: survives the app's process going while the browser shows. */
    var pendingSignIn: PendingSignIn?
        get() {
            val state = prefs.getString(KEY_STATE, null) ?: return null
            val verifier = prefs.getString(KEY_VERIFIER, null) ?: return null
            return PendingSignIn(state, verifier, prefs.getString(KEY_PENDING_ORIGIN, null))
        }
        set(value) = prefs.edit {
            if (value == null) {
                remove(KEY_STATE)
                remove(KEY_VERIFIER)
                remove(KEY_PENDING_ORIGIN)
            } else {
                putString(KEY_STATE, value.state)
                putString(KEY_VERIFIER, value.verifier)
                if (value.origin == null) remove(KEY_PENDING_ORIGIN) else putString(KEY_PENDING_ORIGIN, value.origin)
            }
        }

    /** [token] encrypted, to keep in a [StoredServer]. */
    fun seal(token: String): String = encrypt(token)

    /** The token of a [StoredServer], or null when signed out or the key is gone. */
    fun open(sealed: String?): String? = sealed?.let(::decrypt)

    /**
     * An app from before saved servers kept one server, its token, and its
     * account under keys of their own. They join the saved servers, as the
     * one in use, so the update signs nobody out. The token was sealed with
     * the same Keystore key, so it moves as it is, never decrypted here.
     *
     * Safe to run on every start: it does something only while the old
     * server key is there. The list is written and read back first, and
     * the old keys go only once it holds the server with its token and
     * account. Anything failing leaves them for the next start.
     */
    private fun migrate() {
        val server = prefs.getString(KEY_SERVER, null)
        if (server == null) {
            // Nothing to move, but the list should exist, so the app knows it has none.
            if (!prefs.contains(KEY_SERVERS)) prefs.edit(commit = true) { putString(KEY_SERVERS, "[]") }
            return
        }
        val token = prefs.getString(KEY_TOKEN, null)
        val user = prefs.getString(KEY_USER, null)
        val saved = decode(prefs.getString(KEY_SERVERS, null))
        val existing = saved.firstOrNull { it.origin == server }
        val merged = when {
            existing == null -> saved + StoredServer(server, token, user)
            // A session the list already has is newer than the old one; else the old one fills it in.
            existing.token != null -> saved
            else -> saved.map { if (it.origin == server) it.copy(token = token, user = user ?: it.user) else it }
        }
        val written = prefs.edit().putString(KEY_SERVERS, json.encodeToString(serializer, merged)).apply {
            if (prefs.getString(KEY_ACTIVE, null) == null) putString(KEY_ACTIVE, server)
        }.commit()
        if (!written) return
        val kept = decode(prefs.getString(KEY_SERVERS, null)).firstOrNull { it.origin == server } ?: return
        val holds = kept.token != null || token == null
        if (!holds || prefs.getString(KEY_ACTIVE, null) == null) return
        prefs.edit(commit = true) {
            remove(KEY_SERVER)
            remove(KEY_TOKEN)
            remove(KEY_USER)
        }
    }

    private fun key(): SecretKey {
        val store = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        (store.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build(),
        )
        return generator.generateKey()
    }

    private fun encrypt(value: String): String {
        val cipher = Cipher.getInstance(TRANSFORMATION).apply { init(Cipher.ENCRYPT_MODE, key()) }
        val sealed = cipher.iv + cipher.doFinal(value.toByteArray())
        return Base64.encodeToString(sealed, Base64.NO_WRAP)
    }

    /** Null when the key is gone, as after the Keystore was reset: sign in again. */
    private fun decrypt(value: String): String? = runCatching {
        val sealed = Base64.decode(value, Base64.NO_WRAP)
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, sealed, 0, IV_BYTES))
        String(cipher.doFinal(sealed, IV_BYTES, sealed.size - IV_BYTES))
    }.getOrNull()

    private companion object {
        const val KEYSTORE = "AndroidKeyStore"
        const val KEY_ALIAS = "matinee-session"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val IV_BYTES = 12
        const val KEY_SERVERS = "servers"
        const val KEY_ACTIVE = "active_server"
        const val KEY_LAST_SERVER = "last_server"
        const val KEY_OFFLINE = "offline_mode"
        const val KEY_STATE = "signin_state"
        const val KEY_VERIFIER = "signin_verifier"
        const val KEY_PENDING_ORIGIN = "signin_origin"

        // Before saved servers: the one server, its token, and its account.
        const val KEY_SERVER = "server"
        const val KEY_TOKEN = "token"
        const val KEY_USER = "user"
    }
}
