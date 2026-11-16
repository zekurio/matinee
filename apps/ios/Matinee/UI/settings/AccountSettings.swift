import MatineeCore
import MatineeKit
import Nuke
import PhotosUI
import SwiftUI
import UIKit

/*
 * Settings, Account, as the web's account panel (account-panel.tsx,
 * sessions.tsx) with Android's way to sign in a TV: the profile, the
 * passkeys and the single sign-on account the person signs in with, then
 * signing in another device and the places the account is signed in.
 *
 * What only a browser can do stays on the web: adding a passkey (iOS
 * binds passkeys to domains the app declares, which a self-hosted server
 * can't be) and linking a sign-in provider (its redirect lands in the
 * browser's session, not the app's). Removing either works here.
 */

/// A little more than the server's poll interval for devices signing in with a code.
private let DEVICE_POLL: Duration = .seconds(6)

/// Settings' Account page.
struct AccountPage: View {
  @State private var config = Loader<AuthConfig>()
  @State private var sessions = Loader<[Session]>()
  @State private var passkeys = Loader<[Passkey]>()
  @State private var oidc = Loader<OidcAccount?>()
  @State private var shown = false
  @Environment(\.user) private var user
  @Environment(\.navigator) private var nav

  var body: some View {
    let config = config.state.value
    let linked = oidc.state.value ?? nil
    SettingsScaffold(Str.settingsPageAccount) {
      if let user { ProfileSection(user: user) }
      if config?.passkeys == true, let list = passkeys.state.value, !list.isEmpty {
        // The server keeps at least one way to sign in, so the last one has no Remove.
        let methods = list.count + (config?.oidc != nil && linked?.signsIn == true ? 1 : 0)
        PasskeysSection(passkeys: list, removable: methods > 1, loader: passkeys)
      }
      if let provider = config?.oidc, let linked {
        LinkedAccountSection(provider: provider.displayName, account: linked, loader: oidc)
      }
      ListBlock {
        MatineeKit.ListRow(
          Str.linkTitle, subtitle: Str.linkRowDescription, icon: .scanQrCode, iconTile: true, action: nav.linkDevice)
      }
      SessionsSection(sessions: sessions)
    }
    .loads(self.config) { api in try await api.auth.config() }
    .loads(passkeys) { api in try await api.account.passkeys.list() }
    .loads(oidc) { api in try await api.account.oidc.get() }
    .loads(sessions) { api in try await api.account.sessions.list() }
    .task(id: shown) {
      // Back from signing in a device: show it. The device gets its session
      // on its next poll, up to five seconds after the approval, so ask once
      // more after that.
      guard shown, sessions.state.value != nil else { return }
      sessions.reload()
      try? await Task.sleep(for: DEVICE_POLL)
      sessions.reload()
    }
    .onAppear { shown = true }
    .onDisappear { shown = false }
  }
}

// MARK: Profile

/// The person's picture, loaded with the app's sign-in, or their initials
/// until it is, as the web's UserAvatar.
struct AccountAvatar: View {
  let user: User
  var size: CGFloat = 32
  @State private var picture: UIImage?
  @Environment(\.api) private var api
  @Environment(\.imagePipeline) private var pipeline

  var body: some View {
    MatineeKit.Avatar(user.name, size: size) {
      if let picture {
        Image(uiImage: picture).resizable().scaledToFill()
      }
    }
    .task(id: user.avatarId) {
      guard let id = user.avatarId, let api, let url = URL(string: api.paths.avatar(id)) else {
        picture = nil
        return
      }
      picture = try? await pipeline.image(for: url)
    }
  }
}

/// The picture and the name others see, and what the profile shows them.
private struct ProfileSection: View {
  let user: User
  @State private var sharing = SharingSave()
  @Environment(\.api) private var api
  @Environment(\.snackbar) private var snackbar
  @Environment(MatineeSession.self) private var session

