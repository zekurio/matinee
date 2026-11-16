import MatineeCore
import MatineeKit
import SwiftUI

/*
 * TvSettingsRows.kt's Devices and Account: the places the account is
 * signed in, each but this TV with a way to sign it out, and who is signed
 * in to which server, with the ways out: another server, from the saved
 * servers' panel (auth/TVServers.swift), or signing out, which asks first.
 *
 * Signing another device out asks in the side panel, as Android TV does:
 * it changes nothing on this TV. Signing this TV out stops everything, so
 * it asks in the middle of the screen, focused on Cancel.
 */

// MARK: Devices

/// A session, for the panel that asks before signing it out.
private struct AskedSession: Identifiable {
  let session: Session
  var id: String { session.id }
}

/// The places the account is signed in, asked again each time the
/// category opens, so a device signed in meanwhile shows.
struct DeviceRows: View {
  let focus: FocusState<String?>.Binding
  @State private var sessions = Loader<[Session]>()
  @State private var asking: AskedSession?
  @State private var askingOthers = false
  @Environment(\.api) private var api
  @Environment(\.snackbar) private var snackbar
  @Environment(\.palette) private var palette

  var body: some View {
    SettingsColumn {
      switch sessions.state {
      case .loading:
        Spinner(size: 56, tint: palette.mutedForeground)
          .padding(.leading, TVListItems.inset)
          .padding(.top, TVSpace.s5)
      case .failed(let message, _):
        SettingsNote(Str.accountSessionsLoadFailed(message))
        TVListItem(Str.commonRetry, icon: .refreshCw, quiet: true, action: sessions.reload)
          .focused(focus, equals: FIRST_ROW)
      case .ready(let list):
        ForEach(Array(list.enumerated()), id: \.element.id) { index, session in
          SessionRow(session: session) { asking = AskedSession(session: session) }
            .focused(focus, equals: index == 0 ? FIRST_ROW : session.id)
        }
        if list.contains(where: { !$0.current }) {
          SettingsGap()
          TVListItem(Str.webUsersMenuSignOutOthers, icon: .logOut, quiet: true, destructive: true) {
            askingOthers = true
          }
          .focused(focus, equals: "signOutOthers")
        }
      }
    }
    .loads(sessions) { api in try await api.account.sessions.list() }
    .tvSidePanel(
      item: $asking, title: { Str.tvSettingsSignOutDevice(sessionName($0.session)) },
      description: { _ in Str.tvSettingsSignOutDeviceDescription }
    ) { asked in
      SignOutDeviceRows(session: asked.session) { revoke(asked.session) }
    }
    .tvConfirmDialog(
      isPresented: $askingOthers, title: Str.webUsersSignOutOwnTitle, message: Str.webUsersSignOutOwnDescription,
      confirm: Str.webUsersSignOutOwnConfirm, confirmIcon: .logOut, cancel: Str.commonCancel
    ) {
      guard let api else { return }
      launchShowing(snackbar, Str.accountSessionsSignOutFailed) {
        let ended = try await api.account.sessions.revokeOthers()
        snackbar.show(Str.webUsersEndedOwnSessions(ended.revoked))
        sessions.reload()
      }
    }
  }

  private func revoke(_ session: Session) {
    guard let api else { return }
    launchShowing(snackbar, Str.accountSessionsSignOutFailed) {
      try await api.account.sessions.revoke(id: session.id)
      sessions.reload()
    }
  }
}

/// Sign out, in the danger color, and Cancel, which has focus.
private struct SignOutDeviceRows: View {
  let session: Session
  let onSignOut: @MainActor @Sendable () -> Void
  @FocusState private var focused: String?
  @Environment(\.overlayDismiss) private var dismiss

