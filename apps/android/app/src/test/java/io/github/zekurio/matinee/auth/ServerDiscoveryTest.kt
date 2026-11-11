package io.github.zekurio.matinee.auth

import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.SocketException
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.flow.take
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ServerDiscoveryTest {
    private val loopback = InetAddress.getByName("127.0.0.1")
    private val good = """{"version":1,"name":"Matinee","url":"https://media.example.com","future":true}"""

    @Test
    fun scanSkipsMalformedAndDuplicateReplies(): Unit = runBlocking {
        DatagramSocket(0, loopback).use { responder ->
            responder.soTimeout = 2_000
            val executor = Executors.newSingleThreadExecutor()
            try {
                val sent = executor.submit {
                    val request = DatagramPacket(ByteArray(1024), 1024)
                    responder.receive(request)
                    assertEquals(512, request.length)
                    assertEquals("Matinee discovery v1".padEnd(512, ' '), request.data.decodeToString(0, request.length))
                    val replies = listOf(
                        "not JSON",
                        "{}",
                        good.replace("\"version\":1", "\"version\":2"),
                        good.replace("\"version\":1", "\"version\":\"1\""),
                        good.replace("\"Matinee\"", "42"),
                        good.replace("https://media.example.com", "file:///etc/passwd"),
                        good.replace("https://media.example.com", "https://user:pass@media.example.com"),
                        good.replace("\"Matinee\"", "\" \""),
                        good.replace("media.example.com", "oversize.example.com").padEnd(513, ' '),
                    ).mapIndexed { index, reply -> reply.replace("media.example.com", "bad$index.example.com") } + listOf(good, good)
                    val invalidUtf8 = good.replace("Matinee", "x").toByteArray().apply {
                        this[indexOf('x'.code.toByte())] = 0xff.toByte()
                    }
                    responder.send(DatagramPacket(invalidUtf8, invalidUtf8.size, request.socketAddress))
                    for (reply in replies) {
                        val bytes = reply.toByteArray()
                        responder.send(DatagramPacket(bytes, bytes.size, request.socketAddress))
                    }
                }
                var enumerated = false
                val scan = discoverServers(timeoutMillis = 500) {
                    enumerated = true
                    listOf(InetSocketAddress(loopback, responder.localPort))
                }
                assertTrue(!enumerated)
                assertEquals(listOf(DiscoveredServer("Matinee", "https://media.example.com")), scan.toList())
                sent.get(3, TimeUnit.SECONDS)
            } finally {
                executor.shutdownNow()
            }
        }
    }

    @Test
    fun cancellationClosesTheScanWithoutWaitingForItsTimeout(): Unit = runBlocking {
        DatagramSocket(0, loopback).use { responder ->
            responder.soTimeout = 2_000
            val executor = Executors.newSingleThreadExecutor()
            try {
                val sent = executor.submit {
                    val request = DatagramPacket(ByteArray(512), 512)
                    responder.receive(request)
                    val bytes = good.toByteArray()
                    responder.send(DatagramPacket(bytes, bytes.size, request.socketAddress))
                }
                val started = System.nanoTime()
                val servers = discoverServers(timeoutMillis = 10_000) {
                    listOf(InetSocketAddress(loopback, responder.localPort))
                }.take(1).toList()
                assertEquals(1, servers.size)
                assertTrue(TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started) < 2_000)
                sent.get(3, TimeUnit.SECONDS)
            } finally {
                executor.shutdownNow()
            }
        }
    }

    @Test
    fun networkErrorsAndTimeoutsGiveNoResults() = runBlocking {
        assertTrue(discoverServers(timeoutMillis = 20) { throw SocketException("offline") }.toList().isEmpty())
        DatagramSocket(0, loopback).use { silent ->
            assertTrue(discoverServers(timeoutMillis = 20) {
                listOf(InetSocketAddress(loopback, silent.localPort))
            }.toList().isEmpty())
        }
    }
}
