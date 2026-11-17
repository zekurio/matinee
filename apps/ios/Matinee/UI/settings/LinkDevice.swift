@preconcurrency import AVFoundation
import MatineeCore
import MatineeKit
import SwiftUI
import UIKit

/*
 * LinkDevice.kt: signing in a TV or another app as this account, from
 * Settings, Account: the camera reads the QR code the device shows, or the
 * person types its code, and then approves it, as the web's /link page
 * does. The device notices on its next poll.
 *
 * The camera is AVFoundation's, with a metadata output that reads QR codes
 * as ZXing does on Android. A device without a camera, like the simulator,
 * gets only the field, as an Android TV does.
 *
 * Laid out as Android's LinkDeviceScreen, in the web's look
 * (device-link.tsx, device-card.tsx): the device in a bordered card with
 * its tile, whose account it joins, the code in the web's `font-mono`, and
 * Approve over Cancel, full width for a thumb.
 */

/// Signing in a TV or another app by its QR code or code, from Settings' Account page.
struct LinkDeviceScreen: View {
  // The code being checked, and the server its QR code named. Typed codes name none.
  @State private var code: String?
  @State private var from: String?
  @State private var typed = false

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 0) {
        if let code {
          ApproveStep(userCode: code, from: from, typed: typed) {
            withMotion(Motion.enter) {
              self.code = nil
              from = nil
            }
          }
          .id(code)
        } else {
          ScanStep { scanned, byHand in
            withMotion(Motion.enter) {
              code = scanned.userCode
              from = scanned.server
              typed = byHand
            }
          }
        }
      }
      .frame(maxWidth: 440)
      .frame(maxWidth: .infinity)
      .padding(.horizontal, Space.gutter)
      .padding(.top, Space.s2)
      .padding(.bottom, Space.s6)
    }
    .scrollDismissesKeyboard(.interactively)
    .topBar(Str.linkTitle)
  }
}

/// Whether this device has a camera to scan with.
@MainActor private var hasCamera: Bool {
  #if DEBUG
    // -dev.camera YES: as if it had one, to see the permission and a camera that won't start on the simulator.
    if UserDefaults.standard.bool(forKey: "dev.camera") { return true }
  #endif
  return ClientCapabilities.cameraLinking && AVCaptureDevice.default(for: .video) != nil
}

/// The camera, where the device has one, and the field for typing the code.
private struct ScanStep: View {
  let onCode: (ScannedCode, _ byHand: Bool) -> Void
  @Environment(\.palette) private var palette

  var body: some View {
    VStack(alignment: .leading, spacing: Space.s3) {
      if hasCamera {
        CameraScanner { onCode($0, false) }
        Text(Str.linkOrEnter).textStyle(.base, weight: .semibold, tracking: .tight)
          .foregroundStyle(palette.foreground)
          .accessibilityAddTraits(.isHeader)
          .padding(.top, Space.s5)
      } else {
        // No camera, as on a TV signing in another TV, or the simulator: only the code.
        Text(Str.linkEnterCode).textStyle(.sm).foregroundStyle(palette.mutedForeground)
      }
      CodeField { onCode(ScannedCode(userCode: $0, server: nil), true) }
    }
    #if DEBUG
      // -dev.scan TEXT: what a scanned QR code held, through the same path as the camera's.
      .onAppear {
        guard let text = UserDefaults.standard.string(forKey: "dev.scan") else { return }
        UserDefaults.standard.removeObject(forKey: "dev.scan")
        if let scanned = scannedCode(text) { onCode(scanned, false) }
      }
    #endif
  }
}

/// The field for the code a TV or app shows, `BCDF-GHJK`, and Continue.
private struct CodeField: View {
  let onCode: (String) -> Void
  @State private var text = ""
  @State private var tried = false
  @Environment(\.palette) private var palette

