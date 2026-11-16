import MatineeCore
import MatineeKit
import SwiftUI

/*
 * ProfileScreen.kt, drawn as the web's profiles.$username.tsx draws your
 * own profile: who's signed in, their favorites, what they asked for,
 * their statistics, and what they watched last, with the way on to
 * Settings, where signing out is. It's the profile tab's first page, so
 * it has no bar of its own: its header carries Settings, and on a phone
 * starts under the status bar, as Android's and the web's phone layout.
 *
 * What the server sent last is kept per account, as Home keeps its rows
 * (ProfileData.swift): while the server can't be reached it stays up with
 * the cloud in the header, and offline mode shows it, though nothing in it
 * opens. The cards are Stats.swift's, the charts StatsCharts.swift's.
 */

/// The profile tab, behind the person's picture in the tabs.
struct ProfileScreen: View {
  @Environment(\.user) private var user

  var body: some View {
    if let user {
      ProfilePage(username: user.username).id(user.username)
    }
  }
}

private struct ProfilePage: View {
  @State private var loads: ProfileLoads
  @Environment(\.offline) private var offline
  @Environment(\.shellStyle) private var style
  @Environment(\.requests) private var requests
  @Environment(\.navigator) private var nav

  init(username: String) {
    _loads = State(initialValue: ProfileLoads(username: username))
  }

  var body: some View {
    let state = loads.profileState(offline: offline)
    ScrollView {
      ScrollViewReader { proxy in
      LazyVStack(alignment: .leading, spacing: style == .tablet ? Space.s10 : Space.s8) {
        // Showing what loaded before while the server can't be reached: the cloud, up top.
        // The inbox opens the admin's queue, with the count of what needs them.
        ProfileHeader(
          profile: state?.value, onRequests: requests == nil ? devInbox.open : { nav.requests(nil) },
          needsYou: max(requests?.queue.needsYou ?? 0, devInbox.count)
        ) {
          DisconnectedAction(loads.reloadable)
        }
        switch state {
        case nil:
          // Offline with nothing kept: the header, and Settings in it, alone.
          EmptyView()
        case .loading:
          RailSkeleton(title: Str.favoritesTitle, art: .poster)
          StatsLoading()
        case .failed(let message, let disconnected):
          ErrorState(
            Str.profileLoadFailed, message, disconnected: disconnected, retrying: loads.profile.refreshing,
            onRetry: loads.profile.reload
          )
          .frame(maxWidth: .infinity)
          .padding(.vertical, Space.s12)
        case .ready(let profile):
          FavoritesRail(profile: profile)
          if !offline { ProfileRequests() }
          Statistics(loads: loads).id("stats")
          RecentRail(profile: profile).id("recent")
        }
      }
      .padding(.bottom, Space.s8)
      #if DEBUG
        .task(id: state?.value != nil) {
          // `-dev.profileScroll stats|titles|standing|activity|recent`, for screenshots.
          guard state?.value != nil, let anchor = UserDefaults.standard.string(forKey: "dev.profileScroll") else { return }
          try? await Task.sleep(for: .seconds(2))
          proxy.scrollTo(anchor, anchor: .top)
        }
      #endif
      }
    }
    .scrollsToTopOnReselect()
    .statusBarScrim()
    .modifier(RefreshesOnline(loads: loads))
    .hidesSystemNavigationBar()
    .loadsProfile(loads)
  }
}

extension ProfilePage {
  /// The inbox's stand-in: in debug builds, `-dev.profileInbox 3` shows it
  /// with three waiting, going nowhere, to see how it looks.
  fileprivate var devInbox: (open: (() -> Void)?, count: Int) {
    #if DEBUG
      let count = UserDefaults.standard.integer(forKey: "dev.profileInbox")
      if count > 0 { return ({}, count) }
    #endif
    return (nil, 0)
  }
}

/// A pull fetches everything on the page again; offline there's nothing to ask.
private struct RefreshesOnline: ViewModifier {
  let loads: ProfileLoads
  @Environment(\.offline) private var offline

  func body(content: Content) -> some View {
    if offline {
      content
    } else {
      content.refreshable { await loads.refresh() }
    }
  }
}

// MARK: Who

