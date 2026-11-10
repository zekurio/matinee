package io.github.zekurio.matinee.ui.player

import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration

/** One subtitle: when it shows, on the file's timeline, and what it says. */
class Cue(val start: Double, val end: Double, val text: AnnotatedString)

/**
 * A WebVTT track as the server converts subtitles to, drawn by the player
 * itself. Its times are the file's, so it stays in step whatever the video
 * comes as: the file, a stream that starts partway in, or an encode.
 */
class CueTrack(private val cues: List<Cue>) {
    /** The cues showing at [seconds] into the file. */
    fun at(seconds: Double): List<Cue> {
        // Cues are sorted by start; look back from the last that started.
        var low = 0
        var high = cues.size
        while (low < high) {
            val mid = (low + high) ushr 1
            if (cues[mid].start <= seconds) low = mid + 1 else high = mid
        }
        val shown = ArrayList<Cue>(2)
        var i = low - 1
        // Long cues can overlap later ones; a few steps back is plenty.
        while (i >= 0 && low - i <= 16) {
            val cue = cues[i]
            if (cue.end > seconds) shown.add(0, cue)
            i--
        }
        return shown
    }

    companion object {
        private val TIMING = Regex("""((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})\s+-->\s+((?:\d+:)?\d{1,2}:\d{2}[.,]\d{1,3})""")
        private val TAG = Regex("""<(/?)([a-z]+)[^>]*>""", RegexOption.IGNORE_CASE)

        private fun seconds(stamp: String): Double {
            val parts = stamp.replace(',', '.').split(':')
            var total = 0.0
            for (part in parts) total = total * 60 + part.toDouble()
            return total
        }

        private fun unescape(text: String) = text
            .replace("&lt;", "<").replace("&gt;", ">").replace("&nbsp;", "\u00A0")
            .replace("&lrm;", "").replace("&rlm;", "").replace("&amp;", "&")

        /** Italic, bold, and underline from `<i>`, `<b>`, and `<u>`; other tags dropped. */
        private fun styled(lines: List<String>): AnnotatedString = buildAnnotatedString {
            val text = lines.joinToString("\n")
            var index = 0
            var italic = 0
            var bold = 0
            var underline = 0
            fun appendPlain(part: String) {
                if (part.isEmpty()) return
                val style = SpanStyle(
                    fontStyle = if (italic > 0) FontStyle.Italic else null,
                    fontWeight = if (bold > 0) FontWeight.Bold else null,
                    textDecoration = if (underline > 0) TextDecoration.Underline else null,
                )
                pushStyle(style)
                append(unescape(part))
                pop()
            }
            for (match in TAG.findAll(text)) {
                appendPlain(text.substring(index, match.range.first))
                val closing = match.groupValues[1] == "/"
                val step = if (closing) -1 else 1
                when (match.groupValues[2].lowercase()) {
                    "i" -> italic = maxOf(0, italic + step)
                    "b" -> bold = maxOf(0, bold + step)
                    "u" -> underline = maxOf(0, underline + step)
                }
                index = match.range.last + 1
            }
            appendPlain(text.substring(index))
        }

        fun parse(source: String): CueTrack {
            val cues = ArrayList<Cue>()
            val blocks = source.replace("\r\n", "\n").replace('\r', '\n').split(Regex("\n{2,}"))
            for (block in blocks) {
                val lines = block.lines()
                val timingAt = lines.indexOfFirst { TIMING.containsMatchIn(it) }
                if (timingAt < 0) continue
                val timing = TIMING.find(lines[timingAt]) ?: continue
                val text = lines.drop(timingAt + 1).filter { it.isNotBlank() }
                if (text.isEmpty()) continue
                cues.add(Cue(seconds(timing.groupValues[1]), seconds(timing.groupValues[2]), styled(text)))
            }
            cues.sortBy { it.start }
            return CueTrack(cues)
        }
    }
}