  var body: some View {
    let invalid = tried && UserCode.parse(text) == nil
    VStack(alignment: .leading, spacing: Space.s3) {
      VStack(alignment: .leading, spacing: Space.s1_5) {
        MatineeTextField(
          Str.linkCodePlaceholder, text: Binding(get: { text }, set: { text = String($0.prefix(9)) }),
          isError: invalid
        )
        .keyboardType(.asciiCapable)
        .textInputAutocapitalization(.characters)
        .autocorrectionDisabled()
        .textContentType(.oneTimeCode)
        .submitLabel(.go)
        .onSubmit(submit)
        .accessibilityLabel(Str.linkOrEnter)
        .accessibilityHint(invalid ? Str.linkCodeInvalid : "")
        if invalid {
          Text(Str.linkCodeInvalid).textStyle(.px13).foregroundStyle(palette.destructive)
            .accessibilityHidden(true)
        }
      }
      MatineeButton(Str.linkContinue, look: .secondary, fullWidth: true, action: submit)
        .disabled(text.trimmingCharacters(in: .whitespaces).isEmpty)
    }
  }

  private func submit() {
    tried = true
    if let parsed = UserCode.parse(text) { onCode(parsed) }
  }
}

private let ViewfinderShape = RoundedRectangle.kit(Radius.xl2)

/// A square of the camera's picture, once the person allows it, with what it found under it.
private struct CameraScanner: View {
  let onCode: (ScannedCode) -> Void
  @State private var status = AVCaptureDevice.authorizationStatus(for: .video)
  @State private var failed = false
  /// When the camera last saw a QR code that isn't a Matinee sign-in.
  @State private var foreignAt: Date?
  @Environment(\.palette) private var palette
  @Environment(\.openURL) private var openURL
  @Environment(\.scenePhase) private var scenePhase

  var body: some View {
    let granted = status == .authorized
    VStack(spacing: Space.s3) {
      ZStack {
        palette.card
        if failed {
          CameraNotice(text: Str.linkCameraFailed)
        } else if granted {
          Viewfinder(onFailed: { failed = true }, onText: read)
          ScanCorners().padding(Space.s10)
        } else if status == .notDetermined {
          CameraNotice(text: Str.linkCameraNeeded) {
            MatineeButton(Str.linkCameraAllow, look: .outline, action: ask)
          }
        } else {
          // iOS asks once; after a no, only its Settings can allow it.
          CameraNotice(text: Str.linkCameraNeeded) {
            MatineeButton(Str.iosOpenSettings, icon: .settings, look: .outline) {
              if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
            }
          }
        }
      }
      .aspectRatio(1, contentMode: .fit)
      .frame(maxWidth: .infinity)
      .clipShape(ViewfinderShape)
      .overlay { ViewfinderShape.strokeBorder(palette.border) }
      // What to do with the picture, while there is one.
      if granted && !failed {
        Text(foreignAt != nil ? Str.linkScanForeign : Str.linkScanHint)
          .textStyle(.sm)
          .foregroundStyle(foreignAt != nil ? palette.foreground : palette.mutedForeground)
          .multilineTextAlignment(.center)
          .frame(maxWidth: .infinity)
          .accessibilityAddTraits(.updatesFrequently)
      }
    }
    .onAppear { if status == .notDetermined { ask() } }
    // Checked again on coming back, as from the app's page in Settings.
    .onChange(of: scenePhase) { _, phase in
      if phase == .active { status = AVCaptureDevice.authorizationStatus(for: .video) }
    }
    .task(id: foreignAt) {
      guard foreignAt != nil else { return }
      try? await Task.sleep(for: .milliseconds(2500))
      foreignAt = nil
    }
  }

  private func ask() {
    Task {
      _ = await AVCaptureDevice.requestAccess(for: .video)
      status = AVCaptureDevice.authorizationStatus(for: .video)
    }
  }

  /// What a QR code held: a sign-in goes on, anything else says so for a moment.
  private func read(_ text: String) -> Bool {
    if let scanned = scannedCode(text) {
      UINotificationFeedbackGenerator().notificationOccurred(.success)
      onCode(scanned)
      return true
    }
    if foreignAt.map({ Date().timeIntervalSince($0) > 0.5 }) ?? true { foreignAt = Date() }
    return false
  }
}

