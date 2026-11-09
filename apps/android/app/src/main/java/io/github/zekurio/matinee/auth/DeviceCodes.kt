package io.github.zekurio.matinee.auth

import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull

/**
 * The code a TV or app shows to be signed in, as the contract's `UserCode`
 * has it: eight letters, shown as `BCDF-GHJK`. Case, spaces, and the dash
 * don't matter.
 */
object UserCode {
    private const val LETTERS = "BCDFGHJKLMNPQRSTVWXZ"
    private val PATTERN = Regex("^[$LETTERS]{4}[\\s-]?[$LETTERS]{4}$", RegexOption.IGNORE_CASE)

    /** The code as the server stores it, or null when [text] isn't one. */
    fun parse(text: String): String? {
        val trimmed = text.trim()
        if (!PATTERN.matches(trimmed)) return null
        val letters = trimmed.uppercase().filter { it in 'A'..'Z' }
        return "${letters.take(4)}-${letters.drop(4)}"
    }
}

/** A code read from a QR code, with the server it named, if it named one. */
data class ScannedCode(val userCode: String, val server: String?)

/**
 * What a QR code holds: the server's `/link` page with the code in its
 * query, as `verificationUriComplete`, or the bare code. Null for anything
 * else, like a QR code of another app.
 */
fun scannedCode(text: String): ScannedCode? {
    val url = text.trim().toHttpUrlOrNull()
    if (url == null) return UserCode.parse(text)?.let { ScannedCode(it, null) }
    if (url.pathSegments.lastOrNull { it.isNotEmpty() } != "link") return null
    val code = url.queryParameter("code")?.let(UserCode::parse) ?: return null
    return ScannedCode(code, url.display)
}

/** `https://media.example.com`, as the app shows its server. */
val HttpUrl.display: String
    get() = if (port == HttpUrl.defaultPort(scheme)) "$scheme://$host" else "$scheme://$host:$port"
