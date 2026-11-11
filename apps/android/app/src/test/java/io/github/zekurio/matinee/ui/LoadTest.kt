package io.github.zekurio.matinee.ui

import io.github.zekurio.matinee.api.ApiException
import java.io.IOException
import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class LoadTest {
    @Test
    fun aFailedRefreshKeepsWhatLoadedBefore() {
        val settled = Load.Ready(listOf(1, 2)).failedWith("offline")
        assertEquals(Load.Ready(listOf(1, 2)), settled.state)
        assertEquals("offline", settled.refreshError)
    }

    @Test
    fun aFailedFirstLoadFails() {
        val before: Load<List<Int>> = Load.Loading
        val settled = before.failedWith("offline")
        assertEquals(Load.Failed("offline"), settled.state)
        assertNull(settled.refreshError)
    }

    @Test
    fun notReachingTheServerIsADisconnect() {
        assertTrue(isDisconnect(ConnectException("refused")))
        assertTrue(isDisconnect(SocketTimeoutException("timeout")))
        assertTrue(isDisconnect(UnknownHostException("nope.example")))
        // Reached, then cut off mid-answer.
        assertTrue(isDisconnect(IOException("unexpected end of stream")))
    }

    @Test
    fun theServerAnsweringWithAnErrorIsNot() {
        assertFalse(isDisconnect(ApiException(500, null, "Something broke on the server.")))
        assertFalse(isDisconnect(IllegalStateException("not a network failure")))
    }

    @Test
    fun aFirstLoadRemembersItCouldNotReachTheServer() {
        val before: Load<List<Int>> = Load.Loading
        val settled = before.failedWith("unreachable", disconnected = true)
        assertEquals(Load.Failed("unreachable", disconnected = true), settled.state)
        assertFalse(settled.refreshDisconnected)
    }

    @Test
    fun aRefreshRemembersItCouldNotReachTheServer() {
        val settled = Load.Ready(listOf(1)).failedWith("unreachable", disconnected = true)
        assertEquals(Load.Ready(listOf(1)), settled.state)
        assertEquals("unreachable", settled.refreshError)
        assertTrue(settled.refreshDisconnected)
    }

    @Test
    fun aServerErrorIsNotADisconnect() {
        val before: Load<List<Int>> = Load.Loading
        assertEquals(Load.Failed("broke"), before.failedWith("broke").state)
        assertFalse(Load.Ready(listOf(1)).failedWith("broke").refreshDisconnected)
    }

    @Test
    fun aFirstLoadOutOfReachShowsWhatWasKept() {
        val before: Load<List<Int>> = Load.Loading
        val settled = before.failedWith("unreachable", disconnected = true) { listOf(3) }
        assertEquals(Load.Ready(listOf(3)), settled.state)
        assertEquals("unreachable", settled.refreshError)
        assertTrue(settled.refreshDisconnected)
    }

    @Test
    fun aServerErrorDoesNotFallBackToWhatWasKept() {
        val before: Load<List<Int>> = Load.Loading
        assertEquals(Load.Failed("broke"), before.failedWith("broke") { listOf(3) }.state)
    }

    @Test
    fun nothingKeptStillFails() {
        val before: Load<List<Int>> = Load.Loading
        assertEquals(Load.Failed("unreachable", disconnected = true), before.failedWith("unreachable", disconnected = true) { null }.state)
    }
}