/// Why there's no picture, as the kit's empty state: the camera's crossed-out icon on its tile, and what to do.
private struct CameraNotice<Action: View>: View {
  let text: String
  @ViewBuilder var action: () -> Action

  var body: some View {
    EmptyState(icon: .cameraOff, title: text) { action() }
      .padding(Space.s2)
  }
}

extension CameraNotice where Action == EmptyView {
  init(text: String) {
    self.text = text
    self.action = { EmptyView() }
  }
}

/// Four corners over the picture, where the QR code should go.
private struct ScanCorners: View {
  var body: some View {
    Canvas { context, size in
      let arm = min(size.width, size.height) / 6
      var path = Path()
      for (corner, dx, dy) in [
        (CGPoint(x: 0, y: 0), 1.0, 1.0), (CGPoint(x: size.width, y: 0), -1.0, 1.0),
        (CGPoint(x: 0, y: size.height), 1.0, -1.0), (CGPoint(x: size.width, y: size.height), -1.0, -1.0),
      ] {
        path.move(to: CGPoint(x: corner.x + arm * dx, y: corner.y))
        path.addLine(to: corner)
        path.addLine(to: CGPoint(x: corner.x, y: corner.y + arm * dy))
      }
      context.stroke(path, with: .color(.white), style: StrokeStyle(lineWidth: 3, lineCap: .round, lineJoin: .round))
    }
    .accessibilityHidden(true)
  }
}

/// The back camera's picture, with what it sees read for QR codes. `onText`
/// gets what one holds, on the main thread, and answers whether that was
/// the code it wanted; after that the camera stops.
private struct Viewfinder: UIViewRepresentable {
  let onFailed: () -> Void
  let onText: (String) -> Bool

  func makeCoordinator() -> QrCamera { QrCamera() }

  func makeUIView(context: Context) -> PreviewView {
    let view = PreviewView()
    let camera = context.coordinator
    camera.onText = onText
    camera.onFailed = onFailed
    view.previewLayer.videoGravity = .resizeAspectFill
    view.previewLayer.session = camera.session
    // After this update, as starting may fail at once and change the screen.
    Task { camera.start() }
    return view
  }

  func updateUIView(_ view: PreviewView, context: Context) {
    context.coordinator.onText = onText
    context.coordinator.onFailed = onFailed
  }

  static func dismantleUIView(_ view: PreviewView, coordinator: QrCamera) { coordinator.stop() }

  final class PreviewView: UIView {
    override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
    // SAFETY: layerClass makes the view's layer this kind.
    var previewLayer: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
  }
}

/// The capture session and its QR reader. The session starts and stops on
/// a queue of its own, as AVFoundation asks, and reports on the main thread.
private final class QrCamera: NSObject, AVCaptureMetadataOutputObjectsDelegate {
  let session = AVCaptureSession()
  var onText: (String) -> Bool = { _ in false }
  var onFailed: () -> Void = {}
  private var found = false
  private let queue = DispatchQueue(label: "io.github.zekurio.matinee.camera")

  func start() {
    let device =
      AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back)
      ?? AVCaptureDevice.default(for: .video)
    guard let device, let input = try? AVCaptureDeviceInput(device: device), session.canAddInput(input) else {
      onFailed()
      return
    }
    let output = AVCaptureMetadataOutput()
    session.beginConfiguration()
    session.addInput(input)
    guard session.canAddOutput(output) else {
      session.commitConfiguration()
      onFailed()
      return
    }
    session.addOutput(output)
    output.setMetadataObjectsDelegate(self, queue: .main)
    output.metadataObjectTypes = [.qr]
    session.commitConfiguration()
    let session = session
    queue.async { session.startRunning() }
  }

  func stop() {
    let session = session
    queue.async { session.stopRunning() }
  }

  nonisolated func metadataOutput(
    _ output: AVCaptureMetadataOutput, didOutput objects: [AVMetadataObject], from connection: AVCaptureConnection
  ) {
    let texts = objects.compactMap { ($0 as? AVMetadataMachineReadableCodeObject)?.stringValue }
    MainActor.assumeIsolated {
      for text in texts where !found {
        found = onText(text)
        if found { stop() }
      }
    }
  }
}

