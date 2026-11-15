import MatineeCore
import MatineeKit
import SwiftUI

/*
 * State.kt's half that needs the app: the environment screens load from, the
 * words for a failure, and the modifier that ties a `Loader` to a screen.
 * The rest, `Load`, `Loader`, `Marks`, and `ViewerState`, is MatineeCore's
 * (State/), where it's tested on the Mac.
 *
 * A screen loads like this, as Android's `rememberLoader` does:
 *
 *     struct ShelfView: View {
 *       let library: Library
 *       @State private var entries = Loader<[ShelfEntry]>()
 *
 *       var body: some View {
 *         Group {
 *           switch entries.state {
 *           case .loading: LoadingBox()
 *           case .failed(let message, let disconnected):
 *             ErrorBox(Str.homeShelfFailed, message, disconnected: disconnected, onRetry: entries.reload)
 *           case .ready(let entries): …
 *           }
 *         }
 *         .loads(entries) { api in try await api.media.shelf(libraryId: library.id) }
 *       }
 *     }
 *
 * What showed stays while it fetches again: `entries.refreshing` says one
 * is out, and `refreshError` why the last one failed over an earlier answer.
 */

extension EnvironmentValues {
  /// The API while signed in; nil before. The root provides it.
  @Entry var api: MatineeApi? = nil

  /// Offline mode: what can't work without the server only shows, and a
  /// card's page and actions, which are the server's, stay shut.
  @Entry var offline = false
}

/// What went wrong reaching the server, in words for the person: the
/// server's own message when it sent one, else whether it couldn't be
/// reached, the connection broke off, or the answer made no sense to this
/// app. An error's own text is URLSession's or the decoder's, in English,
/// and names sockets, addresses, and offsets.
func describeFailure(_ failure: Failure) -> String {
  switch failure {
  case .server(let message): message
  case .unreachable: Str.errorUnreachable
  case .unreadable: Str.errorUnreadable
  case .connectionLost, .cancelled, .other: Str.errorConnectionLost
  }
}

func describeFailure(_ error: any Error) -> String { describeFailure(Failure(error)) }

private struct Loads<T: Sendable>: ViewModifier {
  let loader: Loader<T>
  let maxAge: Duration
  let fetch: @Sendable (MatineeApi) async throws -> T
  @Environment(\.api) private var api
  @Environment(ViewerState.self) private var viewer: ViewerState?
  @Environment(\.scenePhase) private var scenePhase

  func body(content: Content) -> some View {
    content
      .onAppear {
        guard let api else { return }
        if loader.configured {
          // Back on screen, from a page pushed over it or the player.
          loader.refreshIfStale(maxAge: maxAge)
        } else {
          let fetch = fetch
          loader.configure(describe: describeFailure) { try await fetch(api) }
        }
      }
      // Marks changed elsewhere that the marks can't say: fetch the truth.
      .onChange(of: viewer?.version) { if loader.configured { loader.reload() } }
      // Back from another app.
      .onChange(of: scenePhase) { _, phase in
        if phase == .active, loader.configured { loader.refreshIfStale(maxAge: maxAge) }
      }
  }
}

extension View {
  /// Loads `loader` from the server for this screen, once it shows: Android's
  /// `rememberLoader` and `RefreshOnResume` together. It fetches again when
  /// the viewer's marks change, and when the screen comes back, from a page
  /// over it or from another app, once the last answer is `maxAge` old.
  func loads<T: Sendable>(
    _ loader: Loader<T>, maxAge: Duration = REFRESH_AFTER,
    fetch: @escaping @Sendable (MatineeApi) async throws -> T
  ) -> some View {
    modifier(Loads(loader: loader, maxAge: maxAge, fetch: fetch))
  }
}
