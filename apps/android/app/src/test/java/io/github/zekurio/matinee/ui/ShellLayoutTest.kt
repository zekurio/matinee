package io.github.zekurio.matinee.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The shell's arrangement after Findroid's phone app, as the iPhone's
 * ShellLayoutTests have it, less the tablet's bar, which Android doesn't
 * have: a tablet uses the phone's screens.
 */
class ShellLayoutTest {
    @Test
    fun aPhoneHasHomeMediaAndDownloads() {
        assertEquals(listOf(ShellPage.Home, ShellPage.Media, ShellPage.Downloads), shellTabs(offline = false))
        assertEquals(listOf(ShellPage.Home, ShellPage.Downloads), shellTabs(offline = true))
    }

    @Test
    fun aTabOpensAsItself() {
        for (offline in listOf(false, true)) {
            for (page in shellTabs(offline)) assertEquals(ShellLanding(page), shellLanding(page, offline))
        }
    }

    @Test
    fun theProfileIsAPageOnHome() {
        val online = shellLanding(ShellPage.Profile, offline = false)
        assertEquals(ShellLanding(ShellPage.Home, underProfile = true), online)
        // Offline too: Home's header has the account, and the profile leads to Settings.
        assertEquals(online, shellLanding(ShellPage.Profile, offline = true))
    }

    @Test
    fun searchIsMediaWithItsFieldFocused() {
        assertEquals(ShellLanding(ShellPage.Media, focusesSearch = true), shellLanding(ShellPage.Search, offline = false))
        // Offline there's no Media and nothing to search.
        assertEquals(ShellLanding(ShellPage.Home), shellLanding(ShellPage.Search, offline = true))
    }

    @Test
    fun whatOfflineLacksLandsOnHome() {
        assertEquals(ShellLanding(ShellPage.Home), shellLanding(ShellPage.Media, offline = true))
    }

    @Test
    fun aPageOfTheProfileGoesOnHomeOverTheProfile() {
        // Settings, Recently watched, the requests queue: Back from them is the profile, as when opened from it.
        assertEquals(ShellLanding(ShellPage.Home, underProfile = true), shellStack(ShellPage.Profile, offline = false))
    }

    @Test
    fun aPageOfSearchGoesOnMediaWithoutTheKeyboard() {
        // Browse, from a Discover row's heading.
        assertEquals(ShellLanding(ShellPage.Media), shellStack(ShellPage.Search, offline = false))
    }

    @Test
    fun mediaShowsTheLibrariesWithTheFieldAtRest() {
        assertEquals(MediaPageContent.Libraries, MediaSearch().content)
    }

    @Test
    fun focusingTheEmptyFieldShowsSuggestionsUntilBack() {
        var search = MediaSearch().begin()
        assertEquals(MediaPageContent.Suggestions, search.content)
        search = search.cancel()
        assertEquals(MediaPageContent.Libraries, search.content)
        assertFalse(search.open)
    }

    @Test
    fun textShowsResultsAndBackGoesBackToTheLibraries() {
        var search = MediaSearch().begin().type("  dune ")
        assertEquals(MediaPageContent.Results("dune"), search.content)
        search = search.cancel()
        assertTrue(search.query.isEmpty())
        assertEquals(MediaPageContent.Libraries, search.content)
    }

    @Test
    fun clearingTheTextKeepsSearchOpen() {
        val search = MediaSearch().begin().type("dune").type("")
        assertEquals(MediaPageContent.Suggestions, search.content)
    }

    @Test
    fun onlySpacesTypedIsStillNothingToSearch() {
        assertEquals(MediaPageContent.Suggestions, MediaSearch().type("   ").content)
    }

    @Test
    fun textFromElsewhereOpensSearch() {
        // A search kept from before, as a configuration change restores it.
        val search = MediaSearch(query = "matrix")
        assertTrue(search.open)
        assertEquals(MediaPageContent.Results("matrix"), search.content)
    }

    @Test
    fun textKeptFromBeforeStaysOpenOnceCleared() {
        val search = MediaSearch(query = "matrix").type("")
        assertTrue(search.open)
        assertEquals(MediaPageContent.Suggestions, search.content)
    }

    @Test
    fun backFromSearchOpenedOnMediaClosesItAndStays() {
        val search = MediaSearch().begin(SearchOrigin.Media).type("dune")
        assertTrue(search.closesOnBack)
        assertFalse(search.returnsHome)
        // At rest, Back isn't the field's: it leaves Media for Home, as from any tab.
        assertFalse(MediaSearch().closesOnBack)
        assertFalse(MediaSearch().returnsHome)
    }

    @Test
    fun backFromSearchOpenedByHomesButtonGoesHome() {
        val search = MediaSearch().begin(SearchOrigin.Home)
        assertTrue(search.returnsHome)
        assertFalse(search.closesOnBack)
        // Typing and clearing don't change where it came from.
        assertTrue(search.type("dune").type("").returnsHome)
    }

    @Test
    fun searchAlreadyOpenKeepsWhereItCameFrom() {
        // Focus coming back to the field, as after a title's page, isn't a new opening.
        assertEquals(SearchOrigin.Home, MediaSearch().begin(SearchOrigin.Home).begin(SearchOrigin.Media).origin)
        // Closed and opened again on Media, it's Media's.
        assertEquals(SearchOrigin.Media, MediaSearch().begin(SearchOrigin.Home).cancel().begin(SearchOrigin.Media).origin)
    }

    @Test
    fun onlyHomesButtonMorphsIntoTheField() {
        assertTrue(searchMorphs(SearchOrigin.Home, reducedMotion = false))
        // The Media tab has no button to grow from: the tabs slide.
        assertFalse(searchMorphs(SearchOrigin.Media, reducedMotion = false))
        // With animations removed, a plain switch.
        assertFalse(searchMorphs(SearchOrigin.Home, reducedMotion = true))
    }
}
