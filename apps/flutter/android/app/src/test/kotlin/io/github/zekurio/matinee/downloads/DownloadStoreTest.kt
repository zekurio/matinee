package io.github.zekurio.matinee.downloads

import java.io.File
import java.nio.file.Files
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class DownloadStoreTest {
    private lateinit var dir: File

    @Before
    fun setUp() {
        dir = Files.createTempDirectory("store").toFile()
    }

    @After
    fun tearDown() {
        dir.deleteRecursively()
    }

    private fun entry(id: String, addedAt: Long) = OfflineEntry(
        id = id,
        server = "https://media.example.com/",
        apiBase = "https://media.example.com/api",
        kind = DownloadKind.DEVICE,
        file = "$id/video.mp4",
        name = "Dune",
        meta = """{"item":{"id":"$id"}}""",
        streamUrl = "https://media.example.com/api/media/$id/stream",
        spec = """{"video":{"mode":"copy"}}""",
        subtitles = listOf(SavedSubtitle("t", "$id/subtitles/0.vtt", "https://media.example.com/api/media/$id/subtitles/t")),
        totalBytes = 42,
        addedAt = addedAt,
    )

    @Test
    fun `what's kept is read back after a restart, oldest first`() {
        val store = DownloadStore(dir)
        store.put(entry("b", 2))
        store.put(entry("a", 1))
        store.update("b") { it.copy(state = DownloadState.FAILED, errorKind = DownloadError.SERVER, error = "No.", bytes = 7) }
        val again = DownloadStore(dir)
        assertEquals(listOf("a", "b"), again.all.map { it.id })
        assertEquals(store["b"], again["b"])
        assertEquals("No.", again["b"]!!.error)
        assertNull(again["a"]!!.serverId)
    }

    @Test
    fun `an entry it can't read doesn't lose the others`() {
        DownloadStore(dir).put(entry("a", 1))
        val index = File(dir, "${DownloadStore.FOLDER}/index.json")
        index.writeText(index.readText().replaceFirst("[", """[{"id":"broken"},"""))
        assertEquals(listOf("a"), DownloadStore(dir).all.map { it.id })
    }

    @Test
    fun `a list it can't read at all starts empty`() {
        File(dir, DownloadStore.FOLDER).mkdirs()
        File(dir, "${DownloadStore.FOLDER}/index.json").writeText("{not json")
        assertTrue(DownloadStore(dir).all.isEmpty())
    }

    @Test
    fun `removing takes the files too and tells the listeners`() {
        val store = DownloadStore(dir)
        val heard = mutableListOf<Int>()
        store.listen { heard += it.size }
        store.put(entry("a", 1))
        File(store.root, "a").mkdirs()
        File(store.root, "a/video.mp4").writeText("x")
        store.remove("a")
        assertFalse(File(store.root, "a").exists())
        assertEquals(listOf(1, 0), heard)
    }
}

class CredentialsTest {
    private class Memory : KeyValues {
        val values = mutableMapOf<String, String>()

        override fun get(key: String) = values[key]

        override fun put(key: String, value: String?) {
            if (value == null) values.remove(key) else values[key] = value
        }
    }

    private object Reversed : Vault {
        override fun seal(plain: String) = plain.reversed()

        override fun open(sealed: String) = sealed.reversed()
    }

    @Test
    fun `a server's sign-in is kept sealed until it's forgotten`() {
        val memory = Memory()
        val credentials = Credentials(memory, Reversed)
        assertNull(credentials.of("https://a.example/"))
        credentials.set("https://a.example/", "secret", "Matinee/1.0")
        assertFalse(memory.values.values.contains("secret"))
        assertEquals(ServerSignIn("secret", "Matinee/1.0"), credentials.of("https://a.example/"))
        // Signed out there: still saved, so its downloads try and the server says no.
        credentials.set("https://a.example/", null, "Matinee/1.0")
        assertEquals(ServerSignIn(null, "Matinee/1.0"), credentials.of("https://a.example/"))
        credentials.forget("https://a.example/")
        assertNull(credentials.of("https://a.example/"))
    }

    @Test
    fun `the token goes only to its server`() {
        assertTrue(Credentials.sameOrigin("https://a.example/api/media/x/stream", "https://a.example/"))
        assertTrue(Credentials.sameOrigin("https://A.example:443/x", "https://a.example/"))
        assertFalse(Credentials.sameOrigin("http://a.example/x", "https://a.example/"))
        assertFalse(Credentials.sameOrigin("https://a.example:8443/x", "https://a.example/"))
        assertFalse(Credentials.sameOrigin("https://b.example/x", "https://a.example/"))
        assertFalse(Credentials.sameOrigin("https://user@a.example/x", "https://a.example/"))
    }
}
