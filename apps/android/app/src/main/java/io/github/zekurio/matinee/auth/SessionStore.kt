package io.github.zekurio.matinee.auth

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import androidx.core.content.edit
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * The server this app talks to and its session token. The token is
 * encrypted with a key that never leaves the Android Keystore, as the
 * contract asks apps to keep it where the platform keeps secrets, and the
 * preferences stay out of backups (res/xml/data_extraction_rules.xml).
 */
class SessionStore(context: Context) {
    private val prefs = context.getSharedPreferences("session", Context.MODE_PRIVATE)

    var server: String?
        get() = prefs.getString(KEY_SERVER, null)
        set(value) = prefs.edit { putString(KEY_SERVER, value) }

    var token: String?
        get() = prefs.getString(KEY_TOKEN, null)?.let(::decrypt)
        set(value) = prefs.edit {
            if (value == null) remove(KEY_TOKEN) else putString(KEY_TOKEN, encrypt(value))
        }

    /** A browser sign-in under way: survives the app's process going while the browser shows. */
    var pendingSignIn: Pair<String, String>?
        get() {
            val state = prefs.getString(KEY_STATE, null) ?: return null
            val verifier = prefs.getString(KEY_VERIFIER, null) ?: return null
            return state to verifier
        }
        set(value) = prefs.edit {
            if (value == null) {
                remove(KEY_STATE)
                remove(KEY_VERIFIER)
            } else {
                putString(KEY_STATE, value.first)
                putString(KEY_VERIFIER, value.second)
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
        const val KEY_SERVER = "server"
        const val KEY_TOKEN = "token"
        const val KEY_STATE = "signin_state"
        const val KEY_VERIFIER = "signin_verifier"
    }
}
