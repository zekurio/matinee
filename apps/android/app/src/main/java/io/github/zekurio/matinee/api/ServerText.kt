package io.github.zekurio.matinee.api

import android.content.res.Resources

/**
 * An English message from the server or a schema, as the web's catalog has
 * it, for [translateServerMessage] to match. [text] keeps its `{name}`
 * placeholders; [names] lists them in order, [args] the placeholders in the
 * resource's `%n$` order (`count` first for a plural), and [resId] is the
 * string or plurals resource that translates it. ServerMessages.kt is
 * generated from the web's catalog.
 */
internal class ServerMessage(
    val text: String,
    val names: List<String>,
    val args: List<String>,
    val resId: Int,
    val plural: Boolean,
)

private val placeholder = Regex("""\{(\w+)\}""")

/** Messages without placeholders, by their text. A later one with the same text wins, as on the web. */
private val exactMessages: Map<String, ServerMessage> = serverMessages
    .filter { it.names.isEmpty() }
    .associateBy { it.text }

/** Messages with placeholders, each as a pattern whose placeholders capture any text, in the catalog's order. */
private val patternMessages: List<Pair<ServerMessage, Regex>> = serverMessages
    .filter { it.names.isNotEmpty() }
    .map { it to patternOf(it.text) }

/** [text] as a pattern: its literal parts quoted, and each `{name}` a group that takes at least one character. */
private fun patternOf(text: String): Regex {
    val pattern = StringBuilder()
    var last = 0
    for (match in placeholder.findAll(text)) {
        pattern.append(Regex.escape(text.substring(last, match.range.first))).append("(.+?)")
        last = match.range.last + 1
    }
    pattern.append(Regex.escape(text.substring(last)))
    return Regex(pattern.toString())
}

/**
 * The app's text for an English message from the server or a schema, with
 * its placeholders filled in from the text; null when no message matches.
 * Matches the way the web's `translateKnown()` does: the exact messages
 * first, then the patterns in the catalog's order, each over the whole text.
 */
fun translateServerMessage(resources: Resources, text: String): String? {
    exactMessages[text]?.let { return it.localize(resources, emptyMap()) }
    for ((message, pattern) in patternMessages) {
        val match = pattern.matchEntire(text) ?: continue
        val values = message.names.zip(match.groupValues.drop(1)).toMap()
        return message.localize(resources, values) ?: continue
    }
    return null
}

/**
 * The message's resource with [values] (captured by name) in its argument
 * order. A plural takes its quantity from `count`, 1 when there is none;
 * null when that count isn't a whole number.
 */
private fun ServerMessage.localize(resources: Resources, values: Map<String, String>): String? {
    if (!plural) {
        if (args.isEmpty()) return resources.getString(resId)
        return resources.getString(resId, *args.map { values.getValue(it) }.toTypedArray())
    }
    val quantity = (values["count"] ?: "1").toIntOrNull() ?: return null
    val formatArgs: Array<Any> = args.map<String, Any> {
        if (it == "count") quantity else values.getValue(it)
    }.toTypedArray()
    return resources.getQuantityString(resId, quantity, *formatArgs)
}

/**
 * The application's resources, for server text shown where none are at
 * hand, like a snackbar from a coroutine. [MatineeApp] sets them at start;
 * they follow the app's language as it changes.
 */
@Volatile
internal var appResources: Resources? = null

/** [text] from the server in the app's language when the catalog knows it, else as the server sent it. */
fun serverWords(text: String, resources: Resources? = appResources): String =
    resources?.let { translateServerMessage(it, text) } ?: text
