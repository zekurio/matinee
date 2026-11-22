package io.github.zekurio.matinee.player

import androidx.media3.common.C
import androidx.media3.common.util.UnstableApi
import androidx.media3.extractor.ChunkIndex
import androidx.media3.extractor.Extractor
import androidx.media3.extractor.ExtractorInput
import androidx.media3.extractor.ExtractorOutput
import androidx.media3.extractor.ExtractorsFactory
import androidx.media3.extractor.PositionHolder
import androidx.media3.extractor.SeekMap
import androidx.media3.extractor.mp4.FragmentedMp4Extractor
import androidx.media3.extractor.text.DefaultSubtitleParserFactory
import java.io.File
import java.io.RandomAccessFile

/**
 * Where each fragment of a fragmented MP4 starts, in bytes and in time.
 * A version made for this device is saved as its init segment and its
 * segments one after another, with no `sidx` or `mfra` to say where they
 * are, so Media3 takes the file as unseekable and plays every seek, and
 * every resume, from the start. Reading the boxes' headers finds them.
 */
internal class FragmentIndex(
    val offsets: LongArray,
    val sizes: IntArray,
    val timesUs: LongArray,
    val durationsUs: LongArray,
) {
    fun chunks(): ChunkIndex = ChunkIndex(sizes, offsets, durationsUs, timesUs)

    companion object {
        /** The fragments of [file], or null when it isn't a fragmented MP4. */
        fun of(file: File): FragmentIndex? = try {
            RandomAccessFile(file, "r").use(::read)
        } catch (_: java.io.IOException) {
            null
        }

        private fun read(input: RandomAccessFile): FragmentIndex? {
            val length = input.length()
            val timescales = HashMap<Long, Long>()
            var duration = C.TIME_UNSET
            var track = -1L
            val offsets = ArrayList<Long>()
            val times = ArrayList<Long>()
            var at = 0L
            while (at + 8 <= length) {
                val (type, size, header) = box(input, at, length) ?: return null
                when (type) {
                    "moov" -> {
                        val moov = bytes(input, at + header, size - header) ?: return null
                        duration = movieDuration(moov)
                        timescales.putAll(trackTimescales(moov))
                    }
                    "moof" -> {
                        val moof = bytes(input, at + header, size - header) ?: return null
                        val (id, decodeTime) = firstDecodeTime(moof) ?: return null
                        if (track < 0) track = id
                        if (id == track) {
                            val scale = timescales[id] ?: return null
                            offsets += at
                            times += decodeTime * 1_000_000 / scale
                        }
                    }
                }
                at += size
            }
            if (offsets.isEmpty()) return null
            val count = offsets.size
            val sizes = IntArray(count) { i ->
                ((if (i + 1 < count) offsets[i + 1] else length) - offsets[i]).coerceAtMost(Int.MAX_VALUE.toLong()).toInt()
            }
            val timesUs = times.toLongArray()
            val durationsUs = LongArray(count) { i ->
                when {
                    i + 1 < count -> timesUs[i + 1] - timesUs[i]
                    duration != C.TIME_UNSET && duration > timesUs[i] -> duration - timesUs[i]
                    i > 0 -> timesUs[i] - timesUs[i - 1]
                    else -> 0
                }
            }
            return FragmentIndex(offsets.toLongArray(), sizes, timesUs, durationsUs)
        }

        /** A box at [at]: its type, its whole size, and its header's size. */
        private fun box(input: RandomAccessFile, at: Long, end: Long): Triple<String, Long, Int>? {
            val head = bytes(input, at, 16.coerceAtMost((end - at).toInt())) ?: return null
            if (head.size < 8) return null
            val type = String(head, 4, 4, Charsets.ISO_8859_1)
            val small = u32(head, 0)
            val (size, header) = when (small) {
                0L -> (end - at) to 8
                1L -> if (head.size < 16) return null else u64(head, 8) to 16
                else -> small to 8
            }
            if (size < header || at + size > end) return null
            return Triple(type, size, header)
        }

        private fun bytes(input: RandomAccessFile, at: Long, count: Long): ByteArray? =
            if (count < 0 || count > Int.MAX_VALUE) null else bytes(input, at, count.toInt())

        private fun bytes(input: RandomAccessFile, at: Long, count: Int): ByteArray? {
            if (count < 0) return null
            val out = ByteArray(count)
            input.seek(at)
            input.readFully(out)
            return out
        }

        /** The children of a box's body, as (type, body start, body end). */
        private fun children(data: ByteArray, from: Int = 0, to: Int = data.size) = sequence {
            var at = from
            while (at + 8 <= to) {
                val small = u32(data, at)
                val type = String(data, at + 4, 4, Charsets.ISO_8859_1)
                val (size, header) = when (small) {
                    0L -> (to - at).toLong() to 8
                    1L -> if (at + 16 > to) break else u64(data, at + 8) to 16
                    else -> small to 8
                }
                if (size < header || at + size > to) break
                yield(Triple(type, at + header, (at + size).toInt()))
                at += size.toInt()
            }
        }

        private fun child(data: ByteArray, type: String, from: Int = 0, to: Int = data.size) =
            children(data, from, to).firstOrNull { it.first == type }

        /** The movie's length from `mvhd`, or from `mvex`'s `mehd` for a fragmented one. */
        private fun movieDuration(moov: ByteArray): Long {
            val mvhd = child(moov, "mvhd") ?: return C.TIME_UNSET
            val scale: Long
            var length: Long
            if (moov[mvhd.second].toInt() == 1) {
                scale = u32(moov, mvhd.second + 20)
                length = u64(moov, mvhd.second + 24)
            } else {
                scale = u32(moov, mvhd.second + 12)
                length = u32(moov, mvhd.second + 16)
            }
            child(moov, "mvex")?.let { mvex ->
                child(moov, "mehd", mvex.second, mvex.third)?.let { mehd ->
                    length = if (moov[mehd.second].toInt() == 1) u64(moov, mehd.second + 4) else u32(moov, mehd.second + 4)
                }
            }
            return if (scale > 0 && length > 0) length * 1_000_000 / scale else C.TIME_UNSET
        }

        /** Each track's timescale, from `tkhd` and `mdhd`, by track id. */
        private fun trackTimescales(moov: ByteArray): Map<Long, Long> = buildMap {
            for ((type, from, to) in children(moov)) {
                if (type != "trak") continue
                val tkhd = child(moov, "tkhd", from, to) ?: continue
                val id = u32(moov, tkhd.second + if (moov[tkhd.second].toInt() == 1) 20 else 12)
                val mdia = child(moov, "mdia", from, to) ?: continue
                val mdhd = child(moov, "mdhd", mdia.second, mdia.third) ?: continue
                val scale = u32(moov, mdhd.second + if (moov[mdhd.second].toInt() == 1) 20 else 12)
                if (scale > 0) put(id, scale)
            }
        }

        /** The first track fragment's track id and `tfdt` decode time. */
        private fun firstDecodeTime(moof: ByteArray): Pair<Long, Long>? {
            val traf = child(moof, "traf") ?: return null
            val tfhd = child(moof, "tfhd", traf.second, traf.third) ?: return null
            val tfdt = child(moof, "tfdt", traf.second, traf.third) ?: return null
            val id = u32(moof, tfhd.second + 4)
            val time = if (moof[tfdt.second].toInt() == 1) u64(moof, tfdt.second + 4) else u32(moof, tfdt.second + 4)
            return id to time
        }

        private fun u32(data: ByteArray, at: Int): Long =
            ((data[at].toLong() and 0xff) shl 24) or ((data[at + 1].toLong() and 0xff) shl 16) or
                ((data[at + 2].toLong() and 0xff) shl 8) or (data[at + 3].toLong() and 0xff)

        private fun u64(data: ByteArray, at: Int): Long = (u32(data, at) shl 32) or u32(data, at + 4)
    }
}

/**
 * Media3's fragmented MP4 extractor, with [FragmentIndex] for its seek map
 * when the file says nothing of where its fragments are.
 */
@UnstableApi
internal class IndexedFragmentsExtractor(private val file: File) : Extractor {
    private val inner = FragmentedMp4Extractor(DefaultSubtitleParserFactory(), 0)

    override fun sniff(input: ExtractorInput): Boolean = inner.sniff(input)

    override fun init(output: ExtractorOutput) {
        inner.init(object : ExtractorOutput by output {
            override fun seekMap(seekMap: SeekMap) {
                output.seekMap(if (seekMap.isSeekable) seekMap else FragmentIndex.of(file)?.chunks() ?: seekMap)
            }
        })
    }

    override fun read(input: ExtractorInput, seekPosition: PositionHolder): Int = inner.read(input, seekPosition)

    override fun seek(position: Long, timeUs: Long) = inner.seek(position, timeUs)

    override fun release() = inner.release()

    companion object {
        /** For a version made for this device, saved at [file]. */
        fun factory(file: File) = ExtractorsFactory { arrayOf(IndexedFragmentsExtractor(file)) }
    }
}
