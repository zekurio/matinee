@preconcurrency import AVFoundation
import MatineeCore
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
 */

/// The contract's `DevicePlatform` by name, the same in every language, as the web's `platformLabel`.
nonisolated func platformLabel(_ platform: String) -> String {
  switch platform {
  case "android": "Android"
  case "androidtv": "Android TV"
  case "ios": "iOS"
  case "linux": "Linux"
  case "macos": "macOS"
  case "tizen": "Samsung TV"
  case "windows": "Windows"
  default: platform.prefix(1).uppercased() + platform.dropFirst()
  }
}

/// What a device is, at a glance. Nil is a browser.
nonisolated func platformIcon(_ platform: String?) -> Lucide {
  switch platform {
  case "androidtv", "tizen": .tv
  case "android", "ios": .smartphone
  default: .monitor
  }
}

/// Signing in a TV or another app by its QR code or code, from Settings' Account page.
struct LinkDeviceScreen: View {
  // The code being checked, and the server its QR code named. Typed codes name none.
  @State private var code: String?
  @State private var from: String?
  @State private var typed = false
  @Environment(\.palette) private var palette

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
      .padding(.horizontal, Gutter)
      .padding(.top, 8)
      .padding(.bottom, 24)
    }
    .scrollDismissesKeyboard(.interactively)
    .background(palette.background)
    .topBar(Str.linkTitle)
  }
}

/// Whether this device has a camera to scan with.
@MainActor private var hasCamera: Bool {
  #if DEBUG
    // -dev.camera YES: as if it had one, to see the permission and a camera that won't start on the simulator.
    if UserDefaults.standard.bool(forKey: "dev.camera") { return true }
  #endif
  return AVCaptureDevice.default(for: .video) != nil
}

/// The camera, where the device has one, and the field for typing the code.
private struct ScanStep: View {
  let onCode: (ScannedCode, _ byHand: Bool) -> Void
  @Environment(\.palette) private var palette

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      if hasCamera {
        CameraScanner { onCode($0, false) }
        Gap(32)
        Text(Str.linkOrEnter).textStyle(.titleMedium).accessibilityAddTraits(.isHeader)
      } else {
        // No camera, as on a TV signing in another TV, or the simulator: only the code.
        Text(Str.linkEnterCode).textStyle(.bodyMedium).foregroundStyle(palette.muted)
      }
      Gap(12)
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

private struct CodeField: View {
  let onCode: (String) -> Void
  @State private var text = ""
  @State private var tried = false
  @Environment(\.palette) private var palette

  var body: some View {
    let parsed = UserCode.parse(text)
    let invalid = tried && parsed == nil
    VStack(alignment: .leading, spacing: 0) {
      MatineeTextField(
        Binding(get: { text }, set: { text = String($0.prefix(9)) }), placeholder: Str.linkCodePlaceholder,
        isError: invalid
      )
      .keyboardType(.asciiCapable)
      .textInputAutocapitalization(.characters)
      .autocorrectionDisabled()
      .textContentType(.oneTimeCode)
      .submitLabel(.go)
      .onSubmit(submit)
      .accessibilityLabel(Str.linkOrEnter)
      if invalid {
        Gap(6)
        Text(Str.linkCodeInvalid).textStyle(.bodySmall).foregroundStyle(palette.danger)
      }
      Gap(12)
      Button(action: submit) {
        Text(Str.linkContinue).frame(maxWidth: .infinity)
      }
      .buttonStyle(.matinee(.secondary))
      .disabled(text.trimmingCharacters(in: .whitespaces).isEmpty)
    }
  }