/// Where checking a code stands.
private enum Approval {
  case checking
  case waiting(DeviceRequest)
  case approved(DeviceRequest)
  /// It expired, was used, or never was: on this server, at least.
  case gone
  case failed(String)
}

/// The device `userCode` belongs to, for the person to check, and approving
/// it. `from` is the server the QR code named, to say so when it isn't this
/// one. `typed` when the person typed the code rather than scanned it.
private struct ApproveStep: View {
  let userCode: String
  let from: String?
  let typed: Bool
  let onAgain: () -> Void
  @State private var state = Approval.checking
  @State private var attempt = 0
  @State private var approving = false
  @State private var approveError: String?
  @Environment(\.api) private var api
  @Environment(\.navigator) private var nav
  @Environment(\.user) private var user
  @Environment(\.palette) private var palette
  @Environment(\.dynamicTypeSize) private var dynamicType
  @Environment(MatineeSession.self) private var session

  var body: some View {
    let name = user?.name ?? ""
    let again = typed ? Str.linkAgainTyped : Str.linkAgain
    VStack(alignment: .leading, spacing: 0) {
      switch state {
      case .checking:
        Spinner(size: 28, tint: palette.accent)
          .frame(maxWidth: .infinity, minHeight: 160)
      case .waiting(let request):
        VStack(alignment: .leading, spacing: 0) {
          DeviceCard(request: request)
          VStack(alignment: .leading, spacing: Space.s1_5) {
            Text(emphasized(Str.linkWants(name), name, font: nameFont, color: palette.foreground))
              .textStyle(.base)
              .foregroundStyle(palette.foreground)
            Text(emphasized(Str.linkCodeShown(request.userCode), request.userCode, font: codeFont, color: palette.foreground, kern: 0.05))
              .textStyle(.sm)
              .foregroundStyle(palette.mutedForeground)
          }
          .padding(.top, Space.s5)
          VStack(spacing: Space.s2_5) {
            MatineeButton(Str.linkApprove, icon: .check, pending: approving, fullWidth: true, action: approve)
            if let approveError {
              Text(approveError).textStyle(.px13).foregroundStyle(palette.destructive)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            MatineeButton(Str.commonCancel, look: .ghost, fullWidth: true, action: onAgain)
          }
          .padding(.top, Space.s6)
          Text(Str.linkWarning).textStyle(.px13).foregroundStyle(palette.mutedForeground)
            .padding(.top, Space.s5)
        }
      case .approved(let request):
        Outcome(
          icon: .circleCheck, tint: palette.accent, title: Str.linkSignedIn,
          description: Str.linkSignedInDescription(deviceLabel(request), name)
        ) {
          MatineeButton(Str.linkDone, fullWidth: true) { nav.back() }
        }
      case .gone:
        Outcome(
          icon: .circleAlert, tint: palette.mutedForeground, title: Str.linkCodeGone,
          description: Str.linkCodeGoneDescription, detail: otherServer
        ) {
          MatineeButton(again, look: .outline, fullWidth: true, action: onAgain)
        }
      case .failed(let message):
        Outcome(icon: .circleAlert, tint: palette.mutedForeground, title: Str.linkLookupFailed, description: message) {
          VStack(spacing: Space.s2) {
            MatineeButton(Str.commonRetry, icon: .refreshCw, look: .outline, fullWidth: true) { attempt += 1 }
            MatineeButton(again, look: .ghost, fullWidth: true, action: onAgain)
          }
        }
      }
    }
    .task(id: attempt) { await check() }
  }

  /// The account's name in the sentence that names it, `font-medium`.
  private var nameFont: Font { Font(TextSize.base.uiFont(.semibold, dynamicType: dynamicType)) }

  /// The code in the sentence that shows it, `font-mono font-medium tracking-wider`.
  private var codeFont: Font {
    let size = (TextSize.sm.metrics.size * TextSize.sm.scale(at: dynamicType)).rounded()
    return Font(UIFont.monospacedSystemFont(ofSize: size, weight: .medium))
  }

  /// The server the QR code named, when it isn't the one this app is signed in to.
  private var otherServer: String? {
    guard let from, case .signedIn(let server, _) = session.state, from != server else { return nil }
    return Str.linkOtherServer(from, server)
  }

  private func check() async {
    guard let api else { return }
    state = .checking
    do {
      state = .waiting(try await DeviceCodes(api: api).get(userCode: userCode))
    } catch {
      if Failure(error) == .cancelled { return }
      state = (error as? ApiException)?.status == 404 ? .gone : .failed(describeFailure(error))
    }
  }

  private func approve() {
    guard let api, !approving, case .waiting(let request) = state else { return }
    approving = true
    approveError = nil
    Task {
      defer { approving = false }
      do {
        try await DeviceCodes(api: api).approve(userCode: userCode)
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        withMotion(Motion.enter) { state = .approved(request) }
      } catch {
        if (error as? ApiException)?.status == 404 {
          withMotion(Motion.enter) { state = .gone }
        } else {
          approveError = Str.linkApproveFailed(describeFailure(error))
        }
      }
    }
  }
}

/// `text` with `part`, a value put into a message, in `font` and `color`,
/// `kern` ems apart.
private func emphasized(_ text: String, _ part: String, font: Font, color: Color, kern: CGFloat = 0) -> AttributedString {
  var string = AttributedString(text)
  if !part.isEmpty, let range = string.range(of: part) {
    string[range].font = font
    string[range].foregroundColor = color
    if kern != 0 { string[range].kern = kern * 14 }
  }
  return string
}

/// An app's device by its name, or by what it runs on: `Android TV app`.
private func deviceLabel(_ request: DeviceRequest) -> String {
  request.deviceName ?? Str.accountDeviceApp(platformLabel(request.platform))
}

/// The device a code belongs to, as Android's DeviceCard: a bordered block
/// 14 in, its 44-point tile, and its name over what it runs on.
private struct DeviceCard: View {
  let request: DeviceRequest
  @Environment(\.palette) private var palette

