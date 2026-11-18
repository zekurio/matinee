import MatineeCore
import MatineeKit
import SwiftUI

/*
 * PosterGrid.kt's `TvTitleGrid`: a `TitlePages` list as the kit's
 * `TVPosterGrid` of posters under a page's header, the focused poster
 * named on the line between, and its backdrop behind the page. The next
 * page loads as focus nears the end. While the first page loads, a
 * spinner; when a page fails, why, with Try again; with no titles, why
 * not, with the way out the page offers. Selecting a poster opens its
 * title, a long press its actions, and Play/Pause plays it.
 *
 * The paging itself is MatineeCore's `TitlePages` (Browse/TitlePages.swift).
 */

/// Why a grid has no titles, and the one thing to do about it, if any.
struct TVGridEmpty {
  let icon: Lucide
  let title: String
  var message: String? = nil
  var action: TVNoticeAction? = nil
}

extension FocusedValues {
  /// The card focused on a browsing page, for its header line and backdrop.
  @Entry var tvBrowseFocused: FocusedItem?
}

/// A movie or show in a grid or a row of a browsing page: its name, kind
/// where the list mixes both, year, runtime, age rating, score, and
/// overview, and its backdrop. Home's `titleInfo`, with the kind, and the
/// runtime of a show too while the list is ordered by it.
func browseTitleInfo(
  _ title: TitleSummary, api: MatineeApi?, showKind: Bool = false, sort: String? = nil
) -> FocusedItem {
  let movie = title.kind == TitleKind.movie
  let kind = showKind ? (title.isShow ? Str.tvKindShow : Str.tvKindMovie) : nil
  let runtime = movie || sort == TitleSort.runtime ? formatRuntime(title.runtimeMinutes) : nil
  return FocusedItem(
    key: "title/\(title.id)",
    info: TVItemInfo(
      name: title.name, facts: [kind, formatYear(title.year), runtime].compactMap(\.self),
      contentRating: title.contentRating, rating: title.rating.map(formatRating), overview: title.overview),
    logo: api?.art(title.images.logo, size: .medium),
    backdrop: [api?.art(title.images.backdrop, size: .large)].compactMap { $0 ?? nil })
}

/// A list of titles as a grid of posters under `header`, over the focused
/// one's backdrop. The page owns `pages` and `memory`; `sort` and
/// `showKind` say what the line names for the focused poster.
struct TVTitleGrid<Header: View>: View {
  let pages: TitlePages
  let memory: TVFocusMemory
  /// What the list is, its sort, filters, and search: another one forgets the poster the line named.
  let listKey: String
  var sort: String? = nil
  var showKind = false
  let empty: TVGridEmpty
  @ViewBuilder let header: () -> Header
  @State private var focused: FocusedItem?
  @FocusedValue(\.tvBrowseFocused) private var focusedNow
  @Environment(\.api) private var api
  @Environment(\.navigator) private var nav
  @Environment(\.tvActions) private var actions
  @Environment(\.snackbar) private var snackbar
  @Environment(ViewerState.self) private var viewer: ViewerState?
  @Environment(\.palette) private var palette

  var body: some View {
    ZStack(alignment: .topLeading) {
      TVBackdrop(focused?.backdrop.isEmpty == false ? focused?.backdrop : nil) { sources in
        Picture(sources, alignment: .topTrailing)
      }
      // One grid whatever the state, so the header stays put and keeps focus while a new sort or filter loads.
      TVPosterGrid(pages.items, itemKey: \.id, memory: memory, onNearEnd: pages.more) { title in
        poster(title)
      } header: {
        header()
      } line: {
        TVFocusLine(focused?.info)
      } footer: {
        footer
      }
    }
    .onChange(of: focusedNow) { _, item in if let item { focused = item } }
    // Another order or filter: the line named a title that may have moved or gone.
    .onChange(of: listKey) { focused = nil }
  }

  private func poster(_ title: TitleSummary) -> some View {
    let target = TVActionTarget.title(title)
    return TVPosterCard(
      title.name, watched: viewer?.isWatched(title) ?? title.watched, width: nil, action: { nav.title(title) },
      onLongPress: { actions?.open(target) },
      onPlayPause: { actions?.play(target, api: api, viewer: viewer, nav: nav, snackbar: snackbar) }
    ) {
      Picture(api?.art(title.images.poster))
    }
    .focusedValue(\.tvBrowseFocused, browseTitleInfo(title, api: api, showKind: showKind, sort: sort))
  }

  /// After the posters: why there are none, the next page coming, or why it didn't.
  @ViewBuilder private var footer: some View {
    let none = pages.items.isEmpty
    if let error = pages.error {
      GridNotice(
        headline: none ? Str.tvGridFailed : Str.tvGridMoreFailed, message: describeFailure(error),
        action: TVNoticeAction(Str.commonRetry, icon: .refreshCw, action: pages.more)
      )
      .padding(.top, none ? NOTICE_TOP : TVSpace.s4)
    } else if none, pages.done {
      GridNotice(icon: empty.icon, headline: empty.title, message: empty.message, action: empty.action)
        .padding(.top, NOTICE_TOP)
    } else if none || pages.loading {
      Spinner(size: none ? 64 : 56, tint: palette.mutedForeground)
        .frame(maxWidth: .infinity)
        .padding(.top, none ? SPINNER_TOP : TVSpace.s5)
        .padding(.bottom, TVSpace.s5)
    }
  }
}

/// Below the grid's own room for the lift, where a notice or the spinner stands in for the first row.
private let NOTICE_TOP: CGFloat = 16
private let SPINNER_TOP: CGFloat = 120

/// In the grid, across it: why it's empty or failed, with a way out where there is one.
struct GridNotice: View {
  var icon: Lucide? = nil
  let headline: String
  let message: String?
  var action: TVNoticeAction? = nil
  @Environment(\.palette) private var palette

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      if let icon {
        LucideIcon(icon, size: 72, tint: palette.mutedForeground, scales: false)
          .padding(.bottom, TVSpace.s5)
      }
      Text(headline).textStyle(.title).foregroundStyle(palette.foreground.opacity(0.9))
      if let message {
        Text(message).textStyle(.body).foregroundStyle(palette.mutedForeground)
          .frame(maxWidth: 1280, alignment: .leading)
          .padding(.top, TVSpace.s2)
      }
      if let action {
        TVButton(action.label, icon: action.icon, action: action.action)
          .padding(.top, TVSpace.s6)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .focusSection()
  }
}
