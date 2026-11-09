package io.github.zekurio.matinee.ui

import java.io.IOException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.async
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class MarksTest {
    private val values = HashMap<String, Boolean>()
    private var reconciled = 0
    private val marks = Marks(values) { reconciled++ }

    @Test
    fun keepsAMarkTheServerTook() = runBlocking {
        marks.send("a", true) {}
        assertEquals(true, marks["a"])
        assertEquals(0, reconciled)
    }

    @Test
    fun aFailedMarkGoesBackToTheScreensValue() = runBlocking {
        val failed = runCatching { marks.send("a", true) { throw IOException("offline") } }
        assertTrue(failed.exceptionOrNull() is IOException)
        assertNull(marks["a"])
        assertEquals(0, reconciled)
    }

    @Test
    fun aFailedMarkGoesBackToWhatTheServerLastTook() = runBlocking {
        marks.send("a", true) {}
        runCatching { marks.send("a", false) { throw IOException("offline") } }
        assertEquals(true, marks["a"])
    }

    @Test
    fun anOlderFailureDoesNotUndoANewerMark() = runBlocking {
        val first = CompletableDeferred<Unit>()
        val second = CompletableDeferred<Unit>()
        val a = async(start = CoroutineStart.UNDISPATCHED) { runCatching { marks.send("a", true) { first.await() } } }
        val b = async(start = CoroutineStart.UNDISPATCHED) { runCatching { marks.send("a", false) { second.await() } } }
        assertEquals(false, marks["a"])
        first.completeExceptionally(IOException("offline"))
        a.await()
        assertEquals(false, marks["a"])
        second.complete(Unit)
        b.await()
        assertEquals(false, marks["a"])
        // The overtaken request's outcome is unsure, so screens fetch again.
        assertEquals(1, reconciled)
    }

    @Test
    fun theNewestFailureRestoresWhatTheServerConfirmedNotAPendingValue() = runBlocking {
        marks.send("a", false) {}
        val first = CompletableDeferred<Unit>()
        val second = CompletableDeferred<Unit>()
        val a = async(start = CoroutineStart.UNDISPATCHED) { runCatching { marks.send("a", true) { first.await() } } }
        val b = async(start = CoroutineStart.UNDISPATCHED) { runCatching { marks.send("a", true) { second.await() } } }
        second.completeExceptionally(IOException("offline"))
        b.await()
        assertEquals(false, marks["a"])
        first.complete(Unit)
        a.await()
        // Still the newest's restore; the late success asks screens to fetch.
        assertEquals(false, marks["a"])
        assertEquals(1, reconciled)
    }

    @Test
    fun aCancelledMarkRollsBackAndAsksForTheTruth() = runBlocking {
        val never = CompletableDeferred<Unit>()
        val a = async(start = CoroutineStart.UNDISPATCHED) { marks.send("a", true) { never.await() } }
        assertEquals(true, marks["a"])
        a.cancel()
        a.join()
        assertTrue(a.isCancelled)
        assertNull(marks["a"])
        assertEquals(1, reconciled)
    }

    @Test
    fun forgettingDropsTheMarkAndIgnoresRequestsStillOut() = runBlocking {
        val first = CompletableDeferred<Unit>()
        val a = async(start = CoroutineStart.UNDISPATCHED) { runCatching { marks.send("a", true) { first.await() } } }
        marks.forget("a")
        assertNull(marks["a"])
        first.completeExceptionally(IOException("offline"))
        a.await()
        assertNull(marks["a"])
    }

    @Test
    fun confirmingSetsWhatAFailureLaterRestores() = runBlocking {
        marks.confirm("a", true)
        runCatching { marks.send("a", false) { throw IOException("offline") } }
        assertEquals(true, marks["a"])
    }

    @Test
    fun idsStayApart() = runBlocking {
        marks.send("a", true) {}
        runCatching { marks.send("b", true) { throw IOException("offline") } }
        assertEquals(true, marks["a"])
        assertNull(marks["b"])
    }
}
