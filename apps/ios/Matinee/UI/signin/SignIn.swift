import AuthenticationServices
import MatineeCore
import SwiftUI
import UIKit

/*
 * SignIn.kt: connecting to a server by its address, and signing in to it,
 * in the system's web sign-in sheet or with a code. They look like the
 * web's auth screen: the logo at the top, the form below the middle.
 */

/// Empty space of a fixed height between the parts of a form, as Android's `Gap`.
struct Gap: View {
  let height: CGFloat
  init(_ height: CGFloat) { self.height = height }
  var body: some View { Color.clear.frame(height: height) }
}

/// The logo, in the top corner of the sign-in screens.
private struct Brand: View {
  var body: some View {
    Logo(height: 22).padding(.horizontal, 26).padding(.vertical, 24)
  }
}

/// The web's auth screen: the logo at the top, the form below the middle.
/// It scrolls, so the keyboard and large text never hide the form, and the
/// logo scrolls with it rather than lie over it.
struct AuthLayout<Content: View>: View {
  @ViewBuilder let content: () -> Content

  var body: some View {
    GeometryReader { proxy in
      ScrollView {
        VStack(spacing: 0) {
          Brand().frame(maxWidth: .infinity, alignment: .leading)
          Spacer(minLength: 0)
          VStack(alignment: .leading, spacing: 0, content: content)
            .frame(maxWidth: 420)
            .padding(.horizontal, 26)
            .padding(.vertical, 24)
          Spacer(minLength: 0)
          // As tall as the logo's row, so the form sits in the middle of the screen, as on Android.
          Color.clear.frame(height: 70)
        }
        .frame(maxWidth: .infinity, minHeight: proxy.size.height)
      }
      .scrollDismissesKeyboard(.interactively)
      .scrollBounceBehavior(.basedOnSize)
      .statusBarScrim()
    }
  }
}

/// A button's content across the whole width of the form.
private struct Wide<Content: View>: View {
  @ViewBuilder let content: () -> Content
  var body: some View {
    HStack(spacing: 8, content: content).multilineTextAlignment(.center).frame(maxWidth: .infinity)
  }
}

/// Typing a server's address. `canCancel` while adding one, with one in use to go back to.
struct ConnectScreen: View {
  var canCancel = false
  @Environment(MatineeSession.self) private var session
  @Environment(\.palette) private var palette
  @State private var address = ""
  @State private var connector = ServerConnect()

  var body: some View {
    AuthLayout {
      Text(Str.connectTitle).textStyle(.headlineMedium).accessibilityAddTraits(.isHeader)
      Gap(8)
      Text(Str.connectDescription).textStyle(.bodyMedium).foregroundStyle(palette.muted)
      Gap(24)
      MatineeTextField($address, placeholder: Str.connectPlaceholder, leadingIcon: .server, isError: connector.error != nil)
        .keyboardType(.URL)
        .textContentType(.URL)
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .submitLabel(.go)
        .onSubmit(connect)
        .disabled(connector.busy)
        .accessibilityLabel(Str.connectPlaceholder)
      if let error = connector.error {
        Gap(8)
        Text(error).textStyle(.bodySmall).foregroundStyle(palette.danger)
        if connector.local {
          Gap(8)
          LocalNetworkHint()
        }
      }
      Gap(16)
      Button(action: connect) {
        Wide {
          if connector.busy { ProgressView().controlSize(.small).tint(palette.accentForeground) }
          Text(Str.connectButton)
        }
      }
      .buttonStyle(.matinee())
      .disabled(address.trimmingCharacters(in: .whitespaces).isEmpty || connector.busy)
      if canCancel {
        Gap(32)
        BackToServer().frame(maxWidth: .infinity)
      }
    }
  }

  private func connect() {
    guard !address.trimmingCharacters(in: .whitespaces).isEmpty else { return }
    Task { await connector.connect(session, address) }
  }
}

/// Signing in to the server the person connected to: in the browser, or with a code.
struct SignInScreen: View {
  let server: String
  let config: AuthConfig
  let adding: Bool
  @Environment(MatineeSession.self) private var session
  @Environment(SignInErrors.self) private var errors
  @Environment(\.palette) private var palette
  @State private var withCode = false
  @State private var browser: SystemBrowserAuthenticator?

