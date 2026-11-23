package io.github.zekurio.matinee.launcher

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class WatchNextPlanTest {
    private fun program(id: String, position: Long? = 12_000, engagement: Long? = 100) = WatchNextProgramMessage(
        itemId = id,
        kind = WatchNextKindMessage.RESUME,
        title = "The Show",
        episode = true,
        poster = false,
        positionMillis = position,
        engagementMillis = engagement,
    )

    private fun columns(program: WatchNextProgramMessage): WatchNextColumns = mapOf(
        "id" to program.itemId,
        "position" to program.positionMillis,
        "engagement" to program.engagementMillis,
    )

    private fun row(id: Long, program: WatchNextProgramMessage, browsable: Boolean = true) = WatchNextRow(
        id = id,
        browsable = browsable,
        engagementMillis = program.engagementMillis,
        values = columns(program).mapValues { it.value?.toString() },
    )

    private fun plan(
        rows: Map<String, WatchNextRow>,
        programs: List<WatchNextProgramMessage>,
        memory: WatchNextMemory = WatchNextMemory(),
    ) = planWatchNext(rows, memory, programs, ::columns)

    @Test
    fun `a first sync adds every card and remembers it`() {
        val plan = plan(emptyMap(), listOf(program("a"), program("b", engagement = 200)))
        assertEquals(listOf("a", "b"), plan.insert.map { it["id"] })
        assertTrue(plan.delete.isEmpty() && plan.update.isEmpty())
        assertEquals(mapOf("a" to 100L, "b" to 200L), plan.memory.published)
    }

    @Test
    fun `a row that's the same isn't written, and one that moved on keeps its id`() {
        val same = program("a")
        val before = program("b")
        val after = program("b", position = 30_000, engagement = 300)
        val plan = plan(mapOf("a" to row(1, same), "b" to row(2, before)), listOf(same, after))
        assertTrue(plan.insert.isEmpty() && plan.delete.isEmpty())
        assertEquals(listOf(2L), plan.update.map { it.first })
        assertEquals(30_000L, plan.update.single().second["position"])
    }

    @Test
    fun `a card the server dropped goes, and isn't taken for one the person removed`() {
        val gone = program("a")
        val first = plan(mapOf("a" to row(1, gone)), emptyList(), WatchNextMemory(published = mapOf("a" to 100L)))
        assertEquals(listOf(1L), first.delete)
        assertTrue(first.memory.published.isEmpty() && first.memory.dismissed.isEmpty())
        // Back in the server's list later, it's a card again.
        assertEquals(1, plan(emptyMap(), listOf(gone), first.memory).insert.size)
    }

    @Test
    fun `a card the launcher hid stays out through another sync`() {
        val hidden = program("a")
        val plan = plan(mapOf("a" to row(1, hidden, browsable = false)), listOf(hidden))
        assertTrue(plan.insert.isEmpty() && plan.update.isEmpty() && plan.delete.isEmpty())
        assertEquals(mapOf("a" to 100L), plan.memory.dismissed)
    }

    @Test
    fun `a card the launcher deleted stays out too`() {
        val removed = program("a")
        val plan = plan(emptyMap(), listOf(removed), WatchNextMemory(published = mapOf("a" to 100L)))
        assertTrue(plan.insert.isEmpty())
        assertEquals(mapOf("a" to 100L), plan.memory.dismissed)
        // And through the sync after that, which no longer has it as published.
        assertTrue(plan(emptyMap(), listOf(removed), plan.memory).insert.isEmpty())
    }

    @Test
    fun `watching it again brings a removed card back as a new row`() {
        val watched = program("a", position = 60_000, engagement = 500)
        val plan = plan(
            mapOf("a" to row(1, program("a"), browsable = false)),
            listOf(watched),
            WatchNextMemory(dismissed = mapOf("a" to 100L)),
        )
        assertEquals(listOf(1L), plan.delete)
        assertEquals(listOf("a"), plan.insert.map { it["id"] })
        assertTrue(plan.memory.dismissed.isEmpty())
        assertEquals(mapOf("a" to 500L), plan.memory.published)
    }

    @Test
    fun `only new playback counts as watching again`() {
        val card = program("a")
        assertFalse(card.watchedAfter(100))
        assertTrue(card.watchedAfter(99))
        assertFalse(program("a", position = 0).watchedAfter(-1))
        assertFalse(program("a", position = null).watchedAfter(-1))
        assertFalse(program("a", engagement = null).watchedAfter(-1))
    }

    @Test
    fun `a file sent twice is one row`() {
        assertEquals(1, plan(emptyMap(), listOf(program("a"), program("a"))).insert.size)
    }
}
