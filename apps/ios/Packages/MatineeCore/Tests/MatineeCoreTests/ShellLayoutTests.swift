import Testing

@testable import MatineeCore

/// The shell's arrangement after Findroid's phone app; Android has no test for it yet.
struct ShellLayoutTests {
  @Test func aPhoneHasHomeMediaAndDownloads() {
    #expect(shellTabs(.phone, offline: false) == [.home, .media, .downloads])
    #expect(shellTabs(.phone, offline: true) == [.home, .downloads])
  }

  @Test func aTabletKeepsSearchAndTheAccountInItsBar() {
    #expect(shellTabs(.tablet, offline: false) == [.home, .media, .downloads, .profile, .search])
    #expect(shellTabs(.tablet, offline: true) == [.home, .downloads, .profile])
  }

  @Test func aTabOpensAsItself() {
    for page in shellTabs(.phone, offline: false) {
      #expect(shellLanding(page, layout: .phone, offline: false) == ShellLanding(tab: page))
    }
    for page in ShellPage.allCases {
      #expect(shellLanding(page, layout: .tablet, offline: false) == ShellLanding(tab: page))
    }
  }

  @Test func onAPhoneTheProfileIsAPageOnHome() {
    let online = shellLanding(.profile, layout: .phone, offline: false)
    #expect(online == ShellLanding(tab: .home, underProfile: true))
    // Offline too: Home's header has the account, and the profile leads to Settings.
    #expect(shellLanding(.profile, layout: .phone, offline: true) == online)
  }

  @Test func onAPhoneSearchIsMediaWithItsFieldFocused() {
    #expect(shellLanding(.search, layout: .phone, offline: false) == ShellLanding(tab: .media, focusesSearch: true))
    // Offline there's no Media and nothing to search.
    #expect(shellLanding(.search, layout: .phone, offline: true) == ShellLanding(tab: .home))
  }

  @Test func whatATabletLacksOfflineLandsOnHome() {
    #expect(shellLanding(.media, layout: .tablet, offline: true) == ShellLanding(tab: .home))
    #expect(shellLanding(.search, layout: .tablet, offline: true) == ShellLanding(tab: .home))
    #expect(shellLanding(.media, layout: .phone, offline: true) == ShellLanding(tab: .home))
  }

  @Test func aPageOfTheProfileGoesOnHomeOverTheProfile() {
    // Settings, Recently watched, the requests queue: Back from them is the profile, as when opened from it.
    #expect(shellStack(for: .profile, layout: .phone, offline: false) == ShellLanding(tab: .home, underProfile: true))
    #expect(shellStack(for: .profile, layout: .tablet, offline: false) == ShellLanding(tab: .profile))
  }

  @Test func aPageOfSearchGoesOnMediaWithoutTheKeyboard() {
    // Browse, from a Discover row's heading.
    #expect(shellStack(for: .search, layout: .phone, offline: false) == ShellLanding(tab: .media))
    #expect(shellStack(for: .search, layout: .tablet, offline: false) == ShellLanding(tab: .search))
  }

  @Test func mediaShowsTheLibrariesWithTheFieldAtRest() {
    #expect(MediaSearch().content == .libraries)
  }

  @Test func focusingTheEmptyFieldShowsSuggestionsUntilCancel() {
    var search = MediaSearch()
    search.begin()
    #expect(search.content == .suggestions)
    search.cancel()
    #expect(search.content == .libraries)
    #expect(!search.open)
  }

  @Test func textShowsResultsAndCancelGoesBackToTheLibraries() {
    var search = MediaSearch()
    search.begin()
    search.type("  dune ")
    #expect(search.content == .results("dune"))
    search.cancel()
    #expect(search.query.isEmpty)
    #expect(search.content == .libraries)
  }

  @Test func clearingTheTextKeepsSearchOpen() {
    var search = MediaSearch()
    search.begin()
    search.type("dune")
    search.type("")
    #expect(search.content == .suggestions)
  }

  @Test func onlySpacesTypedIsStillNothingToSearch() {
    var search = MediaSearch()
    search.type("   ")
    #expect(search.content == .suggestions)
  }

  @Test func textFromElsewhereOpensSearch() {
    // A search kept from before, or `-dev.browse.query`.
    let search = MediaSearch(query: "matrix")
    #expect(search.open)
    #expect(search.content == .results("matrix"))
  }
}