/// The picture and name, the username under a display name, Admin, and
/// since when they're here, with Settings at the row's end, as the web's
/// own profile on a phone and Android's. `action` goes before Settings;
/// offline, the offline cloud, as on Home. At the largest text sizes who
/// it is gets the width under the picture and the buttons, rather than an
/// ellipsis beside them.
private struct ProfileHeader<Action: View>: View {
  let profile: Profile?
  /// Opens the requests hub, for the admin's inbox; nil leaves it out.
  let onRequests: (() -> Void)?
  /// How many requests wait on the admin, for the inbox's dot.
  let needsYou: Int
  @ViewBuilder let action: () -> Action
  @Environment(\.api) private var api
  @Environment(\.gutter) private var gutter
  @Environment(\.navigator) private var nav
  @Environment(\.offline) private var offline
  @Environment(\.palette) private var palette
  @Environment(\.user) private var user
  @Environment(\.windowSize) private var window
  @Environment(\.dynamicTypeSize) private var typeSize

  var body: some View {
    if let user {
      Group {
        if typeSize.isAccessibilitySize {
          VStack(alignment: .leading, spacing: Space.s3) {
            HStack(spacing: Space.s3) {
              picture(user)
              Spacer(minLength: 0)
              buttons(user)
            }
            who(user, stacked: true)
          }
        } else {
          HStack(spacing: window.width < 640 ? Space.s4 : Space.s6) {
            picture(user)
            who(user, stacked: false)
            buttons(user)
          }
        }
      }
      .padding(.horizontal, gutter)
      .padding(.top, Space.s4)
    }
  }

  /// The web's `size-16 sm:size-20` with its `shadow-lg shadow-black/40`.
  private func picture(_ user: User) -> some View {
    ProfileAvatar(user.name, url: user.avatarId.flatMap { api?.paths.avatar($0) }, size: window.width < 640 ? 64 : 80)
      .kitShadow(.menu)
      .accessibilityHidden(true)
  }

  /// The name over the facts, `text-22px sm:text-26px md:text-32px`; the
  /// facts wrap a whole one at a time, as the web's `flex-wrap gap-x-3`.
  private func who(_ user: User, stacked: Bool) -> some View {
    let size: TextSize = window.width < 640 ? .px22 : window.width < 768 ? .px26 : .px32
    return VStack(alignment: .leading, spacing: Space.s1) {
      Text(user.name)
        .textStyle(size, weight: .semibold, tracking: .tight)
        .foregroundStyle(palette.foreground)
        .lineLimit(stacked ? nil : 1)
        .accessibilityAddTraits(.isHeader)
      FlowRow(spacing: Space.s3, lineSpacing: Space.s1) {
        if user.displayName != nil { Text(verbatim: "@\(user.username)") }
        if user.isAdmin {
          HStack(spacing: Space.s1) {
            LucideIcon(.shield, size: 14, tint: palette.mutedForeground)
            Text(Str.profileAdmin)
          }
        }
        if let joined = profile.flatMap(joinedMonth) { Text(Str.profileJoined(joined)) }
      }
      .textStyle(.sm)
      .foregroundStyle(palette.mutedForeground)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .accessibilityElement(children: .combine)
  }

  /// The cloud or offline, the admin's requests, then Settings: the web's round `size-11` buttons.
  @ViewBuilder private func buttons(_ user: User) -> some View {
    HStack(spacing: Space.s2) {
      if offline {
        LucideIcon(.cloudOff, label: Str.downloadsOffline, size: 20, tint: palette.mutedForeground)
          .padding(.horizontal, Space.s1)
      } else {
        action()
        if user.isAdmin, let onRequests {
          RequestsButton(needsYou: needsYou, action: onRequests)
        }
      }
      RoundIconButton(.settings, label: Str.shellSettings, look: .secondary, size: TouchTarget, iconSize: 20) {
        nav.settings()
      }
    }
  }
}

/// The admin's way to the queue, as Android's and the web's own profile on
/// a phone: the inbox, with the accent's dot while requests need them.
private struct RequestsButton: View {
  let needsYou: Int
  let action: () -> Void
  @Environment(\.palette) private var palette

