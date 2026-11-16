import MatineeCore
import MatineeKit
import SwiftUI

/* The saved servers: switching between them, adding one, and removing one. ServerSwitcher.kt. */

extension SavedServer {
  /// What a saved server is called in a list: its name, when it told one, else its address without the scheme.
  var title: String { name ?? hostAndPort }

  /// The line under it: the address, when the name took its place, and who's signed in there.
  var facts: String {
    [name != nil ? hostAndPort : nil, user.map { Str.serversSignedInAs($0.name) } ?? Str.serversSignedOut]
      .compactMap { $0 }.joined(separator: " · ")
  }

  private var hostAndPort: String { address.components(separatedBy: "://").last ?? address }
}

/// Settings' row that opens the server list, for a `ListSection`.
struct ChangeServerRow: View {
  @State private var open = false

  var body: some View {
    ListRow(Str.connectChangeServer, icon: .refreshCw) { open = true }
      .matineeSheet(isPresented: $open) { ServerSwitcherSheet() }
  }
}

/// The quiet button under the sign-in and unreachable screens that opens the server list.
struct ChangeServerButton: View {
  @State private var open = false
  @Environment(\.palette) private var palette

  var body: some View {
    MatineeButton(look: .ghost) {
      open = true
    } label: {
      LucideIcon(.server, size: 16, tint: palette.mutedForeground)
      Text(Str.connectChangeServer).foregroundStyle(palette.mutedForeground)
    }
    .matineeSheet(isPresented: $open) { ServerSwitcherSheet() }
  }
}

/// The saved servers, the one in use checked, as the content of a
/// `.matineeSheet`. A tap on another switches to it, signed in still where
/// its session stands; Add server connects to a new one, which can be
/// left to come back here; the bin removes one, after asking, since that
/// signs out there and deletes its downloads.
struct ServerSwitcherSheet: View {
  @Environment(MatineeSession.self) private var session
  @Environment(\.sheetDismiss) private var dismiss
  /// The server the dialog asks about. It stays set while the dialog leaves, so its title doesn't empty.
  @State private var asking: SavedServer?
  @State private var confirming = false

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      SheetHeader(Str.serversTitle)
      ForEach(session.servers) { server in
        ServerRow(
          server: server, busy: session.removing.contains(server.origin),
          onTap: { dismiss { Task { await session.switchTo(origin: server.origin) } } },
          onRemove: {
            asking = server
            confirming = true
          })
      }
      SheetItem(Str.serversAdd, icon: .plus) { session.addServer() }
    }
    .confirmDialog(
      isPresented: $confirming, title: asking.map { Str.serversRemoveTitle($0.title) } ?? "",
      message: Str.serversRemoveBody, confirm: Str.commonRemove
    ) {
      guard let origin = asking?.origin else { return }
      Task { try? await session.removeServer(origin: origin) }
    }
  }
}

/// A saved server: what it's called and who's signed in, a tap to switch to it, and the bin.
private struct ServerRow: View {
  let server: SavedServer
  let busy: Bool
  let onTap: () -> Void
  let onRemove: () -> Void
  @Environment(\.palette) private var palette

  var body: some View {
    HStack(spacing: 0) {
      Pressable(action: onTap) {
        HStack(spacing: Space.s3) {
          LucideIcon(.server, size: 16, tint: server.active ? palette.accent : palette.mutedForeground)
            .frame(width: 36, height: 36)
            .background(server.active ? palette.accentSoft : palette.secondary, in: RoundedRectangle.kit(Radius.lg))
          VStack(alignment: .leading, spacing: 2) {
            Text(server.title)
              .textStyle(.base, weight: server.active ? .medium : .regular)
              .foregroundStyle(palette.foreground)
              .lineLimit(1)
            Text(busy ? Str.serversRemoving : server.facts)
              .textStyle(.sm)
              .foregroundStyle(palette.mutedForeground)
              .lineLimit(2)
          }
          .frame(maxWidth: .infinity, alignment: .leading)
          if server.active {
            LucideIcon(.check, label: Str.serversInUse, size: 18, tint: palette.accent)
          }
        }
        .padding(.leading, 20)
        .padding(.trailing, Space.s2)
        .padding(.vertical, Space.s2_5)
        .frame(minHeight: 56)
        .contentShape(Rectangle())
      }
      .disabled(busy)
      .accessibilityAddTraits(server.active ? .isSelected : [])
      ZStack {
        if busy {
          Spinner(size: 18, tint: palette.mutedForeground)
        } else {
          RoundIconButton(
            .trash, label: Str.serversRemove(server.title), look: .ghost, size: 36, iconSize: 18,
            tint: palette.mutedForeground, action: onRemove)
        }
      }
      .frame(width: TouchTarget, height: TouchTarget)
      .padding(.trailing, Space.s3)
    }
  }
}

/// Under the connect and sign-in screens while adding a server: back to the one in use, as it was.
struct BackToServer: View {
  @Environment(MatineeSession.self) private var session
  @Environment(\.palette) private var palette

  var body: some View {
    if let current = session.servers.first(where: \.active) {
      MatineeButton(look: .ghost) {
        Task { await session.cancelAdd() }
      } label: {
        LucideIcon(.arrowLeft, size: 16, tint: palette.mutedForeground)
        Text(Str.serversBackTo(current.title)).foregroundStyle(palette.mutedForeground)
      }
    }
  }
}
