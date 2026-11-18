import MatineeCore
import MatineeKit
import SwiftUI

/*
 * TvProfile.kt: the signed-in person on a TV, from the drawer's top entry.
 * Who they are, with the way on to Settings, their favorites as posters,
 * what they watched last as stills with the way into the whole list, then
 * their statistics for a range: watch time as bars, the totals, their most
 * watched titles, their genres, where they stand on the leaderboard, and
 * when in the week they watch (TVProfileStats.swift, TVStanding.swift).
 *
 * The loads are the iPhone's (Matinee/UI/profile/ProfileData.swift), so
 * the profile and its figures come from the snapshot at once. A row that
 * takes focus scrolls up under the clock, as Home's and a title page's
 * rows do; while the favorites have it, the header stays in view.
 *
 * Android TV's profile puts Sign out under the name; here Settings is
 * there, as on the iPhone, and signing out asks first, in Settings.
 */

/// Focus memory keys of the profile's rows. A chart's include the range,
/// so each range's chart remembers its own bar.
enum ProfileRow {
  static let actions = "actions"
  static let favorites = "favorites"
  static let recent = "recent"
  static let ranges = "ranges"
  /// Nothing in the range picked: it rests where the ranges do.
  static let nothing = "nothing"
  static let top = "top"
  static let genres = "genres"
  static let standing = "standing"
  static let seeAll = "seeAll"
  static let settings = "settings"
  static func watchTime(_ range: String) -> String { "watchTime-\(range)" }
  static func viewingTimes(_ range: String) -> String { "viewingTimes-\(range)" }
}

struct TVProfileScreen: View {
  @Environment(\.user) private var user

  var body: some View {
    if let user {
      TVProfilePage(user: user).id(user.username)
    }
  }
}

private struct TVProfilePage: View {
  let user: User
  @State private var loads: ProfileLoads
  @State private var memory = TVFocusMemory()
  @Environment(\.palette) private var palette
  @Environment(\.tvPageOnTop) private var onTop
  @Environment(ViewerState.self) private var viewer: ViewerState?

  init(user: User) {
    self.user = user
    _loads = State(initialValue: ProfileLoads(username: user.username))
  }

