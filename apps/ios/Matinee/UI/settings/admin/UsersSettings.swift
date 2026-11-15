import MatineeCore
import MatineeKit
import SwiftUI

/*
 * UsersSettings.kt: everyone's accounts, and what an admin can do to one.
 * Which action would leave the server without an admin is MatineeCore's
 * (Admin/LibraryForms.swift).
 */

/// Everyone's accounts, as the web's users panel: who they are, how they
/// sign in, and when they were last here. A tap offers the admin role,
/// signing out everywhere, and deleting the account, each asked first.
struct UsersSettings: View {
  @State private var loader = Loader<[AdminUser]>()
  // The page's, so a save goes on after its menu or question closes.
  @State private var saver = Saver()
  @State private var confirmation: Confirmation?
  @Environment(\.api) private var api
  @Environment(\.user) private var me
  @Environment(\.snackbar) private var snackbar
  @Environment(MatineeSession.self) private var session

  var body: some View {
    SettingsScaffold(Str.settingsAdminUsers) {
      AdminLoaded(loader, failed: Str.webUsersLoadFailed) { users in
        Panel {
          ForEach(Array(users.enumerated()), id: \.element.id) { index, user in
            if index > 0 { RowDivider() }
            UserRow(user: user, isSelf: me?.id == user.id) { pick($0, lastAdmin: isLastAdmin(user, of: users)) }
          }
        }
      }
    }
    .loads(loader) { api in try await api.admin.users.list() }
    .confirming($confirmation)
  }

  /// The server keeps one admin who can sign in; say so before asking.
  private func pick(_ action: UserAction, lastAdmin: Bool) {
    if action.strandsServer(lastAdmin: lastAdmin) {
      snackbar.show(Str.webUsersLastAdmin)
    } else {
      confirmation = question(action)
    }
  }

  private func question(_ action: UserAction) -> Confirmation {
    let user = action.user
    let isSelf = me?.id == user.id
    switch action {
    case .role(_, let admin):
      let stepDown = isSelf && !admin
      return Confirmation(
        title: admin
          ? Str.webUsersRoleMakeTitle(user.name) : stepDown ? Str.webUsersRoleStepDownTitle : Str.webUsersRoleRemoveTitle(user.name),
        body: admin
          ? Str.webUsersRoleMakeDescription : stepDown ? Str.webUsersRoleStepDownDescription : Str.webUsersRoleRemoveDescription,
        confirm: admin
          ? Str.webUsersRoleMakeConfirm : stepDown ? Str.webUsersRoleStepDownConfirm : Str.webUsersRoleRemoveConfirm
      ) {
        run {
          _ = try await $0.admin.users.setRole(id: user.id, role: admin ? UserRole.admin : UserRole.user)
          snackbar.show(
            admin ? Str.webUsersMadeAdmin(user.name) : stepDown ? Str.webUsersSteppedDown : Str.webUsersRemovedAdmin(user.name))
          // Without the role, the admin pages are gone; the app asks the server who it is again.
          if stepDown { await session.start() } else { loader.reload() }
        }
      }
    case .signOut:
      return Confirmation(
        title: isSelf ? Str.webUsersSignOutOwnTitle : Str.webUsersSignOutTitle(user.name),
        body: isSelf ? Str.webUsersSignOutOwnDescription : Str.webUsersSignOutDescription,
        confirm: isSelf ? Str.webUsersSignOutOwnConfirm : Str.webUsersSignOutConfirm
      ) {
        run {
          let ended = try await $0.admin.users.signOut(id: user.id).ended
          snackbar.show(isSelf ? Str.webUsersEndedOwnSessions(ended) : Str.webUsersEndedSessions(ended, user.name))
          loader.reload()
        }
      }
    case .delete:
      return Confirmation(
        title: isSelf ? Str.webUsersDeleteOwnTitle : Str.webUsersDeleteTitle(user.name),
        body: isSelf ? Str.webUsersDeleteOwnDescription : Str.webUsersDeleteDescription,
        confirm: isSelf ? Str.webUsersDeleteOwnConfirm : Str.webUsersDeleteConfirm
      ) {
        run {
          try await $0.admin.users.remove(id: user.id)
          // An account gone, its session with it.
          if isSelf {
            try await session.signOut()
          } else {
            snackbar.show(Str.webUsersDeleted(user.name))
            loader.reload()
          }
        }
      }
    }
  }

  private func run(_ block: @escaping (MatineeApi) async throws -> Void) {
    guard let api else { return }
    saver(snackbar) { try await block(api) }
  }
}

/// An account: its picture, name, role, how it signs in, and when it was last here.
private struct UserRow: View {
  let user: AdminUser
  let isSelf: Bool
  let onPick: (UserAction) -> Void
  @Environment(\.api) private var api
  @Environment(\.palette) private var palette
  @Environment(\.dynamicTypeSize) private var dynamicType

  var body: some View {
    Menu {
      Section("@\(user.username)") {
        LegacyMenuItem(
          .shield,
          !user.isAdmin ? Str.webUsersMenuMakeAdmin : isSelf ? Str.webUsersMenuStepDown : Str.webUsersMenuRemoveAdmin
        ) { onPick(.role(user, admin: !user.isAdmin)) }
        LegacyMenuItem(.logOut, isSelf ? Str.webUsersMenuSignOutOthers : Str.webUsersMenuSignOut) { onPick(.signOut(user)) }
        LegacyMenuItem(.trash, isSelf ? Str.webUsersMenuDeleteOwn : Str.webUsersMenuDelete, destructive: true) {
          onPick(.delete(user))
        }
      }
    } label: {
      HStack(spacing: 14) {
        ProfileAvatar(user.name, url: user.avatarId.flatMap { api?.paths.avatar($0) }, size: 40)
        VStack(alignment: .leading, spacing: 0) {
          // At large text sizes the badge goes under the name rather than squeeze it.
          ViewThatFits(in: .horizontal) {
            HStack(spacing: 8) {
              name.lineLimit(1)
              if user.isAdmin { LegacyBadge(Str.webUsersAdmin, outlined: true) }
            }
            VStack(alignment: .leading, spacing: 4) {
              name
              if user.isAdmin { LegacyBadge(Str.webUsersAdmin, outlined: true) }
            }
          }
          Text(detail).textStyle(.px13).foregroundStyle(palette.mutedForeground)
            .lineLimit(dynamicType.isAccessibilitySize ? nil : 2)
        }
        .multilineTextAlignment(.leading)
        .frame(maxWidth: .infinity, alignment: .leading)
      }
      .padding(.horizontal, 16)
      .padding(.vertical, 12)
      .contentShape(Rectangle())
    }
    .buttonStyle(LegacyRowPress())
    .accessibilityHint(Str.webUsersActions(user.name))
  }

  private var name: some View {
    Text(isSelf ? "\(user.name) \(Str.webUsersYou)" : user.name).textStyle(.base)
      .foregroundStyle(palette.foreground)
  }

  private var detail: String {
    var signIn: [String] = []
    if user.passkeys > 0 { signIn.append(Str.webUsersPasskeys(user.passkeys)) }
    if user.oidcLinked { signIn.append("SSO") }
    if signIn.isEmpty { signIn.append(Str.webUsersNoSignIn) }
    let seen = user.lastSeenAt.map { Str.webUsersLastSeen(formatInstant($0)) } ?? Str.webUsersJoined(formatInstant(user.createdAt))
    return (signIn + [seen]).joined(separator: " · ")
  }
}
