package io.github.zekurio.matinee.auth

import android.util.Base64
import java.security.MessageDigest
import java.security.SecureRandom

/**
 * Sign-in through the browser, as in OAuth for native apps (RFC 8252) with
 * PKCE: the app opens the server's /authorize page in a Custom Tab, and the
 * page sends the browser back to [REDIRECT_URI] with a one-time code that
 * only this request's verifier can trade for a session.
 */
class BrowserSignIn private constructor(
    val state: String,
    val verifier: String,
    val challenge: String,
) {
    companion object {
        /** Registered in AndroidManifest.xml; the server accepts any `matinee:` URI. */
        const val REDIRECT_URI = "matinee://auth/callback"

        private val random = SecureRandom()

        private fun base64Url(bytes: ByteArray) =
            Base64.encodeToString(bytes, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)

        private fun randomString(bytes: Int) = base64Url(ByteArray(bytes).also(random::nextBytes))

        fun create(): BrowserSignIn {
            // 64 bytes make 86 characters, inside RFC 7636's 43 to 128.
            val verifier = randomString(64)
            val challenge = base64Url(MessageDigest.getInstance("SHA-256").digest(verifier.toByteArray()))
            return BrowserSignIn(state = randomString(24), verifier = verifier, challenge = challenge)
        }

        fun isCallback(uri: android.net.Uri) =
            uri.scheme == "matinee" && uri.host == "auth" && uri.path == "/callback"
    }
}
