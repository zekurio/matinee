package io.github.zekurio.matinee.ui.settings

import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/*
 * The app's own log, for sending along when something breaks. It's what
 * this process wrote to logcat (the app, Media3, mpv, the system on its
 * behalf), read only when the viewer asks, and never sent anywhere.
 *
 * Logcat holds free text, so unlike the playback report this can't keep
 * to known codes. Each message goes through [scrubLogMessage] instead,
 * which takes out what could name the server, the account, or a file:
 * the server's host and the account's names, URLs, host names, IP
 * addresses, e-mail addresses, paths, file names, quoted text, ids, and
 * tokens. The parts of this file below [readAppLog] are plain Kotlin, so
 * the JVM tests run them.
 */

/** The most lines a log keeps, the latest ones. */
const val MAX_LOG_LINES = 500

/** The most characters a log keeps, so it fits on the clipboard and in a share. */
const val MAX_LOG_CHARS = 60_000

private const val LOGCAT_TIMEOUT_SECONDS = 5L

/**
 * This process's recent log, scrubbed. [known] are values to take out
 * wherever they show, like the server's host and the account's names.
 */
suspend fun readAppLog(pid: Int, known: KnownValues): String = withContext(Dispatchers.IO) {
    // An app reads its own process's lines without READ_LOGS.
    val lines = try {
        val process = ProcessBuilder("logcat", "-d", "-v", "threadtime", "--pid=$pid", "-t", "${MAX_LOG_LINES * 2}")
            .redirectErrorStream(true)
            .start()
        try {
            process.inputStream.bufferedReader().readLines().also { process.waitFor(LOGCAT_TIMEOUT_SECONDS, TimeUnit.SECONDS) }
        } finally {
            process.destroy()
        }
    } catch (e: IOException) {
        listOf("logcat unavailable: ${e.javaClass.simpleName}")
    }
    formatLog(lines, known)
}

/** The server's host and the account's names and id, which a log line must not show. */
data class KnownValues(val server: List<String> = emptyList(), val account: List<String> = emptyList()) {
    companion object {
        /** From the server's address as the app shows it and the signed-in user, if any. */
        fun of(server: String?, account: List<String?>) = KnownValues(
            server = listOfNotNull(server?.let(::hostOf)),
            account = account.filterNotNull(),
        )

        /** `media.example.com` of `https://media.example.com:8443/matinee`. */
        private fun hostOf(address: String) = address.substringAfter("://").substringBefore('/').substringBefore(':').ifEmpty { null }
    }
}

/** Logcat's lines as text to paste, scrubbed, the latest [MAX_LOG_LINES] within [MAX_LOG_CHARS]. */
fun formatLog(lines: List<String>, known: KnownValues): String {
    val kept = lines.mapNotNull { formatLogLine(it, known) }.takeLast(MAX_LOG_LINES)
    val header = buildString {
        append("Matinee app log v1\n")
        append("privacy: server, account, addresses, paths, file names, quoted text, ids, and tokens replaced\n")
    }
    val body = ArrayDeque<String>()
    var size = 0
    for (line in kept.asReversed()) {
        if (size + line.length + 1 > MAX_LOG_CHARS) break
        body.addFirst(line)
        size += line.length + 1
    }
    if (body.isEmpty()) return header + "nothing logged\n"
    val dropped = kept.size - body.size
    return header + (if (dropped > 0) "($dropped earlier lines left out)\n" else "") + body.joinToString("\n", postfix = "\n")
}

// `11-12 01:41:46.123  1234  1250 W Tag: message`, logcat's threadtime format.
private val THREADTIME = Regex("""^(\d\d-\d\d \d\d:\d\d:\d\d\.\d+)\s+\d+\s+\d+\s+([VDIWEFA])\s+(.*?)\s*:(?: (.*))?$""")

/** One logcat line without its process and thread ids, its message scrubbed. Null for logcat's own lines. */
fun formatLogLine(line: String, known: KnownValues): String? {
    val match = THREADTIME.matchEntire(line.trimEnd()) ?: return null
    val (time, level, tag, message) = match.destructured
    return "$time $level ${scrubLogMessage(tag, known).take(32)}: ${scrubLogMessage(message, known)}"
}

