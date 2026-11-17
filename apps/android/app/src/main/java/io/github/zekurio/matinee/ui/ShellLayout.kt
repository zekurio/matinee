package io.github.zekurio.matinee.ui

/*
 * The signed-in phone shell's arrangement, after Findroid's phone app:
 * which tabs there are, where each place opens, and what Media shows for
 * the state of its search field. Shell, Nav, and the Media screen draw
 * what this decides. The iPhone app has the same rules in MatineeCore's
 * Shell/ShellLayout.swift, with a tablet's bar besides; Android uses the
 * phone's screens at every width, so it has only the phone's.
 *
 * The tabs are Home, Media, and Downloads. Search lives at the top of
 * Media, and the profile opens from the account button in Home's header,
 * as a page on top of Home.
 */

/** The shell's places, by their first page: the tabs, then the two that live inside them. */
enum class ShellPage { Home, Media, Downloads, Profile, Search }

/**
 * The tabs, in the bar's order. Offline only what works without the
 * server stays: Home from the downloads, and the downloads. There are no
 * libraries to show without the server, so no Media.
 */
fun shellTabs(offline: Boolean): List<ShellPage> =
    if (offline) listOf(ShellPage.Home, ShellPage.Downloads) else listOf(ShellPage.Home, ShellPage.Media, ShellPage.Downloads)

/**
 * Where a place opens: the tab whose first page it starts from, whether
 * the profile goes on top of that page, and whether Media's search field
 * takes the keyboard.
 */
data class ShellLanding(
    val tab: ShellPage,
    /** The profile is opened on top of [tab]'s first page, as Home's header opens it. */
    val underProfile: Boolean = false,
    /** Media opens with search open and its field focused, as Home's search button opens it. */
    val focusesSearch: Boolean = false,
)

/**
 * Where [page] opens. A tab opens as itself. The profile is a page on
 * Home, offline too, since it leads to Settings. Search is Media with its
 * field focused; offline, where there's no Media and nothing to search, it
 * lands on Home, as does anything else the tabs lack.
 */
fun shellLanding(page: ShellPage, offline: Boolean): ShellLanding {
    val tabs = shellTabs(offline)
    if (page in tabs) return ShellLanding(page)
    return when {
        page == ShellPage.Profile -> ShellLanding(ShellPage.Home, underProfile = true)
        page == ShellPage.Search && ShellPage.Media in tabs -> ShellLanding(ShellPage.Media, focusesSearch = true)
        else -> ShellLanding(ShellPage.Home)
    }
}

/**
 * Where a page that belongs to [owner], as Settings belongs to the
 * profile or Browse to search, goes on top of: [owner]'s landing, without
 * the keyboard, since the page opened is what's wanted.
 */
fun shellStack(owner: ShellPage, offline: Boolean): ShellLanding =
    shellLanding(owner, offline).copy(focusesSearch = false)

/**
 * Where Media's search was opened from: its own field, tapped on the Media
 * tab, or Home's search button, which opens Media with the field focused.
 */
enum class SearchOrigin { Media, Home }

/**
 * Whether opening search from [origin] runs Home's button growing into
 * Media's field, and the field shrinking back into the button on the way
 * back. Only from Home's button, where there's a button to grow from, and
 * not with animations removed, where it's a plain switch. A tap on the
 * Media tab is the tabs' slide, the field already in its place.
 */
fun searchMorphs(origin: SearchOrigin, reducedMotion: Boolean): Boolean =
    origin == SearchOrigin.Home && !reducedMotion

/** What the Media tab shows under its search field. */
sealed interface MediaPageContent {
    /** The libraries: the field at rest, with nothing typed. */
    data object Libraries : MediaPageContent

    /**
     * Search is open with nothing typed: Discover's rows, when the server
     * has Discover on, else nothing but the field.
     */
    data object Suggestions : MediaPageContent

    /** What the server found for [text], trimmed. */
    data class Results(val text: String) : MediaPageContent
}

/**
 * Media's search field: what's typed, and whether search is open. Search
 * opens when the field takes focus and stays open when the keyboard goes
 * down, as a scroll or Back puts it away, so what it shows doesn't vanish
 * under a finger. Text opens it too, as a search kept from before.
 *
 * What Back does depends on where search was opened ([origin]). Opened on
 * the Media tab, the field's Back arrow, or the system's Back once the
 * keyboard is down, closes it, back to the libraries, and the next Back
 * goes Home. Opened from Home's search button, either goes back to Home,
 * the way it came, as the field shrinking back into the button.
 */
data class MediaSearch(
    val query: String = "",
    /** The field took focus since search last closed; [open] says whether search is open. */
    val opened: Boolean = false,
    val origin: SearchOrigin = SearchOrigin.Media,
) {
    val open: Boolean get() = opened || query.isNotEmpty()

    /** The field took focus, opened from [from]; a search already open keeps where it came from. */
    fun begin(from: SearchOrigin = SearchOrigin.Media) = copy(opened = true, origin = if (open) origin else from)

    /** Back while it stays on Media: the text gone and the libraries back. */
    fun cancel() = MediaSearch()

    /** The text changed; clearing it with the field's own button leaves search open. */
    fun type(text: String) = copy(query = text, opened = open || text.isNotEmpty())

    /** Back closes search and stays on Media, rather than leaving Media for Home. */
    val closesOnBack: Boolean get() = open && origin == SearchOrigin.Media

    /** Back leaves Media for Home with search open, the way Home's button came. */
    val returnsHome: Boolean get() = open && origin == SearchOrigin.Home

    /** What the page shows under the field. */
    val content: MediaPageContent
        get() {
            val text = query.trim()
            return when {
                text.isNotEmpty() -> MediaPageContent.Results(text)
                open -> MediaPageContent.Suggestions
                else -> MediaPageContent.Libraries
            }
        }
}
