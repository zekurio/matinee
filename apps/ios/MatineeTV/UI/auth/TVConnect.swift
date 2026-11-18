import MatineeCore
import MatineeKit
import SwiftUI

/*
 * TvConnect.kt: picking a server on a TV, as Wholphin does it. The servers
 * found on the local network come first, searched for while the screen
 * shows, each a large row with its name and address; the server last used
 * comes next, then typing an address with the TV's keyboard. Every server
 * calls itself Matinee unless its admin renamed it, so the address is what
 * tells them apart.
 *
 * Discovery is MatineeCore's (Auth/ServerDiscovery.swift). tvOS lets an app
 * broadcast without asking, but a scan that can't send at all, as with no
 * network interface up, says so, and then the screen offers typing alone.
 */
struct TVConnectScreen: View {
  var canCancel = false
  @Environment(MatineeSession.self) private var session
  @State private var typing = false
  @State private var connector = ServerConnect()

  var body: some View {
    Group {
      if typing {
        TVAddressEntry(connector: connector) { back() }
          // Menu goes back to the list.
          .onTVBack { back() }
      } else {
        TVServerList(connector: connector, canCancel: canCancel) {
          connector.clearError()
          typing = true
        }
        // Adding a server: Menu returns to the one in use, as it was.
        .onTVBack(isActive: canCancel) { Task { await session.cancelAdd() } }
      }
    }
    .transition(.opacity)
    .animation(Motion.enter, value: typing)
  }

  private func back() {
    connector.clearError()
    typing = false
  }
}

/// How many scans a search runs, one after the other, before it says what it found.
private let SCANS = 3

private struct TVServerList: View {
  let connector: ServerConnect
  let canCancel: Bool
  let onType: () -> Void
  @Environment(MatineeSession.self) private var session
  @State private var found: [DiscoveredServer] = []
  @State private var search = 0
  @State private var searching = true
  /// Nothing could be sent this search: discovery isn't possible here.
  @State private var unavailable = false
  /// The address being tried, for its spinner and its error.
  @State private var trying: String?
  @FocusState private var focused: String?

  var body: some View {
    let last = session.lastServer.flatMap { url in found.contains { sameServer($0.url, url) } ? nil : url }
    TVAuthFrame(
      Str.tvConnectTitle,
      // Without discovery, the description says only what's left: typing the address.
      description: unavailable ? Str.connectDescription : Str.tvConnectDescription
    ) {
      TVCenteredScroll {
        VStack(alignment: .leading, spacing: TVListItems.gap) {
          if !unavailable { foundRows }
          if let last {
            TVListHeading(Str.tvConnectLast)
            serverRow(title: last.components(separatedBy: "://").last ?? last, url: nil, icon: .rotateCcw, address: last)
              .focused($focused, equals: Row.last)
            note(for: last)
          }
          TVListHeading(Str.tvConnectOther)
          TVListItem(Str.tvConnectEnter, icon: .link, action: onType)
            .focused($focused, equals: Row.type)
          if unavailable { searchAgain }
          if canCancel, let current = session.servers.first(where: \.active) {
            TVListItem(Str.serversBackTo(current.title), icon: .arrowLeft, quiet: true) {
              Task { await session.cancelAdd() }
            }
            .padding(.top, TVSpace.s2)
          }
        }
        .padding(.vertical, TVFocus.room)
      }
    }
    // The first server to show takes focus as it comes; before that, the last one used or typing.
    .defaultFocus($focused, last != nil ? Row.last : Row.type)
    .onChange(of: found.first?.url) { _, first in
      if let first, focused == nil || focused == Row.last || focused == Row.type { focused = first }
    }
    .task(id: search) { await scan() }
  }

  private enum Row {
    static let last = "row:last"
    static let type = "row:type"
    static let again = "row:again"
  }

  @ViewBuilder private var foundRows: some View {
    TVListHeading(Str.tvConnectFound)
    ForEach(found, id: \.url) { server in
      serverRow(title: server.name, url: server.url, icon: .server, address: server.url, serverName: server.name)
        .focused($focused, equals: server.url)
      note(for: server.url)
    }
    if found.isEmpty, !searching { TVAuthNote(Str.tvConnectNone).padding(.bottom, TVSpace.s1) }
    // Always there, so focus stays on it while it searches again.
    searchAgain
  }

  private var searchAgain: some View {
    TVListItem(
      searching ? Str.tvConnectSearching : Str.tvConnectSearchAgain, icon: .refreshCw, quiet: unavailable,
      action: { if !searching { search += 1 } }
    ) {
      if searching { Spinner(size: 44) }
    }
    .focused($focused, equals: Row.again)
  }

  /// A server to connect to, its name over its address, or only its address, with a spinner while it's tried.
  private func serverRow(title: String, url: String?, icon: Lucide, address: String, serverName: String? = nil)
    -> some View
  {
    TVListItem(title, subtitle: url, icon: icon, action: { connect(address, name: serverName) }) {
      if connector.busy, trying == address { Spinner(size: 44) }
    }
  }

  /// What went wrong, under the row it went wrong for.
  @ViewBuilder private func note(for address: String) -> some View {
    if !connector.busy, trying == address, let error = connector.error {
      TVAuthNote(error, danger: true)
    }
  }

  /// A row stays enabled while another is tried, so focus stays on it; a second try waits.
  private func connect(_ address: String, name: String?) {
    guard !connector.busy else { return }
    trying = address
    Task { await connector.connect(session, address, name: name) }
  }

  private func scan() async {
    searching = true
    unavailable = false
    // A new search shows what answers now, not what answered before.
    found = []
    defer { searching = false }
    for _ in 0..<SCANS {
      for await event in scanForServers() {
        switch event {
        case .found(let server):
          if !found.contains(where: { sameServer($0.url, server.url) }) { found.append(server) }
        case .unavailable:
          unavailable = true
        }
      }
      if unavailable || Task.isCancelled { return }
    }
  }
}

/// Two addresses of one server, as the app shows them and as a server sends them.
private func sameServer(_ a: String, _ b: String) -> Bool {
  func plain(_ text: String) -> String { text.trimmingCharacters(in: CharacterSet(charactersIn: "/")).lowercased() }
  return plain(a) == plain(b)
}

/// Typing the address, as the iPhone's connect screen takes it, with its checks and messages.
private struct TVAddressEntry: View {
  let connector: ServerConnect
  let onBack: () -> Void
  @Environment(MatineeSession.self) private var session
  @State private var address = ""
  @FocusState private var fieldFocused: Bool

  var body: some View {
    TVAuthFrame(Str.tvConnectEnter, description: Str.connectDescription) {
      VStack(alignment: .leading, spacing: TVSpace.s2) {
        TVTextField(
          text: $address, placeholder: Str.connectPlaceholder, icon: .server, kind: .url,
          isError: connector.error != nil, focus: $fieldFocused, onSubmit: connect)
        if let error = connector.error { TVAuthNote(error, danger: true).padding(.bottom, TVSpace.s1) }
        TVListItem(Str.connectButton, icon: .logIn, action: connect) {
          if connector.busy { Spinner(size: 44) }
        }
        TVListItem(Str.tvConnectBackToList, icon: .arrowLeft, quiet: true, action: onBack)
      }
      .padding(.vertical, TVFocus.room)
    }
    .defaultFocus($fieldFocused, true)
    // Typing again puts away what the last try said.
    .onChange(of: address) { if connector.error != nil, !connector.busy { connector.clearError() } }
  }

  private func connect() {
    guard !address.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
    Task { await connector.connect(session, address) }
  }
}
