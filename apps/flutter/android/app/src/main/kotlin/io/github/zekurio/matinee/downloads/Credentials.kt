package io.github.zekurio.matinee.downloads

import android.content.Context
import android.content.SharedPreferences
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.net.URI
import java.security.GeneralSecurityException
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Seals a token at rest, so the preference file alone doesn't hand it out. */
interface Vault {
    fun seal(plain: String): String

    /** Null when it can't be opened, as after the key was lost. */
    fun open(sealed: String): String?
}

/** A few strings kept across restarts. */
interface KeyValues {
    fun get(key: String): String?

    fun put(key: String, value: String?)
}

class PreferenceValues(private val prefs: SharedPreferences) : KeyValues {
    override fun get(key: String): String? = prefs.getString(key, null)

    override fun put(key: String, value: String?) {
        prefs.edit().apply { if (value == null) remove(key) else putString(key, value) }.apply()
    }
}

/** The sign-in a download sends to its server, and the user agent every fetch sends. */
data class ServerSignIn(val token: String?, val userAgent: String)

/**
 * What the fetches send to each saved server, which Dart hands over as it
 * signs in and out, so a download goes on with the app closed. A server Dart
 * never named, or forgot, has none: its downloads wait.
 */
class Credentials(private val values: KeyValues, private val vault: Vault) {
    @Synchronized
    fun set(server: String, token: String?, userAgent: String) {
        values.put(KNOWN + server, "1")
        values.put(TOKEN + server, token?.let(vault::seal))
        values.put(AGENT, userAgent)
    }

    @Synchronized
    fun forget(server: String) {
        values.put(KNOWN + server, null)
        values.put(TOKEN + server, null)
    }

    /** What to send [server], or null for a server that isn't saved. */
    @Synchronized
    fun of(server: String): ServerSignIn? {
        if (values.get(KNOWN + server) == null) return null
        val token = values.get(TOKEN + server)?.let(vault::open)
        return ServerSignIn(token, values.get(AGENT).orEmpty())
    }

    companion object {
        private const val KNOWN = "known:"
        private const val TOKEN = "token:"
        private const val AGENT = "agent"

        /**
         * Whether [url] is on [server], by scheme, host, and port, so the
         * token goes nowhere else, as the Dart clients bind it.
         */
        fun sameOrigin(url: String, server: String): Boolean {
            val a = runCatching { URI(url) }.getOrNull() ?: return false
            val b = runCatching { URI(server) }.getOrNull() ?: return false
            if (a.userInfo != null) return false
            fun port(uri: URI) = if (uri.port >= 0) uri.port else if (uri.scheme.equals("https", true)) 443 else 80
            return a.scheme.equals(b.scheme, ignoreCase = true) &&
                a.host != null && a.host.equals(b.host, ignoreCase = true) &&
                port(a) == port(b)
        }
    }
}

/** AES-GCM under a key that never leaves the Android Keystore. */
class KeystoreVault : Vault {
    private fun key(): SecretKey {
        val store = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        (store.getEntry(ALIAS, null) as? KeyStore.SecretKeyEntry)?.let { return it.secretKey }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .build(),
        )
        return generator.generateKey()
    }

    override fun seal(plain: String): String {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val sealed = cipher.iv + cipher.doFinal(plain.toByteArray(Charsets.UTF_8))
        return Base64.encodeToString(sealed, Base64.NO_WRAP)
    }

    override fun open(sealed: String): String? = try {
        val bytes = Base64.decode(sealed, Base64.NO_WRAP)
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes, 0, IV_BYTES))
        String(cipher.doFinal(bytes, IV_BYTES, bytes.size - IV_BYTES), Charsets.UTF_8)
    } catch (_: GeneralSecurityException) {
        null
    } catch (_: IllegalArgumentException) {
        null
    }

    private companion object {
        const val KEYSTORE = "AndroidKeyStore"
        const val ALIAS = "matinee-downloads"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val IV_BYTES = 12
    }
}

fun credentialsOf(context: Context) = Credentials(
    PreferenceValues(context.getSharedPreferences("matinee_download_credentials", Context.MODE_PRIVATE)),
    KeystoreVault(),
)
