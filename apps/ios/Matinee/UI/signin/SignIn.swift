import AuthenticationServices
import MatineeCore
import MatineeKit
import SwiftUI
import UIKit

/*
 * SignIn.kt: connecting to a server by its address, and signing in to it,
 * in the system's web sign-in sheet or with a code. They look like the
 * web's login page (apps/web/src/components/auth-screen.tsx): the logo in
 * the top corner, the form in a narrow column a little above the middle,
 * the server's login backdrop behind it.
 */

/// Empty space of a fixed height between the parts of a form, as Android's `Gap`.
struct Gap: View {
  let height: CGFloat
  init(_ height: CGFloat) { self.height = height }
  var body: some View { Color.clear.frame(height: height).accessibilityHidden(true) }
}

/// The logo, in the top corner of the sign-in screens: the web's `text-2xl`
/// one, `top-8 left-6`, and `left-10` where there's room.
private struct Brand: View {
  @Environment(\.horizontalSizeClass) private var sizeClass

  /// How tall the logo's row is, which the form is lifted by at the bottom too.
  static func rowHeight(_ sizeClass: UserInterfaceSizeClass?) -> CGFloat { top(sizeClass) + 24.5 }
  private static func top(_ sizeClass: UserInterfaceSizeClass?) -> CGFloat {
    sizeClass == .regular ? Space.s8 : Space.s6
  }

  var body: some View {
    // The drawing is 24.5 tall for a word 24 to its baseline. Its own colors, never the accent's.
    Image("logo").resizable().scaledToFit().frame(height: 24.5)
      .accessibilityLabel(Str.appName)
      .padding(.top, Self.top(sizeClass))
      .padding(.horizontal, sizeClass == .regular ? Space.s10 : Space.s6)
      .frame(maxWidth: .infinity, alignment: .leading)
  }
}

/// The web's auth screen: the logo at the top, the form in a column at
/// most 360 wide, a little above the middle, as the web lifts it. It
/// scrolls, so the keyboard and large text never hide the form, and the
/// logo scrolls with it rather than lie over it. With the keyboard up the
/// form centers in what's left above it, so the field stays in sight.
/// Clear behind, for a backdrop.
struct AuthLayout<Content: View>: View {
  @ViewBuilder let content: () -> Content
  @Environment(\.horizontalSizeClass) private var sizeClass

  var body: some View {
    GeometryReader { proxy in
      ScrollView {
        VStack(spacing: 0) {
          Brand()
          Spacer(minLength: Space.s12)
          VStack(alignment: .leading, spacing: 0, content: content)
            .frame(maxWidth: 420, alignment: .leading)
            .padding(.horizontal, Space.s6)
          Spacer(minLength: Space.s12)
          // The web's `pb-[calc(3rem+8vh)]` against its `pt-24`: what the logo's row takes, and 8% more.
          Color.clear.frame(height: Brand.rowHeight(sizeClass) + proxy.size.height * 0.08)
        }
        .frame(maxWidth: .infinity, minHeight: proxy.size.height)
      }
      .scrollDismissesKeyboard(.interactively)
      .scrollBounceBehavior(.basedOnSize)
    }
  }
}

/// A sign-in screen's title and the line under it: the web's `text-2xl
/// font-semibold tracking-tight` over `text-sm` muted.
struct AuthHeading: View {
  let title: String
  let description: String?
  @Environment(\.palette) private var palette

  init(_ title: String, description: String? = nil) {
    self.title = title
    self.description = description
  }

  var body: some View {
    VStack(alignment: .leading, spacing: Space.s2) {
      // Android's `headlineMedium`.
      Text(title)
        .textStyle(.px26, weight: .bold, tracking: .tight)
        .foregroundStyle(palette.foreground)
        .accessibilityAddTraits(.isHeader)
      if let description {
        Text(description).textStyle(.sm).foregroundStyle(palette.mutedForeground)
      }
    }
    .fixedSize(horizontal: false, vertical: true)
  }
}

/// A form's error, in the danger color under what it's about, read out by VoiceOver when it comes.
private struct FieldError: View {
  let message: String
  @Environment(\.palette) private var palette

  var body: some View {
    Text(message)
      .textStyle(.px13)
      .foregroundStyle(palette.destructive)
      .fixedSize(horizontal: false, vertical: true)
      .onAppear { AccessibilityNotification.Announcement(message).post() }
      .onChange(of: message) { _, now in AccessibilityNotification.Announcement(now).post() }
  }
}