  var body: some View {
    let profile = loads.profile.state
    DetailScroll(
      memory: memory, headerRows: [ProfileRow.actions, ProfileRow.favorites], bottomRoom: 720,
      restsAs: [ProfileRow.nothing: ProfileRow.ranges], followsItems: true
    ) {
      Color.clear.frame(height: 0)
    } rows: {
      ProfileHeader(user: user, profile: profile.value, memory: memory)
      switch profile {
      case .loading:
        TVLoadingRow()
      case .failed(let message, _):
        TVRowNotice(
          nil, headline: Str.profileLoadFailed, message: message,
          action: TVNoticeAction(Str.commonRetry, icon: .refreshCw, action: loads.profile.reload))
      case .ready(let value):
        FavoritesRow(favorites: shownFavorites(value, viewer: viewer), memory: memory)
        if let recent = value.recent, !recent.isEmpty {
          RecentRow(entries: recent, memory: memory)
        }
        ProfileStatistics(loads: loads, memory: memory)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .background(palette.background)
    .ignoresSafeArea()
    .loadsProfile(loads)
    // The first favorite, else the first thing watched, once the profile
    // says whether there is one; with neither, Settings.
    .tvPageFocus(memory) { firstFocus }
    .onChange(of: firstFocus?.item) { _, first in
      if first != nil, onTop, memory.lastRow == nil { memory.restore(fallback: firstFocus) }
    }
  }

  private var firstFocus: (row: String, item: String)? {
    switch loads.profile.state {
    case .loading: return nil
    case .failed: return (ProfileRow.actions, ProfileRow.settings)
    case .ready(let profile):
      if let first = shownFavorites(profile, viewer: viewer).first { return (ProfileRow.favorites, first.key) }
      if let first = profile.recent?.first { return (ProfileRow.recent, first.item.id) }
      return (ProfileRow.actions, ProfileRow.settings)
    }
  }
}

// MARK: Who

/// The picture, the name, and under it the username, when they joined,
/// and whether they're an admin, with Settings under those.
private struct ProfileHeader: View {
  let user: User
  let profile: Profile?
  let memory: TVFocusMemory
  @FocusState private var focused: String?
  @Environment(\.navigator) private var nav
  @Environment(\.palette) private var palette

  var body: some View {
    HStack(alignment: .center, spacing: TVSpace.s8) {
      TVAvatar(user: user, size: 200)
        .shadow(color: .black.opacity(0.25), radius: 16, y: 8)
        .accessibilityHidden(true)
      VStack(alignment: .leading, spacing: 0) {
        Text(user.name).textStyle(.display).lineLimit(1).minimumScaleFactor(0.8)
          .accessibilityAddTraits(.isHeader)
        if !facts.isEmpty {
          Text(facts.joined(separator: "  ·  ")).textStyle(.facts).foregroundStyle(palette.mutedForeground)
            .lineLimit(1)
            .padding(.top, 4)
        }
        HStack(spacing: TVButtons.gap) {
          TVButton(Str.shellSettings, icon: .settings) { nav.settings() }
            .focused($focused, equals: ProfileRow.settings)
        }
        .padding(.top, TVSpace.s6)
      }
    }
    // The whole header is the row, so Up from the first favorite, under the avatar rather than
    // the button, finds Settings.
    .frame(maxWidth: .infinity, alignment: .leading)
    .tvFocusRow(ProfileRow.actions, memory: memory, focused: $focused, first: ProfileRow.settings)
    .padding(.leading, TVPage.start)
    // Clear of the clock at the top right.
    .padding(.trailing, 440)
    .padding(.top, DETAIL_HEADER_TOP)
  }

  private var facts: [String] {
    [
      user.displayName != nil ? "@\(user.username)" : nil,
      profile.flatMap(joinedMonth).map(Str.profileJoined),
      user.isAdmin ? Str.profileAdmin : nil,
    ].compactMap(\.self)
  }
}

// MARK: Favorites

/// A card in a row that ends with the way into the whole list.
private enum RowCard<Entry> {
  case entry(Entry)
  case seeAll

  func key(_ entryKey: (Entry) -> String) -> String {
    switch self {
    case .entry(let entry): entryKey(entry)
    case .seeAll: ProfileRow.seeAll
    }
  }
}

/// Favorites of every kind as posters, newest first, as the server sends
/// them less the hearts taken off here since, then See all, which opens
/// the whole lists. With none yet, how to make one.
private struct FavoritesRow: View {
  let favorites: [Favorite]
  let memory: TVFocusMemory
  @Environment(\.api) private var api
  @Environment(\.navigator) private var nav
  @Environment(\.tvActions) private var actions
  @Environment(\.snackbar) private var snackbar
  @Environment(ViewerState.self) private var viewer: ViewerState?

  var body: some View {
    if favorites.isEmpty {
      TVRowNotice(Str.favoritesTitle, headline: Str.favoritesEmpty, message: Str.tvFavoritesEmptyHint)
        .id(ProfileRow.favorites)
    } else {
      let cards = favorites.map(RowCard.entry) + [.seeAll]
      TVRow(
        Str.favoritesTitle, key: ProfileRow.favorites, items: cards, itemKey: { $0.key(\.key) }, memory: memory
      ) { card in
        switch card {
        case .entry(let favorite): self.card(favorite)
        case .seeAll:
          SeeAllCard(aspect: 2 / 3, width: TVCards.posterWidth, icon: .heart) { nav.favorites() }
        }
      }
    }
  }

  @ViewBuilder private func card(_ favorite: Favorite) -> some View {
    switch favorite {
    case .movie(let entry): title(entry.title)
    case .show(let entry): title(entry.title)
    case .showSeason(let entry):
      let season = entry.season
      TVCaptionedPoster(
        entry.title.name, detail: seasonName(season.number),
        watched: season.itemCount > 0 && season.watchedCount >= season.itemCount,
        action: { nav.season(entry.title.id, season.number) },
        onLongPress: { actions?.open(.season(entry.title, season)) }
      ) {
        Picture(api?.art(season.poster ?? entry.title.images.poster, size: .medium))
      }
    case .episode(let entry):
      let item = entry.item
      let label = itemLabel(item)
      TVCaptionedPoster(
        label.showName, detail: episodeCode(item).map { Str.mediaCodeTitle($0, label.title) } ?? label.title,
        watched: viewer?.isWatched(item) ?? false, action: { nav.item(item) },
        onLongPress: { actions?.open(.item(item)) }, onPlayPause: { nav.play(item.id, nil) }
      ) {
        Picture(api?.art(item.title?.images.poster, size: .medium))
      }
    }
  }

  private func title(_ title: TitleSummary) -> some View {
    let target = TVActionTarget.title(title)
    return TVCaptionedPoster(
      title.name, detail: formatYear(title.year), watched: viewer?.isWatched(title) ?? title.watched,
      action: { nav.title(title) }, onLongPress: { actions?.open(target) },
      onPlayPause: { actions?.play(target, api: api, viewer: viewer, nav: nav, snackbar: snackbar) }
    ) {
      Picture(api?.art(title.images.poster, size: .medium))
    }
  }
}

// MARK: Recently watched

/// What they watched last, a file per title, as stills, then See all,
/// which opens the whole list (TVRecent.swift).
private struct RecentRow: View {
  let entries: [WatchedEntry]
  let memory: TVFocusMemory
  @Environment(\.navigator) private var nav

  var body: some View {
    let cards = entries.map(RowCard.entry) + [.seeAll]
    TVRow(Str.profileRecent, key: ProfileRow.recent, items: cards, itemKey: { $0.key { $0.item.id } }, memory: memory) {
      card in
      switch card {
      case .entry(let entry): TVWatchedCard(item: entry.item)
      case .seeAll:
        SeeAllCard(aspect: 16 / 9, width: TVCards.landscapeWidth, icon: .clock) { nav.recent() }
      }
    }
    .detailRow(ProfileRow.recent)
  }
}

/// A file watched, as Android's `WatchedCard`: its still, the show or
/// movie, and the episode or the year under it, opening the file's page.
struct TVWatchedCard: View {
  let item: MediaItem
  var width: CGFloat? = TVCards.landscapeWidth
  @Environment(\.api) private var api
  @Environment(\.navigator) private var nav
  @Environment(\.tvActions) private var actions
  @Environment(ViewerState.self) private var viewer: ViewerState?

  var body: some View {
    let label = itemLabel(item)
    let detail = episodeCode(item).map { Str.mediaCodeTitle($0, label.title) } ?? label.year
    TVLandscapeCard(
      label.showName, detail: detail, progress: progressRatio(item), watched: viewer?.isWatched(item) ?? false,
      width: width, action: { nav.item(item) }, onLongPress: { actions?.open(.item(item)) },
      onPlayPause: { nav.play(item.id, nil) }
    ) {
      Picture(api?.landscape(item) ?? [])
    }
  }
}

/// The last card of a row, which opens the whole list: an icon and See
/// all on a quiet surface, the shape of the row's cards.
private struct SeeAllCard: View {
  let aspect: CGFloat
  let width: CGFloat
  let icon: Lucide
  let action: () -> Void
  @Environment(\.palette) private var palette

  var body: some View {
    TVArtCard(toneKey: ProfileRow.seeAll, aspect: aspect, label: Str.tvProfileSeeAll, action: action) {
      ZStack {
        palette.secondary
        VStack(spacing: TVSpace.s3) {
          LucideIcon(icon, size: 56, tint: palette.foreground, scales: false)
          Text(Str.tvProfileSeeAll).textStyle(.label).foregroundStyle(palette.foreground).lineLimit(1)
        }
      }
    }
    .frame(width: width)
  }
}