  var body: some View {
    VStack(spacing: TVListItems.gap) {
      TVListItem(Str.shellSignOut, icon: .logOut, quiet: true, destructive: true) { dismiss(then: onSignOut) }
        .focused($focused, equals: "signOut")
      TVListItem(Str.commonCancel, icon: .x, quiet: true) { dismiss() }
        .focused($focused, equals: "cancel")
    }
    .defaultFocus($focused, "cancel")
  }
}

/// A signed-in device: what it is, when it was last used and since when
/// it's signed in, and this TV marked; the others offer to sign it out.
private struct SessionRow: View {
  let session: Session
  let onSignOut: () -> Void

  var body: some View {
    // This TV stays focusable, so the list scrolls past it, but has nothing to do.
    TVListItem(
      sessionName(session), subtitle: detail, icon: platformIcon(session.platform), quiet: true,
      action: { if !session.current { onSignOut() } }
    ) {
      if session.current {
        ThisDevice()
      } else {
        TVListValue(Str.shellSignOut)
      }
    }
  }

  private var detail: String {
    [
      session.deviceName != nil ? session.platform.map { Str.accountDeviceApp(platformLabel($0)) } : nil,
      lastActive,
      Str.accountSessionsSignedIn(formatInstant(session.createdAt)),
    ].compactMap(\.self).joined(separator: " · ")
  }

  /// The server moves a session's last use at most hourly, so anything more recent only says "recently".
  private var lastActive: String? {
    if session.current { return Str.webUsersActiveNow }
    guard let seen = parseInstant(session.lastSeenAt) else { return nil }
    if Date.now.timeIntervalSince(seen) < 3600 { return Str.webUsersActiveRecently }
    let relative = RelativeDateTimeFormatter()
    relative.locale = .app
    return Str.webUsersLastSeen(relative.localizedString(for: seen, relativeTo: .now))
  }
}

/// "This device", at the end of this TV's row, in the row's content color.
private struct ThisDevice: View {
  var body: some View {
    Text(Str.accountSessionsThisDevice).textStyle(.label).lineLimit(1).opacity(0.7)
  }
}

// MARK: Account

/// Who is signed in, the server, and the ways out.
struct AccountRows: View {
  let focus: FocusState<String?>.Binding
  @State private var servers = false
  @State private var signingOut = false
  @Environment(MatineeSession.self) private var session
  @Environment(\.user) private var user

  var body: some View {
    SettingsColumn {
      if let user {
        TVListItem(user.name, subtitle: who(user), quiet: true, action: {}) {
          TVAvatar(user: user, size: 72)
        } trailing: {
          EmptyView()
        }
        .focused(focus, equals: FIRST_ROW)
      }
      SettingsFact(serverName, icon: .server)
        .focused(focus, equals: "server")
      SettingsGap()
      TVListItem(Str.connectChangeServer, icon: .refreshCw, quiet: true) { servers = true }
        .focused(focus, equals: "changeServer")
      TVListItem(Str.shellSignOut, icon: .logOut, quiet: true, destructive: true) { signingOut = true }
        .focused(focus, equals: "signOut")
    }
    .tvServerPanel(isPresented: $servers)
    .tvConfirmDialog(
      isPresented: $signingOut, title: Str.iosTvSettingsSignOutTitle, message: Str.iosTvSettingsSignOutDescription,
      confirm: Str.shellSignOut, confirmIcon: .logOut, cancel: Str.commonCancel
    ) {
      Task { try? await session.signOut() }
    }
  }

  /// "@ios-admin · Admin".
  private func who(_ user: User) -> String? {
    let facts = [user.displayName != nil ? "@\(user.username)" : nil, user.isAdmin ? Str.profileAdmin : nil]
      .compactMap(\.self)
    return facts.isEmpty ? nil : facts.joined(separator: " · ")
  }

  /// The server in use, by its host and port.
  private var serverName: String {
    let server = session.state.server ?? ""
    return URL(string: server).flatMap { url in url.host.map { host in url.port.map { "\(host):\($0)" } ?? host } }
      ?? server
  }
}
