package io.github.zekurio.matinee.downloads

import java.io.ByteArrayInputStream
import java.io.File
import java.io.IOException
import java.net.ConnectException
import java.net.UnknownHostException
import java.nio.file.Files
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test

private const val API = "https://media.example.com/api"
private const val SERVER = "https://media.example.com/"

/** Answers by address, and keeps what was asked. */
private class FakeHttp : DownloadHttp {
    val asked = mutableListOf<String>()
    val posted = mutableListOf<Pair<String, String>>()
    var answers: (method: String, url: String, from: Long) -> HttpAnswer = { _, _, _ -> answer(404) }

    override suspend fun get(url: String, from: Long, slow: Boolean): HttpAnswer {
        asked += if (from > 0) "$url@$from" else url
        return answers("GET", url, from)
    }

    override suspend fun post(url: String, json: String): HttpAnswer {
        posted += url to json
        return answers("POST", url, 0)
    }

    override suspend fun delete(url: String): HttpAnswer {
        asked += "DELETE $url"
        return answers("DELETE", url, 0)
    }
}

private fun answer(code: Int, body: ByteArray = ByteArray(0), headers: Map<String, String> = emptyMap(), length: Long = body.size.toLong()) =
    HttpAnswer(code, headers.mapKeys { it.key.lowercase() }, ByteArrayInputStream(body), length)

private fun answer(code: Int, body: String, headers: Map<String, String> = emptyMap()) = answer(code, body.toByteArray(), headers)

class DownloadFetcherTest {
    private lateinit var dir: File
    private lateinit var store: DownloadStore
    private val http = FakeHttp()
    private val waits = mutableListOf<Long>()
    private var clock = 0L

    private fun fetcher() = DownloadFetcher(store, http, wait = { waits += it }, now = { clock })

    private fun original(id: String = "item", subtitles: List<SavedSubtitle> = emptyList(), image: String? = null) = OfflineEntry(
        id = id,
        server = SERVER,
        apiBase = API,
        kind = DownloadKind.ORIGINAL,
        file = "$id/video.mkv",
        name = "Dune",
        meta = "{}",
        streamUrl = "$API/media/$id/stream",
        imageUrl = image,
        subtitles = subtitles,
        totalBytes = 10,
    )

    private fun device(id: String = "item") = original(id).copy(
        kind = DownloadKind.DEVICE,
        file = "$id/video.mp4",
        spec = """{"video":{"mode":"copy"},"audio":[{"mode":"copy","index":1}]}""",
    )

    @Before
    fun setUp() {
        dir = Files.createTempDirectory("downloads").toFile()
        store = DownloadStore(dir)
    }

    @After
    fun tearDown() {
        dir.deleteRecursively()
    }

    private fun video(id: String = "item") = File(store.root, store[id]!!.file)

    @Test
    fun `an original comes whole, then resumes from where a break left it`() = runBlocking {
        store.put(original())
        // The first run breaks off after four of ten bytes.
        http.answers = { _, _, _ -> answer(200, "abcd".toByteArray(), length = 10) }
        try {
            fetcher().fetch("item")
            fail("a short body is a break")
        } catch (_: IOException) {
        }
        assertEquals("abcd", video().readText())
        assertEquals(4L, store["item"]!!.bytes)
        // The next asks for the rest, and the server sends it as a range.
        http.answers = { _, _, from ->
            assertEquals(4L, from)
            answer(206, "efghij".toByteArray(), mapOf("Content-Range" to "bytes 4-9/10"))
        }
        fetcher().fetch("item")
        assertEquals("abcdefghij", video().readText())
        assertEquals(10L, store["item"]!!.bytes)
        assertEquals(10L, store["item"]!!.totalBytes)
        assertEquals("$API/media/item/stream@4", http.asked.last())
    }

    @Test
    fun `a server that ignores the range sends the file again from the start`() = runBlocking {
        store.put(original())
        video().apply { parentFile?.mkdirs() }.writeText("xx")
        http.answers = { _, _, _ -> answer(200, "0123456789") }
        fetcher().fetch("item")
        assertEquals("0123456789", video().readText())
    }