/// Typing a server's address. `canCancel` while adding one, with one in use to go back to.
///
/// Servers found on the local network, should the phone ever look for
/// them as Android's TV does (`ServerDiscovery`), would go under the
/// Connect button as a list, each connecting with `connector.connect(…,
/// name:)`; the form above stays as it is.
struct ConnectScreen: View {
  var canCancel = false
  @Environment(MatineeSession.self) private var session
  @State private var address = ""
  @State private var connector = ServerConnect()

  var body: some View {
    let blank = address.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    AuthLayout {
      AuthHeading(Str.connectTitle, description: Str.connectDescription)
      Gap(Space.s8)
      MatineeTextField(
        Str.connectPlaceholder, text: $address, icon: .server, isError: connector.error != nil
      )
      .keyboardType(.URL)
      .textContentType(.URL)
      .textInputAutocapitalization(.never)
      .autocorrectionDisabled()
      .submitLabel(.go)
      // Not disabled while it connects: the keyboard stays up, and the form doesn't jump.
      .onSubmit(connect)
      .accessibilityLabel(Str.iosConnectAddress)
      .accessibilityHint(Str.connectDescription)
      if let error = connector.error {
        Gap(Space.s2)
        FieldError(message: error)
      }
      Gap(Space.s4)
      MatineeButton(Str.connectButton, pending: connector.busy, fullWidth: true, action: connect)
        .disabled(blank)
      if connector.local {
        Gap(Space.s4)
        LocalNetworkHint()
      }
      if canCancel {
        Gap(Space.s8)
        BackToServer().frame(maxWidth: .infinity)
      }
    }
    // Typing again puts away what the last try said.
    .onChange(of: address) { if connector.error != nil, !connector.busy { connector.clearError() } }
    .onReturnToFront { Task { await connector.retryLocal(session) } }
  }

  private func connect() {
    guard !address.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
    Task { await connector.connect(session, address) }
  }
}

/// Signing in to the server the person connected to: in the browser, or
/// with a code. In the server's own accent, and over its login backdrop,
/// before anyone's signed in, as its web login page is.
struct SignInScreen: View {
  let server: String
  let config: AuthConfig
  let adding: Bool
  @Environment(MatineeSession.self) private var session
  @State private var withCode = Self.startWithCode

  /// `-dev.signin code` opens the code at once, for scripted screenshots, in debug builds.
  private static var startWithCode: Bool {
    #if DEBUG
      UserDefaults.standard.string(forKey: "dev.signin") == "code"
    #else
      false
    #endif
  }

  var body: some View {
    ZStack {
      if withCode {
        DeviceCodeSignIn {
          withMotion(Motion.enter) { withCode = false }
        }
        .transition(.opacity)
      } else {
        BrowserSignInForm(server: server, config: config, adding: adding) {
          withMotion(Motion.enter) { withCode = true }
        }
        .transition(.opacity)
      }
    }
    .background { LoginBackdropWall(api: session.signInApi(), settings: config.loginBackdrop) }
    .matineePalette(MatineeTheme(accentLight: config.themeAccents.light, accentDark: config.themeAccents.dark))
  }
}

/// The ways in: the server's sign-in page in the browser sheet, or a code.
private struct BrowserSignInForm: View {
  let server: String
  let config: AuthConfig
  let adding: Bool
  let onCode: () -> Void
  @Environment(MatineeSession.self) private var session
  @Environment(SignInErrors.self) private var errors
  @Environment(\.palette) private var palette
  @State private var browser: SystemBrowserAuthenticator?

  var body: some View {
    AuthLayout {
      AuthHeading(Str.signinTitle, description: Str.signinServer(server))
      Gap(Space.s8)
      if config.setup != nil {
        Text(Str.signinSetup).textStyle(.sm).foregroundStyle(palette.mutedForeground)
        Gap(Space.s4)
      }
      VStack(spacing: Space.s2_5) {
        MatineeButton(
          browserLabel, icon: config.passkeys || config.oidc == nil ? .keyRound : .logIn, pending: browser != nil,
          fullWidth: true, action: signInInBrowser)
        MatineeButton(Str.signinWithCode, icon: .smartphone, look: .ghost, fullWidth: true) {
          errors.browser = nil
          onCode()
        }
      }
      if let error = errors.browser {
        Gap(Space.s4)
        Callout(error, icon: .circleAlert, look: .destructive)
          .onAppear { AccessibilityNotification.Announcement(error).post() }
      }
      Gap(Space.s8)
      // A server being added goes back to the one in use; a saved one offers the others.
      Group {
        if adding { BackToServer() } else { ChangeServerButton() }
      }
      .frame(maxWidth: .infinity)
    }
  }