  var body: some View {
    let shown = sharing.shown(user)
    // TODO(strings): account.profile.title "Profile"
    SettingsSection(Str.tabProfile) {
      HStack(alignment: .center, spacing: MatineeKit.Space.s4) {
        AvatarPicker(user: user)
        DisplayNameField(user: user)
      }
      ListBlock {
        // TODO(strings): account.sharing.favorites "Show my favorites"
        MatineeKit.SwitchRow(
          Str.favoritesTitle,
          isOn: Binding(
            get: { shown.favorites },
            set: { sharing.save(.init(favorites: $0), api: api, session: session, snackbar: snackbar) }))
        // TODO(strings): account.sharing.stats "Show my statistics"
        MatineeKit.SwitchRow(
          Str.profileStatistics,
          isOn: Binding(
            get: { shown.stats },
            set: { sharing.save(.init(stats: $0), api: api, session: session, snackbar: snackbar) }))
      }
    }
  }
}

/// What the profile shows others, saved as it's switched: the switch moves
/// at once and a refusal puts it back, as the web's SharingRows.
@Observable private final class SharingSave {
  private(set) var pending: ProfileSharing?

  func shown(_ user: User) -> ProfileSharing { pending ?? user.sharing }

  func save(
    _ change: AccountProfileUpdateInput.Sharing, api: MatineeApi?, session: MatineeSession, snackbar: Snackbar
  ) {
    guard let api, let user = session.state.user else { return }
    var next = pending ?? user.sharing
    if let favorites = change.favorites { next.favorites = favorites }
    if let stats = change.stats { next.stats = stats }
    pending = next
    // TODO(strings): account.sharing.failed "Couldn't change what your profile shows"
    launchShowing(snackbar, Str.webCommonSaveBarFailed) { [self] in
      defer { if pending == next { pending = nil } }
      session.updateUser(user: try await api.account.profile.update(sharing: change))
    }
  }
}

extension AuthState {
  /// The signed-in account, while there is one.
  fileprivate var user: User? {
    switch self {
    case .signedIn(_, let user), .offline(_, let user): user
    default: nil
    }
  }
}

/// The picture is the control, as on the web: with one set, a tap opens a
/// menu to replace or remove it; without, it goes straight to the photos.
/// A small badge at its corner says it can be changed, as a finger has no
/// pointer to bring up the web's pencil.
private struct AvatarPicker: View {
  let user: User
  @State private var menu = false
  @State private var picking = false
  @State private var photo: PhotosPickerItem?
  @State private var busy = false
  @Environment(\.api) private var api
  @Environment(\.snackbar) private var snackbar
  @Environment(MatineeSession.self) private var session
  @Environment(\.palette) private var palette

  var body: some View {
    Pressable(shape: Circle(), wash: false) {
      if user.avatarId != nil { menu = true } else { picking = true }
    } label: {
      AccountAvatar(user: user, size: 64)
        .overlay {
          if busy {
            Circle().fill(.black.opacity(0.5))
            MatineeKit.Spinner(size: 20, tint: .white)
          }
        }
        .overlay(alignment: .bottomTrailing) {
          MatineeKit.LucideIcon(.imageUp, size: 14, tint: palette.foreground, scales: false)
            .frame(width: 26, height: 26)
            .background(palette.secondary, in: Circle())
            .overlay { Circle().strokeBorder(palette.background, lineWidth: 2) }
            .offset(x: 2, y: 2)
        }
    }
    .disabled(busy)
    // TODO(strings): account.picture.change "Change picture"
    .accessibilityLabel(Str.webJobsQueueAvatarsName)
    .dropdownMenu(isPresented: $menu) {
      MatineeKit.MenuItem(Str.iosImagesFromPhotos, icon: .imageUp) { picking = true }
      if user.avatarId != nil {
        // TODO(strings): account.picture.remove "Remove picture"
        MatineeKit.MenuItem(Str.commonRemove, icon: .trash, destructive: true) {
          change { api in try await api.account.avatar.remove() }
        }
      }
    }
    #if DEBUG
      .onAppear { if debugOpens("avatar") { menu = true } }
    #endif
    .photosPicker(isPresented: $picking, selection: $photo, matching: .images, preferredItemEncoding: .compatible)
    .onChange(of: photo) { _, item in
      guard let item else { return }
      photo = nil
      change { api in
        let data = try await item.loadTransferable(type: Data.self)
        guard let data, let file = avatarFile(data) else { throw AvatarUnreadable() }
        return try await api.account.avatar.upload(file: file)
      }
    }
  }

