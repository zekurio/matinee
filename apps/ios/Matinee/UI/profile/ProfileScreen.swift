import MatineeCore
import SwiftUI

/*
 * ProfileScreen.kt: the profile tab, behind the person's picture in the
 * tab bar. Android passes the session; here the account is `\.user`. The
 * page has no navigation bar of its own, as Android's has no top bar: its
 * header carries Settings, and the pages it opens get the bar back.
 */

/// The gap between the page's sections.
private let SectionGap: CGFloat = 32

/// The gap between the statistics' cards.
private let CardGap: CGFloat = 28

/// The profile tab, as the web's profile page: who's signed in, their
/// favorites, their statistics, and what they watched last, with the way
/// on to Settings, where signing out is. What the server sent last is kept,
/// as Home keeps its rows: while the server can't be reached it stays up
/// with the disconnect icon in the header, and offline mode shows it,
/// though nothing in it opens.
struct ProfileScreen: View {
  @Environment(\.user) private var user

  var body: some View {
    if let user {
      ProfilePage(username: user.username).id(user.username)
    }
  }
}

private struct ProfilePage: View {
  let username: String
  @State private var profile: Loader<Profile>
  @State private var stats: ProfileStats
  @Environment(\.navigator) private var nav
  @Environment(\.offline) private var offline
  @Environment(\.palette) private var palette

  init(username: String) {
    self.username = username
    _profile = State(initialValue: Loader(kept: ProfileSnapshot(username: username).profile))
    _stats = State(initialValue: ProfileStats(username: username))
  }

  var body: some View {
    let username = username
    // Offline mode leaves the server alone: only what it sent before.
    let state: Load<Profile>? = offline ? stats.savedProfile().map { .ready($0) } : profile.state
    ScrollView {
      LazyVStack(alignment: .leading, spacing: 0) {
        ProfileHeader(profile: state?.value) {
          // Showing what loaded before while the server can't be reached: the icon, up top.
          DisconnectedAction(profile, stats.current)
        }
        switch state {
        case nil: EmptyView()
        case .failed(let message, let disconnected):
          Group {
            if disconnected {
              Disconnected(onRetry: profile.reload).frame(maxWidth: .infinity)
            } else {
              Notice(Str.profileLoadFailed, message, retrying: profile.refreshing, onRetry: profile.reload)
            }
          }
          .padding(.top, SectionGap)
        case .ready(let value):
          Favorites(profile: value).padding(.top, SectionGap)
          Statistics(model: stats)
          if let recent = value.recent, !recent.isEmpty {
            Rail(Str.profileRecent, onTitleTap: offline ? nil : nav.recent) {
              ForEach(recent, id: \.item.id) { entry in RailItem(.landscape) { EpisodeCard(entry.item) } }
            }
            .padding(.top, SectionGap)
          }
        case .loading:
          ProgressView().tint(palette.accent).frame(maxWidth: .infinity).padding(24)
            .accessibilityLabel(Str.loadingInProgress)
        }
      }
      .padding(.bottom, 24)
    }
    .scrollsToTopOnReselect()
    .statusBarScrim()
    .background(palette.background)
    .toolbar(.hidden, for: .navigationBar)
    .background {
      if !offline {
        // The figures' loader for the range picked: a view of its own, so a new range fetches when it's picked.
        StatsLoad(loader: stats.current, username: username, range: stats.range).id(stats.range)
      }
    }
    .modifier(LoadsUnlessOffline(loader: profile, offline: offline, username: username))
  }
}

/// Loads the profile from the server, except in offline mode.
private struct LoadsUnlessOffline: ViewModifier {
  let loader: Loader<Profile>
  let offline: Bool
  let username: String

  func body(content: Content) -> some View {
    if offline {
      content
    } else {
      let username = username
      content.loads(loader) { api in try await api.profiles.get(username: username) }
    }
  }
}

