import MatineeCore
import MatineeKit
import SwiftUI

/*
 * UsersSettings.kt: everyone's accounts, and what an admin can do to one.
 * Which action would leave the server without an admin is MatineeCore's
 * (Admin/LibraryForms.swift).
 */

/// Everyone's accounts, as the web's users panel: who they are, how they
/// sign in, and when they were last here. A tap opens what can be done to
/// the account, the admin role, signing out everywhere, and deleting it,
/// each asked first.
struct UsersSettings: View {
  @State private var loader = Loader<[AdminUser]>()
  // The page's, so a change goes on after its sheet or question closes.
  @State private var saver = Saver()
  @State private var acting: Picked<AdminUser>?
  @State private var confirmation: Confirmation?
  @Environment(\.api) private var api
  @Environment(\.user) private var me
  @Environment(\.snackbar) private var snackbar
  @Environment(MatineeSession.self) private var session

  var body: some View {
    let users = loader.state.value ?? []
    AdminPage(Str.settingsAdminUsers) {
      AdminLoaded(loader) { users in
        ListBlock {
          ForEach(users, id: \.id) { user in
            UserRow(user: user, isSelf: me?.id == user.id) { acting = Picked(user.id, user) }
          }
        }
      }
    }
    .loads(loader) { api in try await api.admin.users.list() }
    .onChange(of: users.count, initial: true) { _, _ in demo(users) }
    .matineeSheet(item: $acting) { picked in
      let user = picked.value
      UserSheet(user: user, isSelf: me?.id == user.id) { pick($0, lastAdmin: isLastAdmin(user, of: users)) }
    }
    .confirming($confirmation)
  }

  /// The server keeps one admin who can sign in; say so rather than ask.
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
        message: admin
          ? Str.webUsersRoleMakeDescription : stepDown ? Str.webUsersRoleStepDownDescription : Str.webUsersRoleRemoveDescription,
        confirm: admin
          ? Str.webUsersRoleMakeConfirm : stepDown ? Str.webUsersRoleStepDownConfirm : Str.webUsersRoleRemoveConfirm,
        // Making an admin takes nothing away; the web asks in its plain look.
        destructive: !admin
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
        message: isSelf ? Str.webUsersSignOutOwnDescription : Str.webUsersSignOutDescription,
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
        message: isSelf ? Str.webUsersDeleteOwnDescription : Str.webUsersDeleteDescription,
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

  /// What a debug build was launched to show, on the first account that isn't this one.
  private func demo(_ users: [AdminUser]) {
    guard let other = users.first(where: { $0.id != me?.id }), acting == nil, confirmation == nil else { return }
    if adminDemo("sheet") { acting = Picked(other.id, other) }
    // Only the question: the answer changes a real account.
    if adminDemo("role") { pick(.role(other, admin: !other.isAdmin), lastAdmin: false) }
  }

  private func run(_ block: @escaping (MatineeApi) async throws -> Void) {
    guard let api else { return }
    saver(snackbar) { try await block(api) }
  }
}

/// An account, as Android's row: its picture, its name with whether it's
/// an admin, and how it signs in and when it was last here. The whole row
/// opens its actions, whose sheet names the username.
private struct UserRow: View {
  let user: AdminUser
  let isSelf: Bool
  let onOpen: () -> Void
  @Environment(\.api) private var api
  @Environment(\.palette) private var palette

  var body: some View {
    Pressable(action: onOpen) {
      HStack(spacing: Space.s3_5) {
        ProfileAvatar(user.name, url: user.avatarId.flatMap { api?.paths.avatar($0) }, size: 40)
        VStack(alignment: .leading, spacing: 0) {
          name
          Text(detail).textStyle(.px13).foregroundStyle(palette.mutedForeground).lineLimit(2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      }
      .padding(.horizontal, Space.s4)
      .padding(.vertical, Space.s3)
      .contentShape(Rectangle())
    }
    .accessibilityElement(children: .combine)
    .accessibilityHint(Str.webUsersActions(user.name))
  }

  /// The name, "(you)", and the admin badge, which goes under the name when
  /// the text is large or the name is long.
  private var name: some View {
    ViewThatFits(in: .horizontal) {
      HStack(spacing: Space.s2) { nameText.lineLimit(1); badge }
      VStack(alignment: .leading, spacing: Space.s1) { nameText; badge }
    }
  }

  private var nameText: some View {
    (Text(user.name) + Text(verbatim: isSelf ? " \(Str.webUsersYou)" : ""))
      .foregroundStyle(palette.foreground)
      .textStyle(.base)
  }

  @ViewBuilder private var badge: some View {
    if user.isAdmin { Badge(Str.webUsersAdmin, look: .outline) }
  }

  private var signIn: [String] {
    var ways: [String] = []
    if user.passkeys > 0 { ways.append(Str.webUsersPasskeys(user.passkeys)) }
    if user.oidcLinked { ways.append("SSO") }
    return ways
  }

  private var detail: String {
    let seen = user.lastSeenAt.map { Str.webUsersLastSeen(formatInstant($0)) } ?? Str.webUsersJoined(formatInstant(user.createdAt))
    return ((signIn.isEmpty ? [Str.webUsersNoSignIn] : signIn) + [seen]).joined(separator: " · ")
  }
}

/// What can be done to an account: its role, its sessions, the account itself.
private struct UserSheet: View {
  let user: AdminUser
  let isSelf: Bool
  let onPick: (UserAction) -> Void

  var body: some View {
    SheetHeader(user.name, subtitle: "@\(user.username)")
    SheetItem(
      !user.isAdmin ? Str.webUsersMenuMakeAdmin : isSelf ? Str.webUsersMenuStepDown : Str.webUsersMenuRemoveAdmin,
      icon: .shield
    ) { onPick(.role(user, admin: !user.isAdmin)) }
    SheetItem(isSelf ? Str.webUsersMenuSignOutOthers : Str.webUsersMenuSignOut, icon: .logOut) {
      onPick(.signOut(user))
    }
    SheetItem(isSelf ? Str.webUsersMenuDeleteOwn : Str.webUsersMenuDelete, icon: .trash, destructive: true) {
      onPick(.delete(user))
    }
  }
}
