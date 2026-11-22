import AVFoundation
import Flutter
import UIKit

/// The camera reading QR codes: the back camera's picture into a texture
/// Flutter draws, and every frame read for a QR code by AVFoundation's
/// metadata output. iOS interrupts the session while the app is away and
/// resumes it when it's back.
final class ScannerBridge: ScannerApi {
  private let textures: FlutterTextureRegistry
  private let events: ScannerEvents
  private var running: Running?

  /// The last code sent, so one held in view doesn't flood Dart.
  private var lastText: String?
  private var lastAt: TimeInterval = 0

  init(textures: FlutterTextureRegistry, messenger: FlutterBinaryMessenger) {
    self.textures = textures
    events = ScannerEvents(binaryMessenger: messenger)
  }

  func hasCamera() throws -> Bool { AVCaptureDevice.default(for: .video) != nil }

  func cameraAllowed() throws -> Bool { AVCaptureDevice.authorizationStatus(for: .video) == .authorized }

  func requestCamera() async throws -> CameraAnswer {
    switch AVCaptureDevice.authorizationStatus(for: .video) {
    case .authorized: return .allowed
    // iOS asks once; after a no only Settings can allow it.
    case .denied, .restricted: return .blocked
    default: return await AVCaptureDevice.requestAccess(for: .video) ? .allowed : .denied
    }
  }

  func openAppSettings() throws {
    guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
    UIApplication.shared.open(url)
  }

  @MainActor func start() async throws -> ScannerView {
    try stop()
    let back = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back)
    guard let device = back ?? AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .front)
    else { throw PigeonError(code: "camera", message: "This device has no camera", details: nil) }
    let session = AVCaptureSession()
    let frames = CameraFrames()
    let metadata = AVCaptureMetadataOutput()
    let video = AVCaptureVideoDataOutput()
    do {
      session.beginConfiguration()
      // Enough detail for a QR code across the room, little enough to draw every frame.
      if session.canSetSessionPreset(.hd1280x720) { session.sessionPreset = .hd1280x720 }
      let input = try AVCaptureDeviceInput(device: device)
      guard session.canAddInput(input), session.canAddOutput(video), session.canAddOutput(metadata) else {
        throw PigeonError(code: "camera", message: "The camera can't be used now", details: nil)
      }
      session.addInput(input)
      video.videoSettings = [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA]
      video.alwaysDiscardsLateVideoFrames = true
      video.setSampleBufferDelegate(frames, queue: frames.queue)
      session.addOutput(video)
      session.addOutput(metadata)
      // Only once the output is in a session does it know what it can read,
      // and asking for a type it can't read raises an exception.
      guard metadata.availableMetadataObjectTypes.contains(.qr) else {
        throw PigeonError(code: "camera", message: "This camera can't read QR codes", details: nil)
      }
      metadata.metadataObjectTypes = [.qr]
      if let connection = video.connection(with: .video) {
        // The buffers come upright for the screen as it is now, and mirrored
        // for a front camera, so Flutter draws them as they are.
        upright(connection)
        if connection.isVideoMirroringSupported {
          connection.automaticallyAdjustsVideoMirroring = false
          connection.isVideoMirrored = device.position == .front
        }
      }
      session.commitConfiguration()
    } catch let failure as PigeonError {
      throw failure
    } catch {
      throw PigeonError(code: "camera", message: error.localizedDescription, details: nil)
    }
    let reader = QrReader { [weak self] text in self?.found(text) }
    metadata.setMetadataObjectsDelegate(reader, queue: .main)
    let id = textures.register(frames)
    frames.onFrame = { [weak textures] in textures?.textureFrameAvailable(id) }
    let current = Running(session: session, frames: frames, reader: reader, textureId: id)
    running = current
    lastText = nil
    // startRunning blocks until the camera is on, so it runs off the main thread.
    frames.queue.async { session.startRunning() }
    guard let size = await frames.firstFrame(timeout: 10), running === current else {
      if running === current { try stop() }
      throw PigeonError(code: "camera", message: "The camera didn't start", details: nil)
    }
    return ScannerView(
      textureId: id, width: Int64(size.width), height: Int64(size.height), quarterTurns: 0, mirrored: false)
  }

  func stop() throws {
    guard let current = running else { return }
    running = nil
    textures.unregisterTexture(current.textureId)
    current.frames.onFrame = nil
    let session = current.session
    current.frames.queue.async { session.stopRunning() }
  }

  private func found(_ text: String) {
    guard running != nil else { return }
    let now = ProcessInfo.processInfo.systemUptime
    if text == lastText && now - lastAt < 0.5 { return }
    lastText = text
    lastAt = now
    Task { @MainActor [events] in
      // Nobody listening on the Dart side any more is nothing to tell.
      try? await events.scanned(text: text)
    }
  }

  private func upright(_ connection: AVCaptureConnection) {
    let orientation =
      UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.interfaceOrientation }.first
      ?? .portrait
    if #available(iOS 17.0, *) {
      let angle: CGFloat =
        switch orientation {
        case .landscapeRight: 0
        case .portraitUpsideDown: 270
        case .landscapeLeft: 180
        default: 90
        }
      if connection.isVideoRotationAngleSupported(angle) { connection.videoRotationAngle = angle }
    } else if connection.isVideoOrientationSupported {
      connection.videoOrientation =
        switch orientation {
        case .landscapeRight: .landscapeRight
        case .landscapeLeft: .landscapeLeft
        case .portraitUpsideDown: .portraitUpsideDown
        default: .portrait
        }
    }
  }

  private final class Running {
    let session: AVCaptureSession
    let frames: CameraFrames
    let reader: QrReader
    let textureId: Int64

    init(session: AVCaptureSession, frames: CameraFrames, reader: QrReader, textureId: Int64) {
      self.session = session
      self.frames = frames
      self.reader = reader
      self.textureId = textureId
    }
  }
}

