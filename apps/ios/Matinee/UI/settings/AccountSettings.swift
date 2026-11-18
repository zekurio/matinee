import MatineeCore
import MatineeKit
import Nuke
import PhotosUI
import SwiftUI
import UIKit

/*
 * Settings, Account, as Android's: signing in another device, then the
 * places the account is signed in, each its own card with a way to sign
 * it out. Before them, what Android's page lacks, in the manner of the
 * rows around it: the profile (picture, display name, and what others
 * see), and the passkeys and the single sign-on account the person signs
 * in with.
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
        ListRow(Str.linkTitle, subtitle: Str.linkRowDescription, icon: .scanQrCode, action: nav.linkDevice)
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

/// The picture and the name others see, and what the profile shows them.
private struct ProfileSection: View {
  let user: User
  @State private var sharing = SharingSave()
  @Environment(\.api) private var api
  @Environment(\.snackbar) private var snackbar
  @Environment(MatineeSession.self) private var session

  var body: some View {
    let shown = sharing.shown(user)
    SettingsSection(Str.iosAccountProfileTitle) {
      HStack(alignment: .center, spacing: Space.s4) {
        AvatarPicker(user: user)
        DisplayNameField(user: user)
      }
      ListBlock {
        SwitchRow(
          Str.iosAccountSharingFavorites,
          isOn: Binding(
            get: { shown.favorites },
            set: { sharing.save(.init(favorites: $0), api: api, session: session, snackbar: snackbar) }))
        SwitchRow(
          Str.iosAccountSharingStats,
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
    launchShowing(snackbar, Str.iosAccountSharingFailed) { [self] in
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
      ProfileAvatar(user.name, url: user.avatarId.flatMap { api?.paths.avatar($0) }, size: 64)
        .overlay {
          if busy {
            Circle().fill(.black.opacity(0.5))
            Spinner(size: 20, tint: .white)
          }
        }
        .overlay(alignment: .bottomTrailing) {
          LucideIcon(.imageUp, size: 14, tint: palette.foreground, scales: false)
            .frame(width: 26, height: 26)
            .background(palette.secondary, in: Circle())
            .overlay { Circle().strokeBorder(palette.background, lineWidth: 2) }
            .offset(x: 2, y: 2)
        }
    }
    .disabled(busy)
    .accessibilityLabel(Str.iosAccountPictureChange)
    .dropdownMenu(isPresented: $menu) {
      MenuItem(Str.iosImagesFromPhotos, icon: .imageUp) { picking = true }
      if user.avatarId != nil {
        MenuItem(Str.iosAccountPictureRemove, icon: .trash, destructive: true) {
          change { api in try await api.account.avatar.remove() }
        }
      }
    }
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
    launchShowing(snackbar, Str.iosAccountPictureChangeFailed) {
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
    FormField(Str.webOidcFieldDisplayName) {
      MatineeTextField(
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
        snackbar.post(ToastMessage(Str.iosAccountDisplayNameSaveFailed(describeFailure(error)), kind: .error))
      }
    }
  }
}

// MARK: Passkeys and single sign-on

/// The icon tile at the start of a card of the account's, as Android's
/// session card: 40 square, `rounded-lg`, `bg-secondary`, a 20-point glyph.
struct RowIcon: View {
  let icon: Lucide
  var size: CGFloat = 40
  @Environment(\.palette) private var palette

  init(_ icon: Lucide, size: CGFloat = 40) {
    self.icon = icon
    self.size = size
  }

  var body: some View {
    LucideIcon(icon, size: 20, tint: palette.mutedForeground)
      .frame(width: size, height: size)
      .background(palette.secondary, in: RoundedRectangle.kit(Radius.lg))
  }
}

/// A card of the account's, as Android's SessionRow: a bordered block of
/// its own, 14 in, its tile, a name in `text-base` with a badge after it
/// and a line under it in `text-13px` muted, and what can be done with it
/// at its end.
struct AccountItemRow<Badge: View, Trailing: View>: View {
  let icon: Lucide
  let title: String
  let detail: String?
  @ViewBuilder let badge: () -> Badge
  @ViewBuilder let trailing: () -> Trailing
  @Environment(\.palette) private var palette
  @Environment(\.dynamicTypeSize) private var dynamicType

  var body: some View {
    HStack(spacing: Space.s3_5) {
      RowIcon(icon)
      VStack(alignment: .leading, spacing: 0) {
        // At the large text sizes the badge goes under the name rather than squeeze it.
        if dynamicType.isAccessibilitySize {
          Text(title).textStyle(.base).foregroundStyle(palette.foreground)
          badge()
        } else {
          HStack(spacing: Space.s2) {
            Text(title).textStyle(.base).foregroundStyle(palette.foreground).lineLimit(1)
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
    .padding(Space.s3_5)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(palette.foreground.opacity(0.02), in: PanelShape)
    .overlay { PanelShape.strokeBorder(palette.border) }
  }
}

extension AccountItemRow where Badge == EmptyView {
  init(icon: Lucide, title: String, detail: String?, @ViewBuilder trailing: @escaping () -> Trailing) {
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
      ForEach(passkeys, id: \.id) { passkey in
        AccountItemRow(
          icon: .keyRound, title: passkey.name ?? Str.iosAccountPasskeysUnnamed, detail: detail(passkey)
        ) {
          if removable {
            RoundIconButton(
              .trash, label: passkey.name.map(Str.iosAccountPasskeysRemoveNamed) ?? Str.iosAccountPasskeysRemove,
              look: .ghost, size: 40, iconSize: 18
            ) { removing = passkey }
          }
        }
      }
    }
    .confirmDialog(
      isPresented: Binding(get: { removing != nil }, set: { if !$0 { removing = nil } }),
      title: removing?.name.map(Str.iosAccountPasskeysRemoveTitle) ?? Str.iosAccountPasskeysRemoveTitleUnnamed,
      message: Str.iosAccountPasskeysRemoveDescription, confirm: Str.iosAccountPasskeysRemove
    ) {
      guard let api, let passkey = removing else { return }
      removing = nil
      launchShowing(snackbar, Str.iosAccountPasskeysRemoveFailed) {
        try await api.account.passkeys.remove(id: passkey.id)
        loader.reload()
      }
    }
  }

  /// Whether it's synced, and when it was last used, or added when it never was, as the web's.
  private func detail(_ passkey: Passkey) -> String {
    [
      passkey.backedUp ? Str.iosAccountPasskeysSynced : nil,
      passkey.lastUsedAt.map { Str.iosAccountPasskeysUsed(relativeTime($0)) }
        ?? Str.iosAccountPasskeysAdded(formatInstant(passkey.createdAt)),
    ].compactMap(\.self).joined(separator: " · ")
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
      AccountItemRow(
        icon: .link, title: account.label ?? provider,
        detail: account.signsIn
          ? Str.iosAccountOidcLinked(formatInstant(account.createdAt)) : Str.iosAccountOidcStale(provider)
      ) {
        MatineeButton(Str.iosAccountOidcUnlink, look: .ghost, size: .md, pending: busy, action: unlink)
      }
    }
  }

  private func unlink() {
    guard let api, !busy else { return }
    busy = true
    launchShowing(snackbar, Str.iosAccountOidcUnlinkFailed(provider)) {
      defer { busy = false }
      try await api.account.oidc.unlink()
      loader.reload()
    }
  }
}

// MARK: Sessions

/// Where the account is signed in, as Android's: the heading, then each
/// place a card of its own, the page's 28 apart, each but this one with a
/// way to sign it out at once, as Android's. Signing the others out
/// together, which Android lacks, follows in a block of its own, as
/// Android puts Remove all downloads, and asks first.
private struct SessionsSection: View {
  let sessions: Loader<[Session]>
  @State private var signingOutOthers = false
  @Environment(\.api) private var api
  @Environment(\.snackbar) private var snackbar
  @Environment(\.palette) private var palette

  var body: some View {
    VStack(alignment: .leading, spacing: SETTINGS_SPACING) {
      Text(Str.accountSessionsTitle).pageTitleStyle().foregroundStyle(palette.foreground)
        .accessibilityAddTraits(.isHeader)
      switch sessions.state {
      case .loading:
        Skeleton(radius: Radius.xl).frame(height: 70)
      case .failed(let message, let disconnected):
        ErrorSection(Str.accountSessionsFailed, message, disconnected: disconnected, onRetry: sessions.reload)
      case .ready(let list):
        ForEach(list, id: \.id) { item in
          SessionRow(session: item) { signOut(item) }
        }
        if list.contains(where: { !$0.current }) {
          ListBlock {
            ListRow(Str.webUsersMenuSignOutOthers, icon: .logOut, destructive: true) { signingOutOthers = true }
          }
        }
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
  }

  private func signOut(_ item: Session) {
    guard let api else { return }
    launchShowing(snackbar, Str.accountSessionsSignOutFailed) {
      try await api.account.sessions.revoke(id: item.id)
      sessions.reload()
    }
  }
}

private struct SessionRow: View {
  let session: Session
  let onSignOut: () -> Void

  var body: some View {
    let name = sessionName(session)
    AccountItemRow(icon: platformIcon(session.platform), title: name, detail: detail) {
      if session.current {
        Badge(Str.accountSessionsThisDevice, look: .secondary)
      }
    } trailing: {
      if !session.current {
        RoundIconButton(
          .logOut, label: Str.accountSessionsSignOutNamed(name), look: .ghost, size: 40, iconSize: 18,
          action: onSignOut)
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