  private var browserLabel: String {
    if !config.passkeys, let oidc = config.oidc { return Str.signinOidc(oidc.displayName) }
    return Str.signinBrowser
  }

  /// The server's /authorize page in the system's web sign-in sheet, which
  /// hands back the code at matinee://auth/callback.
  private func signInInBrowser() {
    errors.browser = nil
    let authenticator = SystemBrowserAuthenticator(presentation: SceneAnchor())
    browser = authenticator
    Task {
      defer { browser = nil }
      do {
        try await session.browserSignIn(using: authenticator)
      } catch {
        errors.browser = browserFailure(error)
      }
    }
  }
}

/// What went wrong with a browser sign-in, or nil when the person closed the sheet.
func browserFailure(_ error: any Error) -> String? {
  if let error = error as? ASWebAuthenticationSessionError, error.code == .canceledLogin { return nil }
  if error is CancellationError { return nil }
  switch (error as? URLError)?.code {
  case .cancelled?: return nil
  case .userAuthenticationRequired?: return Str.signinWrongState
  default: break
  }
  if let error = error as? ApiException { return error.message }
  return Str.signinFailed
}

/// The window the web sign-in sheet shows over.
final class SceneAnchor: NSObject, ASWebAuthenticationPresentationContextProviding {
  func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
    MainActor.assumeIsolated {
      let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
      return scenes.flatMap(\.windows).first(where: \.isKeyWindow) ?? scenes.first.map { UIWindow(windowScene: $0) }
        ?? ASPresentationAnchor()
    }
  }
}

/// The browser sign-in's failure, from the sheet or from a matinee:// link
/// the app was opened with, for the sign-in screen to show.
@Observable final class SignInErrors {
  var browser: String?
}

/// The OAuth device grant: the code, and waiting while someone signed in
/// approves this device at the server's /link page. An iPad also shows the
/// code as a QR code, for a phone to scan: with its camera, which opens
/// /link, or in the app under Settings, Account. An iPhone shows no QR
/// code, as Android's phone doesn't, since the phone that would scan it is
/// usually the one signing in; it has the code to type and the link page.
private struct DeviceCodeSignIn: View {
  let onBack: () -> Void
  @Environment(MatineeSession.self) private var session
  @State private var flow = DeviceCodeState()

  private var qr: Bool { UIDevice.current.userInterfaceIdiom == .pad }

  var body: some View {
    GeometryReader { proxy in
      // An iPad on its side, with room: the steps on the left, the QR code beside them.
      if qr, proxy.size.width >= 720, proxy.size.width > proxy.size.height {
        sideBySide
      } else {
        AuthLayout {
          CodeHeading(qr: qr)
          Gap(Space.s8)
          if qr {
            CodeQr(code: flow.code, size: 224).frame(maxWidth: .infinity)
            Gap(Space.s6)
          }
          details
        }
      }
    }
    .task(id: flow.attempt) { await flow.run(session, renewExpired: true) }
  }

  private var sideBySide: some View {
    ScrollView {
      VStack(spacing: 0) {
        Brand()
        Spacer(minLength: Space.s12)
        HStack(alignment: .center, spacing: Space.s16) {
          VStack(alignment: .leading, spacing: 0) {
            CodeHeading(qr: true)
            Gap(Space.s8)
            details
          }
          .frame(maxWidth: 380, alignment: .leading)
          CodeQr(code: flow.code, size: 288)
        }
        .padding(.horizontal, Space.s12)
        Spacer(minLength: Space.s12)
        Color.clear.frame(height: Brand.rowHeight(.regular))
      }
      .containerRelativeFrame(.vertical, alignment: .center) { length, _ in length }
      .frame(maxWidth: .infinity)
    }
    .scrollBounceBehavior(.basedOnSize)
  }