  private func change(_ send: @escaping (MatineeApi) async throws -> User) {
    guard let api, !busy else { return }
    busy = true
    // TODO(strings): account.picture.changeFailed "Couldn't change your picture"
    launchShowing(snackbar, Str.webCommonSaveBarFailed) {
      defer { busy = false }
      session.updateUser(user: try await send(api))
    }
  }
}

private struct AvatarUnreadable: Error {}

/// A photo as the web's `prepareAvatar` sends one: the square in its
/// middle, upright, at most 512 pixels, here as a JPEG.
private func avatarFile(_ data: Data) -> FilePart? {
  guard let image = UIImage(data: data) else { return nil }
  let width = Int(image.size.width * image.scale)
  let height = Int(image.size.height * image.scale)
  guard let (crop, side) = avatarCrop(width: width, height: height) else { return nil }
  let format = UIGraphicsImageRendererFormat()
  format.scale = 1
  let scale = CGFloat(side) / crop.width
  let jpeg = UIGraphicsImageRenderer(size: CGSize(width: side, height: side), format: format).jpegData(
    withCompressionQuality: 0.9
  ) { _ in
    // Drawn whole, offset so the square lands in the frame: the drawing turns it upright.
    image.draw(
      in: CGRect(
        x: -crop.minX * scale, y: -crop.minY * scale, width: CGFloat(width) * scale, height: CGFloat(height) * scale))
  }
  return FilePart(bytes: jpeg, type: "image/jpeg", name: "avatar.jpg")
}

/// The name others see, saved on Return or when the field lets go, as the
/// web's: empty goes back to the username, which is the placeholder.
private struct DisplayNameField: View {
  let user: User
  @State private var text: String
  @State private var focused = false
  @Environment(\.api) private var api
  @Environment(\.snackbar) private var snackbar
  @Environment(MatineeSession.self) private var session

  init(user: User) {
    self.user = user
    _text = State(initialValue: user.displayName ?? "")
  }

  var body: some View {
    MatineeKit.FormField(Str.webOidcFieldDisplayName) {
      MatineeKit.MatineeTextField(
        user.username, text: Binding(get: { text }, set: { text = String($0.prefix(64)) }), focused: $focused
      )
      .textContentType(.nickname)
      .submitLabel(.done)
      .onSubmit(commit)
    }
    .frame(maxWidth: .infinity)
    .onChange(of: focused) { _, now in if !now { commit() } }
    // A name saved from elsewhere, as another device, while the field isn't being typed in.
    .onChange(of: user.displayName) { _, saved in if !focused { text = saved ?? "" } }
  }

  private func commit() {
    let name = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard let api, name != (user.displayName ?? "") else {
      text = user.displayName ?? ""
      return
    }
    let saved = user.displayName ?? ""
    Task {
      do {
        session.updateUser(user: try await api.account.profile.update(displayName: name))
      } catch {
        if Failure(error) == .cancelled { return }
        text = saved
        // TODO(strings): account.displayName.saveFailed "Couldn't save your name. {reason}"
        snackbar.show(Str.webCommonSaveBarFailed)
      }
    }
  }
}

// MARK: Passkeys and single sign-on

/// The icon tile at the start of a row of the account's, as the web's RowIcon:
/// `size-9 rounded-lg bg-secondary`, a 16-point glyph.
struct RowIcon: View {
  let icon: MatineeKit.Lucide
  @Environment(\.palette) private var palette

  init(_ icon: MatineeKit.Lucide) { self.icon = icon }

  var body: some View {
    MatineeKit.LucideIcon(icon, size: 16, tint: palette.mutedForeground)
      .frame(width: 36, height: 36)
      .background(palette.secondary, in: RoundedRectangle.kit(MatineeKit.Radius.lg))
  }
}

/// A row of the account's, as the web's ListItem with a RowIcon: its tile,
/// a name in `text-sm font-medium` and a line under it, and what can be
/// done with it at its end.
struct AccountItemRow<Badge: View, Trailing: View>: View {
  let icon: MatineeKit.Lucide
  let title: String
  let detail: String?
  @ViewBuilder let badge: () -> Badge
  @ViewBuilder let trailing: () -> Trailing
  @Environment(\.palette) private var palette
  @Environment(\.dynamicTypeSize) private var dynamicType

