import MatineeCore
import MatineeKit
import SwiftUI

/*
 * TvServers.kt: the saved servers in the right-edge panel, the one in use
 * checked and focused. Select on another switches to it, signed in still
 * where its session stands. Add server goes to finding or typing one,
 * which Menu leaves again. Remove a server turns the panel to picking one,
 * then to asking, focused on Cancel; Menu goes a step back, then closes.
 */

extension View {
  /// The saved servers' panel, while `isPresented`.
  func tvServerPanel(isPresented: Binding<Bool>) -> some View {
    modifier(TVServerPanel(isPresented: isPresented))
  }
}

/// Where the server panel is: the list, picking one to remove, or asking about it.
private enum ServerStep: Hashable {
  case list
  case remove
  case confirm(origin: String)
}

private struct TVServerPanel: ViewModifier {
  @Binding var isPresented: Bool
  @Environment(MatineeSession.self) private var session
  @State private var step = ServerStep.list

  func body(content: Content) -> some View {
    let asked: SavedServer? =
      if case .confirm(let origin) = step { session.servers.first { $0.origin == origin } } else { nil }
    content
      .tvSidePanel(
        isPresented: $isPresented,
        title: asked.map { Str.serversRemoveTitle($0.panelTitle) }
          ?? (step == .remove ? Str.tvServersRemove : Str.serversTitle),
        description: asked != nil ? Str.serversRemoveBodyTv : step == .remove ? Str.tvServersRemoveDescription : nil
      ) {
        ServerRows(step: $step, asked: asked, close: { isPresented = false })
      }
      // Each time it opens, it starts at the list.
      .onChange(of: isPresented) { _, open in if open { step = .list } }
  }
}

private struct ServerRows: View {
  @Binding var step: ServerStep
  let asked: SavedServer?
  let close: () -> Void
  @Environment(MatineeSession.self) private var session
  @Environment(\.snackbar) private var snackbar
  @FocusState private var focused: String?

  var body: some View {
    Group {
      switch step {
      case .list: list
      case .remove: removeList
      case .confirm: confirm
      }
    }
    .defaultFocus($focused, first)
    .onChange(of: step) { focused = first }
    // Menu goes a step back; from the list, the panel closes itself.
    .onTVBack(isActive: step != .list) {
      switch step {
      case .confirm: step = .remove
      default: step = .list
      }
    }
  }

  /// Where focus starts in each step: the server in use, the first to remove, or Cancel.
  private var first: String? {
    switch step {
    case .list: session.servers.first(where: \.active)?.origin ?? "add"
    case .remove: session.servers.first?.origin
    case .confirm: "cancel"
    }
  }

  @ViewBuilder private var list: some View {
    ForEach(session.servers) { server in
      let busy = session.removing.contains(server.origin)
      TVListItem(
        server.panelTitle, subtitle: busy ? Str.serversRemoving : server.panelFacts, icon: .server, quiet: true,
        checked: server.active,
        // One on its way out stays focusable, so focus doesn't jump, but does nothing.
        action: {
          guard !busy else { return }
          close()
          Task { await session.switchTo(origin: server.origin) }
        }
      )
      .focused($focused, equals: server.origin)
    }
    TVListItem(Str.serversAdd, icon: .plus, quiet: true) {
      close()
      session.addServer()
    }
    .focused($focused, equals: "add")
    if !session.servers.isEmpty {
      TVListItem(Str.tvServersRemove, icon: .trash, quiet: true, destructive: true) { step = .remove }
        .focused($focused, equals: "remove")
    }
  }

  @ViewBuilder private var removeList: some View {
    ForEach(session.servers) { server in
      let busy = session.removing.contains(server.origin)
      TVListItem(
        server.panelTitle, subtitle: busy ? Str.serversRemoving : server.panelFacts, icon: .server, quiet: true
      ) {
        if !busy { step = .confirm(origin: server.origin) }
      }
      .focused($focused, equals: server.origin)
    }
  }

  @ViewBuilder private var confirm: some View {
    TVListItem(Str.commonRemove, icon: .trash, quiet: true, destructive: true) {
      if let asked {
        let origin = asked.origin
        let name = asked.panelTitle
        launchShowing(snackbar, Str.iosServersRemoveFailed(name)) { try await session.removeServer(origin: origin) }
      }
      // Back to the list, where it shows as being removed until it's gone.
      step = .list
    }
    .focused($focused, equals: "confirm")
    TVListItem(Str.commonCancel, icon: .x, quiet: true) { step = .remove }
      .focused($focused, equals: "cancel")
  }
}