    @Test
    fun `a range past the end means the file is all here`() = runBlocking {
        store.put(original())
        video().apply { parentFile?.mkdirs() }.writeText("0123456789")
        http.answers = { _, _, _ -> answer(416) }
        fetcher().fetch("item")
        assertEquals("0123456789", video().readText())
    }

    @Test
    fun `a refusal of the file is the server's`() = runBlocking {
        store.put(original())
        http.answers = { _, _, _ -> answer(500) }
        try {
            fetcher().fetch("item")
            fail("expected a failure")
        } catch (e: IOException) {
            assertEquals(DownloadFailure.Server(null), downloadFailure(e))
        }
    }

    @Test
    fun `the picture and the subtitles that come are saved, the rest left out`() = runBlocking {
        store.put(
            original(
                subtitles = listOf(
                    SavedSubtitle("s1", "item/subtitles/0.vtt", "$API/media/item/subtitles/s1"),
                    SavedSubtitle("s2", "item/subtitles/1.vtt", "$API/media/item/subtitles/s2"),
                ),
                image = "$API/artwork/a1",
            ),
        )
        http.answers = { _, url, _ ->
            when {
                url.endsWith("/s1") -> answer(200, "WEBVTT\n")
                url.endsWith("/s2") -> answer(422)
                url.endsWith("/a1") -> answer(200, "jpeg")
                else -> answer(200, "0123456789")
            }
        }
        fetcher().fetch("item")
        val entry = store["item"]!!
        assertEquals(listOf("s1"), entry.subtitles.map { it.trackId })
        assertEquals("WEBVTT\n", File(store.root, "item/subtitles/0.vtt").readText())
        assertFalse(File(store.root, "item/subtitles/1.vtt.part").exists())
        assertEquals("item/image.jpg", entry.image)
        assertEquals("jpeg", File(store.root, "item/image.jpg").readText())
    }

    @Test
    fun `a device version is set up once, then fetched segment by segment`() = runBlocking {
        store.put(device())
        var busy = true
        http.answers = { method, url, _ ->
            when {
                method == "POST" -> answer(200, """{"id":"d1","plan":{"estimatedBytes":99}}""")
                method == "DELETE" -> answer(204)
                url.endsWith("/init.mp4") -> answer(200, "I")
                url.endsWith("/0.m4s") -> answer(200, "A")
                // Still making the second one: wait as the server says, then ask again.
                url.endsWith("/1.m4s") && busy -> {
                    busy = false
                    answer(503, "", mapOf("Retry-After" to "3"))
                }
                url.endsWith("/1.m4s") -> answer(200, "B".toByteArray(), mapOf("X-Matinee-Last-Segment" to "1"))
                else -> answer(404)
            }
        }
        fetcher().fetch("item")
        assertEquals("IAB", video().readText())
        assertEquals(listOf(3000L), waits)
        val (url, body) = http.posted.single()
        assertEquals("$API/v1/media/item/downloads", url)
        assertEquals("copy", JSONObject(body).getJSONObject("spec").getJSONObject("video").getString("mode"))
        val entry = store["item"]!!
        assertEquals("d1", entry.serverId)
        assertEquals(2, entry.segment)
        assertEquals(3L, entry.bytes)
        // The server lets go of the version once it's all here.
        assertEquals("DELETE $API/v1/downloads/d1", http.asked.last())
    }

    @Test
    fun `a version waiting its turn on the server waits, rather than failing`() = runBlocking {
        store.put(device())
        var turns = 2
        http.answers = { method, url, _ ->
            when {
                method == "POST" -> answer(200, """{"id":"d1","plan":{"estimatedBytes":99}}""")
                method == "DELETE" -> answer(204)
                // Queued behind the others: no init segment yet, twice.
                url.endsWith("/init.mp4") && turns > 0 -> {
                    turns--
                    answer(503, "", mapOf("Retry-After" to "5"))
                }
                url.endsWith("/init.mp4") -> answer(200, "I")
                url.endsWith("/0.m4s") -> answer(200, "A".toByteArray(), mapOf("X-Matinee-Last-Segment" to "1"))
                else -> answer(404)
            }
        }
        fetcher().fetch("item")
        assertEquals("IA", video().readText())
        assertEquals(listOf(5000L, 5000L), waits)
        // Set up once, however long it waited.
        assertEquals(1, http.posted.size)
    }