  var body: some View {
    HStack(spacing: MatineeKit.Space.s3) {
      RowIcon(icon)
      VStack(alignment: .leading, spacing: 0) {
        // At the large text sizes the badge goes under the name rather than squeeze it.
        if dynamicType.isAccessibilitySize {
          Text(title).textStyle(.sm, weight: .medium).foregroundStyle(palette.foreground)
          badge()
        } else {
          HStack(spacing: MatineeKit.Space.s2) {
            Text(title).textStyle(.sm, weight: .medium).foregroundStyle(palette.foreground).lineLimit(1)
            badge()
          }
        }
        if let detail {
          Text(detail).textStyle(.px13).foregroundStyle(palette.mutedForeground)
            .lineLimit(dynamicType.isAccessibilitySize ? nil : 2)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .accessibilityElement(children: .combine)
      trailing()
    }
    .padding(.leading, MatineeKit.Space.s4)
    .padding(.trailing, MatineeKit.Space.s2)
    .padding(.vertical, MatineeKit.Space.s2_5)
    .frame(minHeight: 56)
  }
}

extension AccountItemRow where Badge == EmptyView {
  init(icon: MatineeKit.Lucide, title: String, detail: String?, @ViewBuilder trailing: @escaping () -> Trailing) {
    self.init(icon: icon, title: title, detail: detail, badge: { EmptyView() }, trailing: trailing)
  }
}

/// The passkeys the account signs in with, each with a way to remove it.
private struct PasskeysSection: View {
  let passkeys: [Passkey]
  /// Whether one can go: not the account's last way to sign in.
  let removable: Bool
  let loader: Loader<[Passkey]>
  @State private var removing: Passkey?
  @Environment(\.api) private var api
  @Environment(\.snackbar) private var snackbar

  var body: some View {
    SettingsSection(Str.webOidcPasskeysTitle) {
      ListBlock {
        ForEach(passkeys, id: \.id) { passkey in
          // TODO(strings): account.passkeys.unnamed "Passkey"; account.passkeys.used "Used {time}",
          // account.passkeys.added "Added {date}", account.passkeys.synced "Synced"
          AccountItemRow(
            icon: .keyRound, title: passkey.name ?? Str.webOidcPasskeysTitle,
            detail: formatInstant(passkey.lastUsedAt ?? passkey.createdAt)
          ) {
            if removable {
              // TODO(strings): account.passkeys.removeNamed "Remove {name}"
              MatineeKit.RoundIconButton(.trash, label: Str.commonRemove, look: .ghost) { removing = passkey }
            }
          }
        }
      }
    }
    // TODO(strings): account.passkeys.removeTitle "Remove {name}?", account.passkeys.removeDescription
    .confirmDialog(
      isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }),
      title: removing?.name ?? Str.webOidcPasskeysTitle, confirm: Str.commonRemove
    ) {
      guard let api, let passkey = removing else { return }
      removing = nil
      // TODO(strings): account.passkeys.removeFailed "Couldn't remove passkey"
      launchShowing(snackbar, Str.webCommonErrorUnknown) {
        try await api.account.passkeys.remove(id: passkey.id)
        loader.reload()
      }
    }
  }
}

/// The account at the server's sign-in provider this one is linked to, and unlinking it.
private struct LinkedAccountSection: View {
  let provider: String
  let account: OidcAccount
  let loader: Loader<OidcAccount?>
  @State private var busy = false
  @Environment(\.api) private var api
  @Environment(\.snackbar) private var snackbar

  var body: some View {
    SettingsSection(provider) {
      ListBlock {
        // TODO(strings): account.oidc.linked "Linked {date}", account.oidc.stale
        AccountItemRow(icon: .link, title: account.label ?? provider, detail: formatInstant(account.createdAt)) {
          // TODO(strings): account.oidc.unlink "Unlink"
          MatineeKit.MatineeButton(Str.commonRemove, look: .ghost, size: .md, pending: busy, action: unlink)
        }
      }
    }
  }

