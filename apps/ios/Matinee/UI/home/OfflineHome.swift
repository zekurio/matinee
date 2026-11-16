import MatineeCore
import MatineeKit
import SwiftUI

/*
 * OfflineHome.kt: Home in offline mode. The rows and their order are
 * MatineeCore's (`offlineHomeRows`, `HomeSnapshot`, Downloads/Offline.swift),
 * where they're tested; this draws them as Home draws its own.
 */

/// Home in offline mode: the downloads in Home's rows, each playing from
/// the phone with a tap, a show opening its downloaded episodes. Comes back
/// up to date after the player, which may have moved a place on.
struct OfflineHomeScreen: View {
  @Environment(Downloads.self) private var downloads
  @Environment(MatineeSession.self) private var session
  @Environment(ViewerState.self) private var viewer: ViewerState?
  @Environment(\.scenePhase) private var scenePhase
  @Environment(\.shellStyle) private var style
  /// Where the person got to offline, which the player keeps; observed, so a place moved on shows.
  @State private var pending: PendingProgress?
  /// Continue watching and Next up as the server last sent them.
  @State private var served = ServedRows()

  var body: some View {
    let rows = offlineHomeRows(
      Array(downloads.store.items.values), place: place, watched: watched, served: served)
    ScrollView {
        LazyVStack(alignment: .leading, spacing: style == .tablet ? Space.s10 : Space.s7) {
          AppHeader()
          if rows.isEmpty {
            EmptyState(icon: .download, title: Str.downloadsEmpty, description: Str.downloadsEmptyHint)
              .padding(.vertical, Space.s8)
          } else {
            OfflineRail(title: Str.browseContinueWatching, entries: rows.resume, place: place, watched: watched)
            OfflineRail(title: Str.browseNextUp, entries: rows.nextUp, place: place, watched: watched)
            OfflineRail(title: Str.webLibrariesDialogKindMovies, entries: rows.movies, place: place, watched: watched)
            if !rows.shows.isEmpty {
              Rail(Str.webLibrariesDialogKindShows) {
                ForEach(rows.shows, id: \.title.id) { show in
                  RailItem(.landscape) { ShowCard(show: show) }
                }
              }
            }
          }
        }
        .padding(.bottom, Space.s6)
      }
    .scrollsToTopOnReselect()
    // Its header sits below the status bar: the frost comes in as it scrolls, as on Home.
    .statusBarScrim(fadesIn: true)
    .task(id: session.activeServer) { read() }
    // The player keeps places offline; back from it, or from another app, read them again.
    .onAppear(perform: read)
    .onChange(of: scenePhase) { _, phase in if phase == .active { read() } }
  }

  private func read() {
    guard let server = session.activeServer else { return }
    served = HomeSnapshot(root: downloads.store.root, server: server).read()
    do {
      pending = try downloads.pendingFor(server)
    } catch {
      AppLog.downloads.error("Could not read the progress watched offline")
    }
  }

  private func place(_ entry: OfflineItem) -> Place? {
    if let report = pending?.report(entry.id) {
      return Place(report.positionSeconds, report.durationSeconds ?? entry.item.durationSeconds)
    }
    return entry.item.progress.map { Place($0.positionSeconds, entry.item.durationSeconds) }
  }

  /// Watched as the server last said, or played nearly to the end offline.
  private func watched(_ entry: OfflineItem) -> Bool {
    if viewer?.isWatched(entry.item) ?? (entry.item.progress?.completed ?? false) { return true }
    return pending?.report(entry.id) != nil && (place(entry)?.ratio ?? 0) >= 0.9
  }
}

/// One of offline Home's rows of files, left out when it has none.
private struct OfflineRail: View {
  let title: String
  let entries: [OfflineItem]
  let place: (OfflineItem) -> Place?
  let watched: (OfflineItem) -> Bool

  var body: some View {
    if !entries.isEmpty {
      Rail(title) {
        ForEach(entries) { entry in
          RailItem(.landscape) { FileCard(entry: entry, place: place(entry), watched: watched(entry)) }
        }
      }
      // One that moved to the front starts the row there again. By the row
      // as well, as Home's rails: two views with one id in the lazy stack show as one.
      .id("\(title)\n\(entries.first?.id ?? "")")
    }
  }
}

/// A downloaded movie or episode, its saved picture, and how far in; a tap
/// plays it from the phone. Offline there's no page to open and no actions.
private struct FileCard: View {
  let entry: OfflineItem
  let place: Place?
  let watched: Bool
  @Environment(\.navigator) private var nav

  var body: some View {
    let label = itemLabel(entry.item)
    let code = episodeCode(entry.item)
    VStack(alignment: .leading, spacing: 0) {
      Pressable(shape: .kit(Radius.md), action: { nav.play(entry.id, nil) }) {
        OfflineArt(entry: entry, toneKey: label.showName) {
          if watched {
            WatchedBadge().padding(Space.s1_5).frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
          } else if let ratio = place?.ratio, ratio > 0 {
            ArtProgressBar(progress: ratio)
          }
        }
      }
      CardText(label.showName, code.map { Str.mediaCodeTitle($0, label.title) } ?? label.year)
        .contentShape(Rectangle())
        .onTapGesture { nav.play(entry.id, nil) }
    }
    .accessibilityElement(children: .combine)
    .accessibilityHint(Str.titlePlay)
  }
}

/// A downloaded show, the newest episode's picture; a tap opens its downloaded episodes.
private struct ShowCard: View {
  let show: OfflineShow
  @Environment(\.navigator) private var nav

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      Pressable(shape: .kit(Radius.md), action: { nav.downloadsShow(show.title.id) }) {
        OfflineArt(entry: show.newest, toneKey: show.title.name) {}
      }
      CardText(show.title.name, Str.mediaEpisodeCount(show.episodes.count))
        .contentShape(Rectangle())
        .onTapGesture { nav.downloadsShow(show.title.id) }
    }
    .accessibilityElement(children: .combine)
  }
}

/// A download's saved picture, over the title's tone; a film icon when it has none.
private struct OfflineArt<Overlay: View>: View {
  let entry: OfflineItem
  let toneKey: String
  @ViewBuilder let overlay: () -> Overlay
  @Environment(Downloads.self) private var downloads
  @Environment(\.palette) private var palette

  var body: some View {
    ArtFrame(toneKey, aspect: 16 / 9) {
      LucideIcon(.film, size: 20, tint: palette.mutedForeground.opacity(0.4))
      if let image = entry.image {
        Picture(ImageSource(url: downloads.store.root.appending(path: image)))
      }
      overlay()
    }
  }
}