  var body: some View {
    HStack(spacing: Space.s3_5) {
      RowIcon(platformIcon(request.platform), size: 44)
      VStack(alignment: .leading, spacing: 0) {
        Text(deviceLabel(request)).textStyle(.base, weight: .medium).foregroundStyle(palette.foreground)
        Text(platformLabel(request.platform)).textStyle(.px13).foregroundStyle(palette.mutedForeground)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .padding(Space.s3_5)
    .background(palette.foreground.opacity(0.02), in: PanelShape)
    .overlay { PanelShape.strokeBorder(palette.border) }
    .accessibilityElement(children: .combine)
  }
}

/// How checking a code ended, with what to do next, as Android's: its icon
/// over a heading and what it means, then the way on.
private struct Outcome<Actions: View>: View {
  let icon: Lucide
  let tint: Color
  let title: String
  let description: String
  var detail: String?
  @ViewBuilder let actions: () -> Actions
  @Environment(\.palette) private var palette

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      LucideIcon(icon, size: 36, tint: tint)
        .padding(.top, Space.s6)
      Text(title).textStyle(.px22, weight: .semibold, tracking: .tight).foregroundStyle(palette.foreground)
        .accessibilityAddTraits(.isHeader)
        .padding(.top, Space.s4)
      Text(description).textStyle(.sm).foregroundStyle(palette.mutedForeground)
        .padding(.top, Space.s2)
      if let detail {
        Text(detail).textStyle(.sm).foregroundStyle(palette.mutedForeground)
          .padding(.top, Space.s2)
      }
      actions()
        .padding(.top, Space.s7)
    }
  }
}
