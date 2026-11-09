package io.github.zekurio.matinee.downloads

import java.security.MessageDigest
import okhttp3.HttpUrl

/**
 * Whose offline data it is: one account on one server. Downloads, their
 * jobs, and progress waiting for the server each belong to one, so another
 * account, or the same id on another server, never sees or sends them.
 */
data class AccountScope(val server: String, val userId: String) {
    /** The name of its folder, preferences, and jobs: the same every run, and safe in a path. */
    val key: String by lazy {
        val digest = MessageDigest.getInstance("SHA-256").digest("$server\n$userId".toByteArray())
        digest.take(16).joinToString("") { "%02x".format(it) }
    }
}

/**
 * A server's origin, written one way however it was typed: the scheme, the
 * host in lower case, and the port, even the default one.
 */
fun canonicalServer(url: HttpUrl): String {
    val host = if (':' in url.host) "[${url.host}]" else url.host
    return "${url.scheme}://$host:${url.port}"
}