  private func submit() {
    tried = true
    if let parsed = UserCode.parse(text) { onCode(parsed) }
  }
}

private let ViewfinderShape = RoundedRectangle(cornerRadius: 16, style: .continuous)

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
    VStack(spacing: 12) {
      ZStack {
        palette.card
        if failed {
          CameraNotice(text: Str.linkCameraFailed)
        } else if granted {
          Viewfinder(onFailed: { failed = true }, onText: read)
          ScanCorners().padding(40)
        } else if status == .notDetermined {
          CameraNotice(text: Str.linkCameraNeeded) {
            MatineeButton(.outline, action: ask) { Text(Str.linkCameraAllow) }
          }
        } else {
          // iOS asks once; after a no, only its Settings can allow it.
          CameraNotice(text: Str.linkCameraNeeded) {
            MatineeButton(.outline) {
              if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) }
            } label: {
              LucideIcon(.settings, size: 18)
              Text(Str.iosOpenSettings)
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
          .textStyle(.bodyMedium)
          .foregroundStyle(foreignAt != nil ? palette.foreground : palette.muted)
          .multilineTextAlignment(.center)
          .frame(maxWidth: .infinity)
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

private struct CameraNotice<Action: View>: View {
  let text: String
  @ViewBuilder var action: () -> Action
  @Environment(\.palette) private var palette

  var body: some View {
    VStack(spacing: 12) {
      LucideIcon(.cameraOff, size: 28, tint: palette.muted)
      Text(text).textStyle(.bodyMedium).foregroundStyle(palette.muted).multilineTextAlignment(.center)
      action().padding(.top, 4)
    }
    .padding(28)
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
    camera.start()
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
        ProgressView().tint(palette.accent)
          .frame(maxWidth: .infinity, minHeight: 160)
          .accessibilityLabel(Str.loadingInProgress)
      case .waiting(let request):
        DeviceCard(request: request)
        Gap(20)
        Text(emphasized(Str.linkWants(name), name, font: Font(Typography.bodyLarge.uiFont(.semibold))))
          .textStyle(.bodyLarge)
        Gap(6)
        Text(
          emphasized(
            Str.linkCodeShown(request.userCode), request.userCode,
            font: .system(size: Typography.bodyMedium.spec.size * Typography.bodyMedium.scale(at: dynamicType), weight: .medium, design: .monospaced),
            color: palette.foreground)
        )
        .textStyle(.bodyMedium)
        .foregroundStyle(palette.muted)
        Gap(24)
        Button(action: approve) {
          HStack(spacing: 8) {
            if approving {
              ProgressView().controlSize(.small).tint(palette.accentForeground)
            } else {
              LucideIcon(.check, size: 18)
            }
            Text(Str.linkApprove)
          }
          .frame(maxWidth: .infinity)
        }
        .buttonStyle(.matinee())
        .disabled(approving)
        if let approveError {
          Gap(10)
          Text(approveError).textStyle(.bodySmall).foregroundStyle(palette.danger)
        }
        Gap(10)
        Button(action: onAgain) { Text(Str.commonCancel).frame(maxWidth: .infinity) }
          .buttonStyle(.matinee(.ghost))
        Gap(20)
        Text(Str.linkWarning).textStyle(.bodySmall).foregroundStyle(palette.muted)
      case .approved(let request):
        Outcome(
          icon: .circleCheck, tint: palette.accent, title: Str.linkSignedIn,
          description: Str.linkSignedInDescription(deviceLabel(request), name)
        ) {
          Button { nav.back() } label: { Text(Str.linkDone).frame(maxWidth: .infinity) }
            .buttonStyle(.matinee())
        }
      case .gone:
        Outcome(
          icon: .circleAlert, tint: palette.muted, title: Str.linkCodeGone,
          description: Str.linkCodeGoneDescription, detail: otherServer
        ) {
          Button(action: onAgain) { Text(again).frame(maxWidth: .infinity) }
            .buttonStyle(.matinee(.outline))
        }
      case .failed(let message):
        Outcome(icon: .circleAlert, tint: palette.muted, title: Str.linkLookupFailed, description: message) {
          VStack(spacing: 10) {
            Button { attempt += 1 } label: {
              HStack(spacing: 8) {
                LucideIcon(.refreshCw, size: 16)
                Text(Str.commonRetry)
              }
              .frame(maxWidth: .infinity)
            }
            .buttonStyle(.matinee(.outline))
            Button(action: onAgain) { Text(again).frame(maxWidth: .infinity) }
              .buttonStyle(.matinee(.ghost))
          }
        }
      }
    }
    .task(id: attempt) { await check() }
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

/// `text` with `part`, a value put into a message, in `font` and `color`.
private func emphasized(_ text: String, _ part: String, font: Font, color: Color? = nil) -> AttributedString {
  var string = AttributedString(text)
  if !part.isEmpty, let range = string.range(of: part) {
    string[range].font = font
    if let color { string[range].foregroundColor = color }
  }
  return string
}

/// An app's device by its name, or by what it runs on: `Android TV app`.
private func deviceLabel(_ request: DeviceRequest) -> String {
  request.deviceName ?? Str.accountDeviceApp(platformLabel(request.platform))
}

/// The device a code belongs to, as the web's DeviceCard.
private struct DeviceCard: View {
  let request: DeviceRequest
  @Environment(\.palette) private var palette

  var body: some View {
    HStack(spacing: 14) {
      LucideIcon(platformIcon(request.platform), tint: palette.muted)
        .frame(width: 44, height: 44)
        .background(palette.secondary, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
      VStack(alignment: .leading, spacing: 0) {
        Text(deviceLabel(request)).textStyle(.bodyLarge, weight: .medium)
        Text(platformLabel(request.platform)).textStyle(.bodySmall).foregroundStyle(palette.muted)
      }
      .frame(maxWidth: .infinity, alignment: .leading)
    }
    .padding(14)
    .background(palette.card, in: PanelShape)
    .overlay { PanelShape.strokeBorder(palette.border) }
    .accessibilityElement(children: .combine)
  }
}

/// How checking a code ended, with what to do next.
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
      Gap(24)
      LucideIcon(icon, size: 36, tint: tint)
      Gap(16)
      Text(title).textStyle(.headlineSmall).accessibilityAddTraits(.isHeader)
      Gap(8)
      Text(description).textStyle(.bodyMedium).foregroundStyle(palette.muted)
      if let detail {
        Gap(8)
        Text(detail).textStyle(.bodyMedium).foregroundStyle(palette.muted)
      }
      Gap(28)
      actions()
    }
  }
}
