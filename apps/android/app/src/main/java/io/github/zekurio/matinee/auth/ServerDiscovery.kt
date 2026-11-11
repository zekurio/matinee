package io.github.zekurio.matinee.auth

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import java.io.IOException
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.Inet4Address
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.NetworkInterface
import java.net.SocketTimeoutException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.intOrNull
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull

/** A discovery hint, not a verified server. Connect through Session before signing in. */
data class DiscoveredServer(val name: String, val url: String)

private const val DISCOVERY_PORT = 8421
private const val MAX_BYTES = 512
private val probe = "Matinee discovery v1".padEnd(MAX_BYTES, ' ').toByteArray(Charsets.US_ASCII)
private val discoveryJson = Json { ignoreUnknownKeys = true }

// An Int serializer also accepts quoted numbers, which aren't protocol versions.
@Serializable
private data class DiscoveryReply(val version: JsonPrimitive, val name: String, val url: String)

/**
 * The permission the screen must request before collecting [discoverServers], or null.
 * Android 17 requires ACCESS_LOCAL_NETWORK for target SDK 37 and above. At our
 * current target of 36, INTERNET grants LAN access implicitly, so don't request it.
 * Check again before each scan, since the user can revoke permission in Settings.
 */
fun serverDiscoveryPermission(context: Context): String? =
    if (Build.VERSION.SDK_INT >= 37 && context.applicationInfo.targetSdkVersion >= 37 &&
        context.checkSelfPermission(Manifest.permission.ACCESS_LOCAL_NETWORK) != PackageManager.PERMISSION_GRANTED
    ) Manifest.permission.ACCESS_LOCAL_NETWORK else null

/**
 * A cold IPv4 LAN scan, ending after [timeoutMillis] or cancellation. Each collector
 * owns a socket. Network errors and denied access give no results, not an exception.
 * Check [serverDiscoveryPermission] and request its result before collecting.
 * Pass [destinations] to aim a JVM test at a loopback responder and its port.
 *
 * Probes go to each active interface's broadcast address and 255.255.255.255.
 * Replies are unicast, so no Wi-Fi multicast lock or multicast permission is needed.
 * Results are untrusted hints, deduplicated by URL. Pass a selected URL to Session's
 * existing connect function, which checks health. A scan never connects or signs in.
 */
fun discoverServers(
    timeoutMillis: Long = 3_000,
    destinations: () -> List<InetSocketAddress> = ::discoveryBroadcastAddresses,
): Flow<DiscoveredServer> = flow {
    if (timeoutMillis <= 0) return@flow
    val socket = discoverySocket() ?: return@flow
    socket.use {
        val started = System.nanoTime()
        val addresses = try {
            destinations()
        } catch (_: IOException) {
            emptyList()
        } catch (_: SecurityException) {
            emptyList()
        }
        for (destination in addresses.distinct()) {
            currentCoroutineContext().ensureActive()
            if (destination.isUnresolved || destination.address !is Inet4Address || destination.port == 0) continue
            try {
                socket.send(DatagramPacket(probe, probe.size, destination))
            } catch (_: IOException) {
                // One disconnected interface must not hide the others.
            } catch (_: SecurityException) {
                // Permission may have been revoked since the screen checked.
            }
        }
        val seen = mutableSetOf<String>()
        val bytes = ByteArray(MAX_BYTES + 1)
        while ((System.nanoTime() - started) / 1_000_000 < timeoutMillis) {
            currentCoroutineContext().ensureActive()
            val packet = DatagramPacket(bytes, bytes.size)
            try {
                // Short polling bounds cancellation latency without another thread.
                val remaining = timeoutMillis - (System.nanoTime() - started) / 1_000_000
                socket.soTimeout = remaining.coerceIn(1, 100).toInt()
                socket.receive(packet)
            } catch (_: SocketTimeoutException) {
                continue
            } catch (_: IOException) {
                break
            } catch (_: SecurityException) {
                break
            }
            if (packet.length > MAX_BYTES) continue
            val server = readDiscoveryReply(bytes, packet.length) ?: continue
            val key = server.url.toHttpUrlOrNull()?.toString() ?: continue
            if (seen.add(key)) emit(server)
        }
    }
}.flowOn(Dispatchers.IO)

private fun discoverySocket(): DatagramSocket? {
    var socket: DatagramSocket? = null
    return try {
        socket = DatagramSocket(null)
        socket.broadcast = true
        socket.bind(InetSocketAddress(0))
        socket
    } catch (_: IOException) {
        socket?.close()
        null
    } catch (_: SecurityException) {
        socket?.close()
        null
    }
}

private fun discoveryBroadcastAddresses(): List<InetSocketAddress> {
    val addresses = mutableSetOf(InetAddress.getByName("255.255.255.255"))
    try {
        for (network in NetworkInterface.getNetworkInterfaces()?.toList().orEmpty()) {
            try {
                if (!network.isUp || network.isLoopback) continue
                for (address in network.interfaceAddresses) {
                    val broadcast = address.broadcast
                    if (broadcast is Inet4Address) addresses.add(broadcast)
                }
            } catch (_: IOException) {
                // An interface can disappear during enumeration.
            } catch (_: SecurityException) {
                // Keep the limited broadcast when enumeration is restricted.
            }
        }
    } catch (_: IOException) {
        // Limited broadcast may still work when interface enumeration fails.
    } catch (_: SecurityException) {
        // The socket operation will also check permission.
    }
    return addresses.map { InetSocketAddress(it, DISCOVERY_PORT) }
}

private fun readDiscoveryReply(bytes: ByteArray, length: Int): DiscoveredServer? = try {
    val reply = discoveryJson.decodeFromString<DiscoveryReply>(
        bytes.decodeToString(0, length, throwOnInvalidSequence = true),
    )
    val name = reply.name.trim()
    val url = reply.url.toHttpUrlOrNull()
    if (reply.version.isString || reply.version.intOrNull != 1 || name.isEmpty() || name.codePointCount(0, name.length) > 64 ||
        reply.url.codePointCount(0, reply.url.length) > 400 || url == null || url.username.isNotEmpty() || url.password.isNotEmpty()
    ) null else DiscoveredServer(name, reply.url)
} catch (_: SerializationException) {
    null
} catch (_: IOException) {
    // Invalid UTF-8.
    null
}