  @ViewBuilder private var details: some View {
    // Only a code that never came needs a new start; a poll that failed tries again on its own.
    CodeDetails(code: flow.code, error: flow.error, afterQr: qr, onRetry: flow.code == nil ? { flow.newCode() } : nil)
    Gap(Space.s6)
    VStack(spacing: Space.s3) {
      if let code = flow.code, let url = URL(string: code.verificationUriComplete) {
        LinkPageButton(url: url)
      }
      MatineeButton(Str.signinCodeBack, look: .ghost, fullWidth: true, action: onBack)
    }
  }
}

/// Opens the link page with the code filled in, in the browser: for signing
/// in on this device with a passkey the browser already has.
private struct LinkPageButton: View {
  let url: URL
  @Environment(\.openURL) private var openURL

  var body: some View {
    MatineeButton(Str.signinCodeOpen, icon: .link, look: .outline, fullWidth: true) { openURL(url) }
  }
}

private struct CodeHeading: View {
  let qr: Bool

  var body: some View {
    AuthHeading(
      qr ? Str.signinCodeTitle : Str.signinCodeTitleTyped,
      description: qr ? Str.signinCodeScan : Str.signinCodeApprove)
  }
}

/// The QR code of the link page with the code in it, or a spinner while there's no code yet.
private struct CodeQr: View {
  let code: DeviceCode?
  let size: CGFloat
  @Environment(\.palette) private var palette

  var body: some View {
    if let code {
      QrCode(code.verificationUriComplete, label: Str.signinCodeQr(code.userCode), size: size)
    } else {
      Spinner(size: 32, tint: palette.accent).frame(width: size, height: size)
    }
  }
}

/// The code to type, where to type it, and whether it's still waiting, on
/// a card. `afterQr` words it as the other way in, under a QR code.
private struct CodeDetails: View {
  let code: DeviceCode?
  let error: String?
  let afterQr: Bool
  let onRetry: (() -> Void)?
  @Environment(\.palette) private var palette
  @Environment(\.horizontalSizeClass) private var sizeClass
  /// The spinners beside a line of text grow with it.
  @ScaledMetric(relativeTo: .footnote) private var spinner: CGFloat = 14

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      if let code {
        card(code)
      } else if error == nil {
        HStack(spacing: Space.s2_5) {
          Spinner(size: spinner, tint: palette.mutedForeground)
          Text(Str.signinCodeLoading).textStyle(.sm).foregroundStyle(palette.mutedForeground)
        }
      }
      if let error {
        Gap(Space.s3)
        Callout(error, icon: .circleAlert, look: .destructive) {
          if let onRetry {
            MatineeButton(Str.commonRetry, icon: .refreshCw, look: .outline, size: .sm, action: onRetry)
          }
        }
      }
    }
  }

  private func card(_ code: DeviceCode) -> some View {
    let shape = RoundedRectangle.kit(Radius.xl)
    // The page without its scheme: shorter, and what people type anyway.
    let page = code.verificationUri.components(separatedBy: "://").last ?? code.verificationUri
    return VStack(spacing: 0) {
      Text(afterQr ? Str.signinCodeEnter(page) : Str.signinCodeEnterOnly(page))
        .textStyle(.sm)
        .foregroundStyle(palette.mutedForeground)
        .multilineTextAlignment(.center)
        .fixedSize(horizontal: false, vertical: true)
        .padding(.horizontal, Space.s4)
        .padding(.top, Space.s4)
      // Monospaced, as the web sets a code, so no letter is taken for another.
      Text(code.userCode)
        .monoTextStyle(sizeClass == .regular ? .xl5 : .xl4, weight: .semibold, tracking: 0.08)
        .foregroundStyle(palette.foreground)
        .lineLimit(1)
        .minimumScaleFactor(0.4)
        .textSelection(.enabled)
        .padding(.horizontal, Space.s4)
        .padding(.top, Space.s2)
        .padding(.bottom, Space.s4)
        .accessibilityLabel(code.userCode.map(String.init).joined(separator: " "))
      Separator()
      HStack(spacing: Space.s2_5) {
        Spinner(size: spinner, tint: palette.mutedForeground)
        Text(Str.signinCodeWaiting).textStyle(.px13).foregroundStyle(palette.mutedForeground)
      }
      .padding(.vertical, Space.s3)
      .padding(.horizontal, Space.s4)
      .accessibilityElement(children: .combine)
    }
    .frame(maxWidth: .infinity)
    .background(palette.card, in: shape)
    .overlay { shape.strokeBorder(palette.border) }
  }
}
