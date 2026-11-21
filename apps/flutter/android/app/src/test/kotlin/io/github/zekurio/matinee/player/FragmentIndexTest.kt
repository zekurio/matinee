package io.github.zekurio.matinee.player

import java.io.ByteArrayOutputStream
import java.io.DataOutputStream
import java.io.File
import java.nio.file.Files
import org.junit.After
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test

class FragmentIndexTest {
    private lateinit var dir: File

    @Before
    fun setUp() {
        dir = Files.createTempDirectory("fragments").toFile()
    }

    @After
    fun tearDown() {
        dir.deleteRecursively()
    }

    private fun box(type: String, vararg body: ByteArray): ByteArray {
        val content = body.fold(ByteArray(0)) { all, part -> all + part }
        val out = ByteArrayOutputStream()
        DataOutputStream(out).apply {
            writeInt(8 + content.size)
            writeBytes(type)
            write(content)
        }
        return out.toByteArray()
    }

    private fun ints(vararg values: Long): ByteArray {
        val out = ByteArrayOutputStream()
        DataOutputStream(out).apply { values.forEach { writeInt(it.toInt()) } }
        return out.toByteArray()
    }

    /** `tkhd` v0: flags, two times, then the track id. */
    private fun track(id: Long, timescale: Long) = box(
        "trak",
        box("tkhd", ints(0, 0, 0, id, 0, 0)),
        box("mdia", box("mdhd", ints(0, 0, 0, timescale, 0))),
    )

    /** A segment as the server sends it: `styp`, `moof` with `tfdt` v1, `mdat`. */
    private fun segment(id: Long, decodeTime: Long, payload: Int) =
        box("styp", "msdh".toByteArray()) +
            box(
                "moof",
                box("mfhd", ints(0, 1)),
                box("traf", box("tfhd", ints(0, id)), box("tfdt", ints(1L shl 24, decodeTime shr 32, decodeTime and 0xffffffff))),
            ) +
            box("mdat", ByteArray(payload))

    private fun write(vararg parts: ByteArray): File =
        File(dir, "video.mp4").apply { writeBytes(parts.fold(ByteArray(0)) { all, part -> all + part }) }

    @Test
    fun `finds each fragment of a device version by its first track's decode time`() {
        val init = box("ftyp", "iso6".toByteArray()) +
            box(
                "moov",
                // mvhd v0: timescale 1000, 9 s.
                box("mvhd", ints(0, 0, 0, 1000, 9000)),
                track(1, 90_000),
                track(2, 48_000),
            )
        val first = segment(1, 0, 100)
        val audio = segment(2, 0, 50)
        val second = segment(1, 4 * 90_000L, 200)
        val file = write(init, first, audio, second)

        val index = FragmentIndex.of(file)!!

        val styp = 8 + 4
        val firstMoof = (init.size + styp).toLong()
        val secondMoof = (init.size + first.size + audio.size + styp).toLong()
        assertArrayEquals(longArrayOf(firstMoof, secondMoof), index.offsets)
        assertArrayEquals(intArrayOf((secondMoof - firstMoof).toInt(), (file.length() - secondMoof).toInt()), index.sizes)
        assertArrayEquals(longArrayOf(0, 4_000_000), index.timesUs)
        assertArrayEquals(longArrayOf(4_000_000, 5_000_000), index.durationsUs)
    }

    @Test
    fun `a file without fragments has no index`() {
        val file = write(box("ftyp", "isom".toByteArray()), box("moov", box("mvhd", ints(0, 0, 0, 1000, 1000))), box("mdat", ByteArray(10)))

        assertNull(FragmentIndex.of(file))
    }

    @Test
    fun `a cut-off box has no index`() {
        val whole = box("ftyp", "iso6".toByteArray()) + box("moov", track(1, 1000)) + segment(1, 0, 100)
        val file = write(whole.copyOf(whole.size - 10))

        assertNull(FragmentIndex.of(file))
    }
}