    @Test
    fun `a device version picks up after the last whole segment`() = runBlocking {
        store.put(device().copy(serverId = "d1", segment = 1, bytes = 2))
        // A segment cut off by the break is still in the file.
        video().apply { parentFile?.mkdirs() }.writeText("IAhalf")
        http.answers = { method, url, _ ->
            when {
                method == "DELETE" -> answer(204)
                url.endsWith("/1.m4s") -> answer(200, "B")
                url.endsWith("/2.m4s") -> answer(204)
                else -> answer(404)
            }
        }
        fetcher().fetch("item")
        assertEquals("IAB", video().readText())
        assertTrue(http.posted.isEmpty())
    }

    @Test
    fun `a version the server lost starts over, twice at most`() = runBlocking {
        store.put(device())
        var started = 0
        http.answers = { method, _, _ ->
            when (method) {
                "POST" -> answer(200, """{"id":"d${++started}","plan":{"estimatedBytes":5}}""")
                else -> answer(409)
            }
        }
        try {
            fetcher().fetch("item")
            fail("expected it to give up")
        } catch (e: IOException) {
            assertTrue(e.cause is StartOver)
        }
        assertEquals(3, started)
        // The last version asked for stays, for the next run to find lost too.
        assertEquals("d3", store["item"]!!.serverId)
    }

    @Test
    fun `the server's words come with a refused start`() = runBlocking {
        store.put(device())
        http.answers = { _, _, _ -> answer(422, """{"message":"Too big.","code":"x"}""") }
        try {
            fetcher().fetch("item")
            fail("expected a refusal")
        } catch (e: IOException) {
            assertEquals(DownloadFailure.Server("Too big."), downloadFailure(e))
        }
    }

    @Test
    fun `progress is written down at most once a second`() = runBlocking {
        store.put(original())
        clock = 5_000
        val seen = mutableListOf<Long>()
        val chunks = DownloadFetcher(store, http, wait = {}, now = { clock }, onProgress = { seen += it.bytes })
        http.answers = { _, _, _ -> answer(200, ByteArray(200 * 1024), length = 200 * 1024) }
        chunks.fetch("item")
        // Four chunks in the same second: the first, and the last forced.
        assertEquals(listOf(64L * 1024, 200L * 1024), seen)
    }

    @Test
    fun `a version's segments tell their progress at most once a second`() = runBlocking {
        store.put(device())
        clock = 5_000
        val seen = mutableListOf<Long>()
        val segments = DownloadFetcher(store, http, wait = {}, now = { clock }, onProgress = { seen += it.bytes })
        http.answers = { method, url, _ ->
            when {
                method == "POST" -> answer(200, """{"id":"d1","plan":{"estimatedBytes":9}}""")
                method == "DELETE" -> answer(204)
                url.endsWith("/init.mp4") -> answer(200, "I")
                url.endsWith("/3.m4s") -> answer(200, "D".toByteArray(), mapOf("X-Matinee-Last-Segment" to "1"))
                url.endsWith(".m4s") -> answer(200, "S")
                else -> answer(404)
            }
        }
        segments.fetch("item")
        assertEquals("ISSSD", video().readText())
        // Four segments in the same second: only the first is told.
        assertEquals(listOf(2L), seen)
        assertEquals(4, store["item"]!!.segment)
    }

    @Test
    fun `failures are sorted by what they mean`() {
        assertEquals(DownloadFailure.Forbidden, downloadFailure(DownloadHttpException(403, "No.")))
        assertEquals(DownloadFailure.Server("Gone."), downloadFailure(DownloadHttpException(404, "Gone.")))
        assertEquals(DownloadFailure.Unreachable, downloadFailure(UnknownHostException()))
        assertEquals(DownloadFailure.Unreachable, downloadFailure(ConnectException()))
        assertEquals(DownloadFailure.BrokeOff, downloadFailure(IOException("reset")))
    }

    @Test
    fun `routes escape their segments`() {
        assertEquals("$API/downloads/a%20b/0.m4s", DownloadFetcher.route("$API/", "downloads", "a b", "0.m4s"))
    }
}