  var body: some View {
    RoundIconButton(
      .inbox, label: needsYou > 0 ? Str.webRequestsMenuWaiting(needsYou) : Str.webRequestsMenu, look: .secondary,
      size: TouchTarget, iconSize: 20, action: action
    )
    .overlay(alignment: .topTrailing) {
      if needsYou > 0 {
        // The web's `size-2 ring-2 ring-secondary`, `top-1.5 right-1.5`.
        Circle()
          .fill(palette.accent)
          .frame(width: Space.s2, height: Space.s2)
          .padding(2)
          .background(palette.secondary, in: Circle())
          .padding(Space.s1)
          .allowsHitTesting(false)
          .accessibilityHidden(true)
      }
    }
  }
}

// MARK: Sections

/// Favorites of every kind in one rail of posters, newest first, as the
/// web shows them; its heading opens the whole lists. One taken off here
/// goes at once, before the profile is fetched again. With none yet, how
/// to make one.
private struct FavoritesRail: View {
  let profile: Profile
  @Environment(\.gutter) private var gutter
  @Environment(\.navigator) private var nav
  @Environment(\.offline) private var offline
  @Environment(ViewerState.self) private var viewer: ViewerState?

  var body: some View {
    let favorites = shownFavorites(profile, viewer: viewer)
    if favorites.isEmpty {
      VStack(alignment: .leading, spacing: 0) {
        SectionTitle(Str.favoritesTitle)
        EmptyState(icon: .heart, title: Str.favoritesEmpty, description: Str.favoritesEmptyHint)
      }
      .padding(.horizontal, gutter)
    } else {
      // Offline the whole lists are the server's to send.
      Rail(Str.favoritesTitle, onTitleTap: offline ? nil : nav.favorites) {
        ForEach(favorites, id: \.key) { favorite in
          RailItem(.poster) { FavoriteCard(favorite) }
        }
      }
    }
  }
}

/// "My requests", between the favorites and the statistics, as Android's
/// `ProfileAskedRail` and the web's: what you asked for is yours alone,
/// and this is only ever your own profile. Online only.
private struct ProfileRequests: View {
  var body: some View { AskedRail(.profile) }
}

/// What they watched last, a file per title, its heading opening the whole list.
private struct RecentRail: View {
  let profile: Profile
  @Environment(\.navigator) private var nav
  @Environment(\.offline) private var offline

  var body: some View {
    if let recent = profile.recent, !recent.isEmpty {
      Rail(Str.profileRecent, onTitleTap: offline ? nil : nav.recent) {
        ForEach(recent, id: \.item.id) { entry in
          RailItem(.landscape) { EpisodeCard(entry.item) }
        }
      }
    }
  }
}

/// The statistics' heading and range, then what the figures say: the
/// cards, nothing ever watched, nothing in the range, or what went wrong.
/// The last range's figures stay up while the next one loads.
private struct Statistics: View {
  let loads: ProfileLoads
  @Environment(\.gutter) private var gutter
  @Environment(\.offline) private var offline

  var body: some View {
    let stats = loads.stats
    let content = stats.content
    VStack(alignment: .leading, spacing: Space.s4) {
      // With nothing ever watched, picking a period changes nothing.
      StatsHeading(range: stats.range, showsRange: content != .neverWatched) { loads.pick($0, offline: offline) }
      section(content)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, gutter)
    }
  }

  @ViewBuilder private func section(_ content: StatsContent) -> some View {
    let loader = loads.stats.loader
    switch content {
    case .failed(let message, let disconnected):
      // Offline there's no server to ask again.
      ErrorSection(
        Str.profileStatsFailed, message, retrying: loader.refreshing, disconnected: disconnected,
        onRetry: offline ? nil : { loader.reload() })
    case .loading: StatsSkeleton()
    case .unavailable: EmptyView()
    case .neverWatched:
      EmptyState(icon: .popcorn, title: Str.profileSelfEmpty, description: Str.profileSelfEmptyHint)
        .padding(.vertical, Space.s4)
    case .nothingInRange:
      EmptyState(icon: .calendar, title: Str.profileNothingWatched(rangePhrase(loads.range))) {
        MatineeButton(Str.profileShowAllTime, look: .outline) { loads.pick(StatsRange.all, offline: offline) }
      }
    case .shown(let figures):
      StatsCards(stats: figures, range: loads.range, board: loads.board, standing: !offline)
    }
  }
}

/// The statistics' heading over their skeleton, while the profile loads.
private struct StatsLoading: View {
  @Environment(\.gutter) private var gutter

  var body: some View {
    VStack(alignment: .leading, spacing: Space.s4) {
      SectionTitle(Str.profileStatistics).padding(.horizontal, gutter)
      StatsSkeleton().padding(.horizontal, gutter)
    }
  }
}
