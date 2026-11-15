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

/// Settings' row that opens the server list.
struct ChangeServerRow: View {
  @State private var open = false

  var body: some View {
    LinkRow(Str.connectChangeServer, icon: .refreshCw) { open = true }
      .sheet(isPresented: $open) { ServerSwitcherSheet() }
  }
}

/// The quiet button under the sign-in and unreachable screens that opens the server list.
struct ChangeServerButton: View {
  @State private var open = false
  @Environment(\.palette) private var palette

  var body: some View {
    Button { open = true } label: { Text(Str.connectChangeServer).foregroundStyle(palette.mutedForeground) }
      .buttonStyle(.legacy(.ghost))
      .sheet(isPresented: $open) { ServerSwitcherSheet() }
  }
}

/// The saved servers in a sheet, the one in use checked. A tap on another
/// switches to it, signed in still where its session stands; Add server
/// connects to a new one, which can be left to come back here; the bin
/// removes one, after asking.
struct ServerSwitcherSheet: View {
  @Environment(MatineeSession.self) private var session
  @Environment(\.dismiss) private var dismiss
  @Environment(\.palette) private var palette
  @State private var asking: SavedServer?

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 0) {
        LegacySheetHeader(Str.serversTitle)
        ForEach(session.servers) { server in
          ServerRow(
            server: server, busy: session.removing.contains(server.origin),
            onTap: { close { await session.switchTo(origin: server.origin) } },
            onRemove: { asking = server })
        }
        LegacySheetItem(.plus, Str.serversAdd) { close { session.addServer() } }
      }
      .padding(.vertical, 12)
    }
    .scrollBounceBehavior(.basedOnSize)
    .legacySheet([.medium, .large])
    .alert(
      asking.map { Str.serversRemoveTitle($0.title) } ?? "",
      isPresented: Binding(get: { asking != nil }, set: { if !$0 { asking = nil } }),
      presenting: asking
    ) { server in
      Button(Str.commonRemove, role: .destructive) {
        asking = nil
        Task { try? await session.removeServer(origin: server.origin) }
      }
      Button(Str.commonCancel, role: .cancel) { asking = nil }
    } message: { _ in
      Text(Str.serversRemoveBody)
    }
  }

  /// Closes the sheet, then does what was picked, so the screen it changes isn't under it.
  private func close(_ then: @escaping () async -> Void) {
    dismiss()
    Task { await then() }
  }
}

private struct ServerRow: View {
  let server: SavedServer
  let busy: Bool
  let onTap: () -> Void
  let onRemove: () -> Void
  @Environment(\.palette) private var palette

  var body: some View {
    HStack(spacing: 4) {
      Button(action: onTap) {
        HStack(spacing: 16) {
          LucideIcon(.server, tint: server.active ? palette.accent : palette.mutedForeground)
          VStack(alignment: .leading, spacing: 0) {
            Text(server.title).textStyle(.base).foregroundStyle(palette.foreground).lineLimit(1)
            Text(busy ? Str.serversRemoving : server.facts)
              .textStyle(.px13).foregroundStyle(palette.mutedForeground).lineLimit(2)
          }
          .padding(.vertical, 6)
          Spacer(minLength: 0)
          if server.active {
            LucideIcon(.check, label: Str.serversInUse, size: 20, tint: palette.accent)
          }
        }
        .padding(.leading, 20)
        .padding(.vertical, 6)
        .frame(minHeight: TouchTarget)
        .contentShape(Rectangle())
      }
      .buttonStyle(LegacyRowPress())
      .disabled(busy)
      .accessibilityAddTraits(server.active ? .isSelected : [])
      Group {
        if busy {
          ProgressView().controlSize(.small).tint(palette.mutedForeground)
        } else {
          LegacyRoundIconButton(
            .trash, label: Str.serversRemove(server.title), size: 40, tint: palette.mutedForeground, background: .clear,
            action: onRemove)
        }
      }
      .frame(width: 48, height: 48)
      .padding(.trailing, 8)
    }
  }
}

/// Under the connect and sign-in screens while adding a server: back to the one in use, as it was.
struct BackToServer: View {
  @Environment(MatineeSession.self) private var session
  @Environment(\.palette) private var palette

  var body: some View {
    if let current = session.servers.first(where: \.active) {
      Button {
        Task { await session.cancelAdd() }
      } label: {
        LucideIcon(.arrowLeft, size: 18, tint: palette.mutedForeground)
        Text(Str.serversBackTo(current.title)).foregroundStyle(palette.mutedForeground)
      }
      .buttonStyle(.legacy(.ghost))
    }
  }
}
