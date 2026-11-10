package io.github.zekurio.matinee.ui.home

import io.github.zekurio.matinee.ui.Load
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class HomeSectionsTest {
    @Test
    fun railsTellLoadingEmptyFailedAndShownApart() {
        assertEquals(RailState.Loading, railState<Int>(Load.Loading))
        assertEquals(RailState.Empty, railState(Load.Ready(emptyList<Int>())))
        assertEquals(RailState.Failed("offline"), railState<Int>(Load.Failed("offline")))
        assertEquals(RailState.Shown(listOf(1)), railState(Load.Ready(listOf(1))))
    }

    @Test
    fun aRailKnowsItFailedForWantOfTheServer() {
        assertEquals(RailState.Failed("unreachable", disconnected = true), railState<Int>(Load.Failed("unreachable", disconnected = true)))
        assertEquals(RailState.Failed("broke", disconnected = false), railState<Int>(Load.Failed("broke")))
    }

    @Test
    fun homeIsOneErrorOnlyWhenNothingCouldShow() {
        val failed = Load.Failed("offline")
        val empty = Load.Ready(emptyList<Int>())
        assertTrue(failedOutright(failed, listOf(failed, empty, failed)))
        assertFalse(failedOutright(failed, listOf(failed, Load.Ready(listOf(1)), failed)))
        assertFalse(failedOutright(failed, listOf(failed, Load.Loading, failed)))
        assertFalse(failedOutright(Load.Ready(emptyList<Int>()), listOf(failed, failed, failed)))
    }
}