  private func unlink() {
    guard let api, !busy else { return }
    busy = true
    // TODO(strings): account.oidc.unlinkFailed "Couldn't unlink {provider}"
    launchShowing(snackbar, Str.webCommonErrorUnknown) {
      defer { busy = false }
      try await api.account.oidc.unlink()
      loader.reload()
    }
  }
}

// MARK: Sessions

/// Where the account is signed in, each but this one with a way to sign it
/// out, and signing the others out at once, as the web's Sessions.
private struct SessionsSection: View {
  let sessions: Loader<[Session]>
  @State private var signingOut: Session?
  @State private var signingOutOthers = false
  @Environment(\.api) private var api
  @Environment(\.snackbar) private var snackbar

  var body: some View {
    SettingsSection(Str.accountSessionsTitle) {
      switch sessions.state {
      case .loading:
        Skeleton(radius: MatineeKit.Radius.xl).frame(height: 64)
      case .failed(let message, let disconnected):
        ErrorSection(Str.accountSessionsFailed, message, disconnected: disconnected, onRetry: sessions.reload)
      case .ready(let list):
        ListBlock {
          ForEach(list, id: \.id) { item in
            SessionRow(session: item) { signingOut = item }
          }
        }
        if list.contains(where: { !$0.current }) {
          MatineeKit.MatineeButton(
            Str.webUsersMenuSignOutOthers, icon: .logOut, look: .outline, fullWidth: true
          ) { signingOutOthers = true }
        }
      }
    }
    .confirmDialog(
      isPresented: Binding(get: { signingOut != nil }, set: { if !$0 { signingOut = nil } }),
      // TODO(strings): account.sessions.signOutTitle "Sign out {session}?", account.sessions.signOutDescription
      title: signingOut.map { Str.accountSessionsSignOutNamed(sessionName($0)) } ?? Str.shellSignOut,
      confirm: Str.shellSignOut
    ) {
      guard let api, let item = signingOut else { return }
      signingOut = nil
      launchShowing(snackbar, Str.accountSessionsSignOutFailed) {
        try await api.account.sessions.revoke(id: item.id)
        sessions.reload()
      }
    }
    .confirmDialog(
      isPresented: $signingOutOthers, title: Str.webUsersSignOutOwnTitle,
      message: Str.webUsersSignOutOwnDescription, confirm: Str.webUsersSignOutOwnConfirm
    ) {
      guard let api else { return }
      launchShowing(snackbar, Str.accountSessionsSignOutFailed) {
        let ended = try await api.account.sessions.revokeOthers()
        snackbar.show(Str.webUsersEndedOwnSessions(ended.revoked))
        sessions.reload()
      }
    }
    #if DEBUG
      .onAppear { if debugOpens("signout-others") { signingOutOthers = true } }
    #endif
  }
}

private struct SessionRow: View {
  let session: Session
  let onSignOut: () -> Void

  var body: some View {
    let name = sessionName(session)
    AccountItemRow(icon: platformIcon(session.platform), title: name, detail: detail) {
      if session.current {
        MatineeKit.Badge(Str.accountSessionsThisDevice, look: .secondary)
      }
    } trailing: {
      if !session.current {
        MatineeKit.RoundIconButton(.logOut, label: Str.accountSessionsSignOutNamed(name), look: .ghost, action: onSignOut)
      }
    }
  }

  /// What it is when it has a name of its own, when it was last used, and when it signed in.
  private var detail: String {
    [
      session.deviceName != nil ? session.platform.map { Str.accountDeviceApp(platformLabel($0)) } : nil,
      lastActive,
      Str.accountSessionsSignedIn(formatInstant(session.createdAt)),
    ].compactMap { $0 }.joined(separator: " · ")
  }

  /// The server moves a session's last use at most hourly, so anything more
  /// recent only says "recently", as the web's.
  private var lastActive: String? {
    if session.current { return Str.webUsersActiveNow }
    guard let seen = parseInstant(session.lastSeenAt) else { return nil }
    if Date.now.timeIntervalSince(seen) < 3600 { return Str.webUsersActiveRecently }
    let relative = RelativeDateTimeFormatter()
    relative.locale = .app
    return Str.webUsersLastSeen(relative.localizedString(for: seen, relativeTo: .now))
  }
}
