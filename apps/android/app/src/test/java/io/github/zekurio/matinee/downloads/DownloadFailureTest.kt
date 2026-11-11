package io.github.zekurio.matinee.downloads

import io.github.zekurio.matinee.api.ApiException
import java.io.IOException
import java.net.ConnectException
import java.net.NoRouteToHostException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import javax.net.ssl.SSLException
import org.junit.Assert.assertEquals
import org.junit.Test

class DownloadFailureTest {
    @Test
    fun notReachingTheServerSaysSo() {
        listOf(
            ConnectException("refused"),
            SocketTimeoutException("timeout"),
            UnknownHostException("nope.example"),
            NoRouteToHostException("no route"),
            SSLException("handshake"),
        ).forEach { assertEquals(it.toString(), DownloadFailure.Unreachable, downloadFailure(it)) }
    }

    @Test
    fun aConnectionCutOffMidwaySaysSo() {
        assertEquals(DownloadFailure.BrokeOff, downloadFailure(IOException("unexpected end of stream")))
    }

    @Test
    fun theServersOwnMessageIsKept() {
        assertEquals(
            DownloadFailure.Server("This file can't be encoded."),
            downloadFailure(ApiException(422, "encode_failed", "This file can't be encoded.")),
        )
    }

    @Test
    fun downloadsOffForTheAccountSaySoInTheAppsWords() {
        assertEquals(DownloadFailure.Forbidden, downloadFailure(ApiException(403, "FORBIDDEN", "Downloads are off for this account.")))
        // The byte routes answer with a bare status.
        assertEquals(DownloadFailure.Forbidden, downloadFailure(ApiException(403, null, "The server answered 403.")))
    }
}