/// Nothing to see: what fetches the shown range's statistics.
private struct StatsLoad: View {
  let loader: Loader<WatchStats?>
  let username: String
  let range: String

  var body: some View {
    let username = username
    let range = range
    Color.clear
      .loads(loader) { api in try await ProfileStats.fetch(api, username: username, range: range) }
  }
}

/// The picture and name, the username under a display name, and since when
/// they're here, with Settings in the corner as on most profiles. `action`
/// goes before Settings; offline, the offline icon, as on Home.
private struct ProfileHeader<Action: View>: View {
  let profile: Profile?
  @ViewBuilder let action: () -> Action
  @Environment(\.api) private var api
  @Environment(\.navigator) private var nav
  @Environment(\.offline) private var offline
  @Environment(\.palette) private var palette
  @Environment(\.user) private var user

  var body: some View {
    if let user {
      let joined = profile.flatMap(joinedMonth)
      let facts = [user.displayName.map { _ in "@\(user.username)" }, joined.map(Str.profileJoined)]
        .compactMap(\.self).joined(separator: " · ")
      // One row, as a profile's header on a phone: the picture, who it is,
      // and Settings at its end, a button of the same weight as the avatar.
      HStack(spacing: 0) {
        Avatar(user.name, url: user.avatarId.flatMap { api?.paths.avatar($0) }, size: 64)
        VStack(alignment: .leading, spacing: 0) {
          HStack(spacing: 8) {
            Text(user.name).textStyle(.titleLarge).foregroundStyle(palette.foreground).lineLimit(1)
              .accessibilityAddTraits(.isHeader)
            if user.isAdmin { Badge(Str.profileAdmin, outlined: true) }
          }
          if !facts.isEmpty {
            Text(facts).textStyle(.bodyMedium).foregroundStyle(palette.muted).lineLimit(1)
          }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.leading, 16)
        .accessibilityElement(children: .combine)
        Spacer().frame(width: 12)
        if offline {
          LucideIcon(.cloudOff, label: Str.downloadsOffline, size: 20, tint: palette.muted)
          Spacer().frame(width: 12)
        } else {
          action()
        }
        RoundIconButton(.settings, label: Str.shellSettings, iconSize: 20, action: nav.settings)
      }
      .padding(.horizontal, Gutter)
      .padding(.top, 16)
    }
  }
}

/// Favorite titles as posters, then favorite episodes; each heading opens
/// the whole list. With none yet, how to make one.
private struct Favorites: View {
  let profile: Profile
  @Environment(\.navigator) private var nav
  @Environment(\.offline) private var offline
  @Environment(\.palette) private var palette

  var body: some View {
    // Offline the whole lists are the server's to send.
    let openAll = offline ? nil : nav.favorites
    let titles = profile.favorites ?? []
    let items = profile.favoriteItems ?? []
    if titles.isEmpty && items.isEmpty {
      VStack(alignment: .leading, spacing: 8) {
        SectionTitle(Str.favoritesTitle)
        Text(Str.profileNoFavoritesHint).textStyle(.bodyMedium).foregroundStyle(palette.muted)
      }
      .padding(.horizontal, Gutter)
    } else {
      VStack(alignment: .leading, spacing: 32) {
        if !titles.isEmpty {
          Rail(Str.favoritesTitle, onTitleTap: openAll) {
            ForEach(titles, id: \.id) { title in
              RailItem(.poster) { PosterCard(title, detail: formatYear(title.year)) }
            }
          }
        }
        if !items.isEmpty {
          Rail(Str.profileFavoriteEpisodes, onTitleTap: openAll) {
            ForEach(items, id: \.id) { item in RailItem(.landscape) { EpisodeCard(item) } }
          }
        }
      }
    }
  }
}

/// The statistics' heading and range, then the cards, a column on a phone
/// and two side by side where the window has room, as a tablet's.
private struct Statistics: View {
  let model: ProfileStats
  @Environment(\.offline) private var offline
  @Environment(\.palette) private var palette
  @Environment(\.windowSize) private var window