  var body: some View {
    if withCode {
      DeviceCodeSignIn { withMotion(Motion.enter) { withCode = false } }
    } else {
      AuthLayout {
        Text(Str.signinTitle).textStyle(.headlineMedium).accessibilityAddTraits(.isHeader)
        Gap(8)
        Text(Str.signinServer(server)).textStyle(.bodyMedium).foregroundStyle(palette.muted)
        Gap(28)
        if config.setup != nil {
          Text(Str.signinSetup).textStyle(.bodyMedium).foregroundStyle(palette.muted)
          Gap(16)
        }
        Button(action: signInInBrowser) {
          Wide {
            if browser != nil {
              ProgressView().controlSize(.small).tint(palette.accentForeground)
            } else {
              LucideIcon(config.passkeys ? .keyRound : .logIn, size: 18)
            }
            Text(browserLabel)
          }
        }
        .buttonStyle(.matinee())
        .disabled(browser != nil)
        Gap(10)
        Button {
          errors.browser = nil
          withMotion(Motion.enter) { withCode = true }
        } label: {
          Wide {
            LucideIcon(.smartphone, size: 18)
            Text(Str.signinWithCode)
          }
        }
        .buttonStyle(.matinee(.ghost))
        if let error = errors.browser {
          Gap(12)
          Text(error).textStyle(.bodySmall).foregroundStyle(palette.danger)
            .multilineTextAlignment(.center).frame(maxWidth: .infinity)
        }
        Gap(32)
        // A server being added goes back to the one in use; a saved one offers the others.
        Group {
          if adding { BackToServer() } else { ChangeServerButton() }
        }
        .frame(maxWidth: .infinity)
      }
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

/// The OAuth device grant: show a QR code and the code it holds, and wait
/// while someone signed in approves this device. A phone's camera opens the
/// QR code on the server's /link page; the app reads it under Settings,
/// Account. Typing the code at /link works too.
private struct DeviceCodeSignIn: View {
  let onBack: () -> Void
  @Environment(MatineeSession.self) private var session
  @Environment(\.windowSize) private var window
  @State private var flow = DeviceCodeState()

  var body: some View {
    Group {
      // A tablet on its side: the steps on the left, the QR code beside them.
      if window.width >= 720 && window.height >= 480 && window.width > window.height {
        HStack(alignment: .center, spacing: 64) {
          VStack(alignment: .leading, spacing: 0) {
            CodeHeading()
            Gap(36)
            details
          }
          .frame(maxWidth: .infinity, alignment: .leading)
          CodeQr(code: flow.code, size: 288)
        }
        .frame(maxWidth: 920)
        .padding(.horizontal, 56)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .overlay(alignment: .topLeading) { Brand() }
      } else {
        AuthLayout {
          CodeHeading()
          Gap(28)
          CodeQr(code: flow.code, size: 224).frame(maxWidth: .infinity)
          Gap(28)
          details
        }
      }
    }
    .task(id: flow.attempt) { await flow.run(session, renewExpired: true) }
  }

  @ViewBuilder private var details: some View {
    let retry: (() -> Void)? = flow.code == nil ? { flow.newCode() } : nil
    // Only a code that never came needs a new start; a poll that failed tries again on its own.
    CodeDetails(code: flow.code, error: flow.error, onRetry: retry)
    Gap(24)
    if let code = flow.code, let url = URL(string: code.verificationUriComplete) {
      Link(destination: url) {
        Wide {
          LucideIcon(.link, size: 18)
          Text(Str.signinCodeOpen)
        }
      }
      .buttonStyle(.matinee(.outline))
      Gap(12)
    }
    Button(action: onBack) { Wide { Text(Str.signinCodeBack) } }
      .buttonStyle(.matinee(.ghost))
  }
}

private struct CodeHeading: View {
  @Environment(\.palette) private var palette

  var body: some View {
    Text(Str.signinCodeTitle).textStyle(.headlineMedium).accessibilityAddTraits(.isHeader)
    Gap(8)
    Text(Str.signinCodeScan).textStyle(.bodyMedium).foregroundStyle(palette.muted)
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
      ProgressView().controlSize(.large).tint(palette.accent).frame(width: size, height: size)
    }
  }
}

/// The code to type, where to type it, and whether it's still waiting.
private struct CodeDetails: View {
  let code: DeviceCode?
  let error: String?
  let onRetry: (() -> Void)?
  @Environment(\.palette) private var palette
  @Environment(\.windowSize) private var window
  @ScaledMetric(relativeTo: .largeTitle) private var scale: CGFloat = 1

  var body: some View {
    if let code {
      // The page without its scheme: shorter, and what people type anyway.
      Text(Str.signinCodeEnter(code.verificationUri.components(separatedBy: "://").last ?? code.verificationUri))
        .textStyle(.bodyMedium).foregroundStyle(palette.muted)
      Gap(4)
      // Monospaced, as Android draws it, so the letters can't be mistaken for each other.
      Text(code.userCode)
        .font(.system(size: (window.width >= 600 ? 44 : 36) * min(scale, 1.6), weight: .semibold, design: .monospaced))
        .tracking(4)
        .lineLimit(1)
        .minimumScaleFactor(0.5)
        .textSelection(.enabled)
        .accessibilityLabel(code.userCode.map(String.init).joined(separator: " "))
      Gap(20)
      HStack(spacing: 10) {
        ProgressView().controlSize(.mini).tint(palette.muted)
        Text(Str.signinCodeWaiting).textStyle(.bodySmall).foregroundStyle(palette.muted)
      }
    } else if error == nil {
      Text(Str.signinCodeLoading).textStyle(.bodyMedium).foregroundStyle(palette.muted)
    }
    if let error {
      Gap(12)
      Text(error).textStyle(.bodySmall).foregroundStyle(palette.danger)
      if let onRetry {
        Gap(8)
        Button(action: onRetry) { Wide { Text(Str.commonRetry) } }
          .buttonStyle(.matinee(.outline))
      }
    }
  }
}