/// The camera's latest frame, for Flutter's texture. Frames arrive on
/// [queue]; Flutter copies them on its raster thread.
private final class CameraFrames: NSObject, FlutterTexture, AVCaptureVideoDataOutputSampleBufferDelegate {
  let queue = DispatchQueue(label: "io.github.zekurio.matinee.camera")
  private let lock = NSLock()
  private var latest: CVPixelBuffer?
  private var waiting: CheckedContinuation<CGSize?, Never>?
  private var size: CGSize?
  var onFrame: (() -> Void)?

  func copyPixelBuffer() -> Unmanaged<CVPixelBuffer>? {
    lock.lock()
    defer { lock.unlock() }
    return latest.map { Unmanaged.passRetained($0) }
  }

  func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
    guard let buffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
    lock.lock()
    latest = buffer
    let first = size == nil
    if first { size = CGSize(width: CVPixelBufferGetWidth(buffer), height: CVPixelBufferGetHeight(buffer)) }
    let answer = first ? waiting : nil
    if first { waiting = nil }
    lock.unlock()
    answer?.resume(returning: size)
    DispatchQueue.main.async { [weak self] in self?.onFrame?() }
  }

  /// The first frame's size, or nil when none comes in time.
  @MainActor func firstFrame(timeout: TimeInterval) async -> CGSize? {
    await withCheckedContinuation { continuation in
      lock.lock()
      if let size {
        lock.unlock()
        continuation.resume(returning: size)
        return
      }
      waiting = continuation
      lock.unlock()
      DispatchQueue.main.asyncAfter(deadline: .now() + timeout) { [weak self] in
        guard let self else { return }
        lock.lock()
        let answer = waiting
        waiting = nil
        lock.unlock()
        answer?.resume(returning: nil)
      }
    }
  }
}

private final class QrReader: NSObject, AVCaptureMetadataOutputObjectsDelegate {
  private let onText: (String) -> Void

  init(onText: @escaping (String) -> Void) {
    self.onText = onText
  }

  func metadataOutput(
    _ output: AVCaptureMetadataOutput, didOutput metadataObjects: [AVMetadataObject], from connection: AVCaptureConnection
  ) {
    for case let code as AVMetadataMachineReadableCodeObject in metadataObjects {
      if code.type == .qr, let text = code.stringValue { onText(text) }
    }
  }
}