private val JSON_INPUT = Regex("""(?i)(JSON input:).*""")
private val URL = Regex("""(?i)\b[a-z][a-z0-9+.\-]*://[^\s"'<>]+""")
private val CREDENTIAL = Regex("""(?i)\b(bearer|basic)\s+[^\s,;]+""")
private val ASSIGNED_SECRET = Regex("""(?i)\b(token|access_token|refresh_token|password|secret|cookie|authorization|verifier)(["']?\s*[=:]\s*)(?!(?:bearer|basic)\b)[^\s,;&"']+""")
private val EMAIL = Regex("""[\w.+\-]+@[\w\-]+(?:\.[\w\-]+)+""")
private val DOUBLE_QUOTED = Regex(""""[^"\n]*"""")
private val SINGLE_QUOTED = Regex("""(?<!\w)'[^'\n]+'(?!\w)""")
private val PATH = Regex("""(?<![\w.:/<>\-])/(?:[^\s/"',;()\[\]]+/)+[^\s"',;()\[\]]*""")
private val MEDIA_FILE = Regex("""(?i)[^\s/"',;()\[\]]*\.(?:mkv|mp4|m4v|mov|webm|avi|ts|m2ts|mts|mpg|mpeg|ogv|wmv|flv|srt|ass|ssa|vtt|sup|sub|idx)(?!\w|\.\w)""")
private val IPV4 = Regex("""\b(?:\d{1,3}\.){3}\d{1,3}(?::\d{1,5})?\b""")
private val IPV6 = Regex("""(?<![\w:])[0-9a-fA-F]*(?::[0-9a-fA-F]*){2,}(?![\w:])""")
// Not a stack frame's `MainActivity.kt:42`.
private val HOST_WITH_PORT = Regex("""(?i)\b(?:[a-z0-9\-]+\.)+(?!(?:kt|java)\b)[a-z]{2,}:\d{2,5}\b""")
private val HOST_BEFORE_IP = Regex("""(?i)\b(?:[a-z0-9\-]+\.)+[a-z0-9\-]+(?=/<ip>)""")
private val DOMAIN = Regex(
    """(?i)\b(?:[a-z0-9\-]+\.)+(?:com|net|org|de|io|dev|app|me|xyz|cloud|eu|uk|nl|fr|at|ch|info|tv|lan|local|home|internal|arpa|duckdns|ts\.net)(?![\w.\-])""",
)
private val UUID = Regex("""(?i)\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b""")
// Letters and digits together, so Media3's `ERROR_CODE_IO_NETWORK_CONNECTION_FAILED` stays.
private val ID = Regex("""(?<![\w+=\-])(?=[\w+=\-]*\d)(?=[\w+=\-]*[A-Za-z])[\w+=\-]{20,}""")

/**
 * [message] with what could name the server, the account, or a file
 * replaced by a placeholder: URLs, which hold a host and a path, then
 * [known] values, then the other patterns, from the widest to the narrowest.
 */
fun scrubLogMessage(message: String, known: KnownValues): String {
    // A parse error quotes the server's answer, which can hold any title.
    var text = JSON_INPUT.replace(message, "$1 <removed>")
    text = URL.replace(text, "<url>")
    // The longest first, so a name that holds another goes whole.
    for (value in known.server.filter { it.length >= 3 }.sortedByDescending { it.length }) {
        text = text.replace(value, "<server>", ignoreCase = true)
    }
    for (value in known.account.filter { it.length >= 3 }.sortedByDescending { it.length }) {
        text = text.replace(value, "<account>", ignoreCase = true)
    }
    text = CREDENTIAL.replace(text, "$1 <token>")
    text = ASSIGNED_SECRET.replace(text, "$1$2<token>")
    text = EMAIL.replace(text, "<email>")
    text = DOUBLE_QUOTED.replace(text, "\"…\"")
    text = SINGLE_QUOTED.replace(text, "'…'")
    text = PATH.replace(text, "<path>")
    text = MEDIA_FILE.replace(text, "<file>")
    text = IPV4.replace(text, "<ip>")
    text = IPV6.replace(text) {
        val address = it.value.any(Char::isLetterOrDigit) && ("::" in it.value || it.value.count { c -> c == ':' } >= 5)
        if (address) "<ip>" else it.value
    }
    text = HOST_WITH_PORT.replace(text, "<host>")
    text = HOST_BEFORE_IP.replace(text, "<host>")
    text = DOMAIN.replace(text, "<host>")
    text = UUID.replace(text, "<id>")
    text = ID.replace(text, "<id>")
    return text
}