  var body: some View {
    let stats = model.figures(offline: offline)
    let state = model.state(offline: offline)
    let never = model.neverWatched(offline: offline)
    VStack(alignment: .leading, spacing: 16) {
      SectionTitle(Str.profileStatistics).padding(.horizontal, Gutter)
      if !never { RangeChips(current: model.range) { range in withMotion(Motion.color) { model.pick(range) } } }
    }
    .padding(.top, SectionGap)
    content(state: state, stats: stats, never: never)
      .frame(maxWidth: .infinity, alignment: .leading)
      .padding(.horizontal, Gutter)
      .padding(.top, 16)
  }

  @ViewBuilder private func content(state: Load<WatchStats?>, stats: WatchStats?, never: Bool) -> some View {
    if case .failed(let message, let disconnected) = state, stats == nil {
      failed(message, disconnected: disconnected)
    } else if let stats {
      if never {
        VStack(alignment: .leading, spacing: 4) {
          Text(Str.profileSelfEmpty).textStyle(.bodyLarge).foregroundStyle(palette.foreground)
          Text(Str.profileSelfEmptyHint).textStyle(.bodyMedium).foregroundStyle(palette.muted)
        }
        .accessibilityElement(children: .combine)
      } else if stats.totals.plays == 0 {
        nothingWatched
      } else {
        cards(stats)
      }
    } else {
      ProgressView().tint(palette.accent).frame(maxWidth: .infinity).padding(16)
        .accessibilityLabel(Str.loadingInProgress)
    }
  }

  @ViewBuilder private func failed(_ message: String, disconnected: Bool) -> some View {
    let loader = model.current
    if disconnected {
      // Offline there's no server to ask again.
      Disconnected(onRetry: offline ? nil : { loader.reload() }).frame(maxWidth: .infinity)
    } else {
      // A notice keeps the gutter itself.
      Notice(message, retrying: loader.refreshing, onRetry: { loader.reload() })
        .padding(.horizontal, -Gutter)
    }
  }

  /// Nothing in the range picked: how to see everything instead.
  private var nothingWatched: some View {
    VStack(alignment: .leading, spacing: 12) {
      Text(Str.profileNothingWatched(rangePhrase(model.range))).textStyle(.bodyLarge)
        .foregroundStyle(palette.foreground)
      MatineeButton(.outline, action: { model.pick(StatsRange.all) }) { Text(Str.profileShowAllTime) }
    }
  }

  /// Where the leaderboard goes: it's a board of everyone's, which isn't saved, so it's left out offline.
  @ViewBuilder private func standing(gap: CGFloat) -> some View {
    if !offline { Standing(range: model.range, gap: gap).id(model.range) }
  }

  @ViewBuilder private func cards(_ stats: WatchStats) -> some View {
    if isWide(window) && window.width >= 700 {
      HStack(alignment: .top, spacing: 16) {
        VStack(spacing: 0) {
          WatchTimeCard(stats: stats)
          TopTitles(stats: stats).padding(.top, stats.titles.isEmpty ? 0 : CardGap)
          Genres(stats: stats).padding(.top, stats.genres.isEmpty ? 0 : CardGap)
        }
        VStack(spacing: 0) {
          StatList(stats: stats)
          Activity(stats: stats).padding(.top, stats.activity.isEmpty ? 0 : CardGap)
          standing(gap: CardGap)
        }
      }
    } else {
      VStack(spacing: 0) {
        WatchTimeCard(stats: stats)
        StatList(stats: stats).padding(.top, CardGap)
        TopTitles(stats: stats).padding(.top, stats.titles.isEmpty ? 0 : CardGap)
        Genres(stats: stats).padding(.top, stats.genres.isEmpty ? 0 : CardGap)
        standing(gap: CardGap)
        Activity(stats: stats).padding(.top, stats.activity.isEmpty ? 0 : CardGap)
      }
    }
  }
}
