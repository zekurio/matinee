import MatineeCore
import SwiftUI

/* What the sign-in screens do, apart from how they look: SignInState.kt. */

/// Connecting to the server the person typed: whether it's under way, and what went wrong.
@Observable final class ServerConnect {
  private(set) var busy = false
  private(set) var error: String?
  /// The address that failed is on the local network, which iOS may be keeping the app from.
  private(set) var local = false
  /// What failed on the local network, to try once more when the app is back in front
  /// (LocalNetwork.swift): after the system's prompt, or Settings.
  private var retry: (address: String, name: String?)?

  /// Try `address`, unless a try is under way. Once it answers, the
  /// session moves on to signing in. `name` is what a server found nearby calls itself.
  func connect(_ session: MatineeSession, _ address: String, name: String? = nil) async {
    guard !busy else { return }
    busy = true
    error = nil
    local = false
    retry = nil
    defer { busy = false }
    guard let failure = await session.connect(address, name: name) else { return }
    switch failure {
    case .empty: error = Str.connectEmpty
    case .notMatinee(let server): error = Str.connectNotMatinee(server)
    case .unreachable(let server, let isLocal):
      error = Str.connectFailed(server)
      // Without the access a LAN server only says it can't be reached.
      local = isLocal
      if isLocal { retry = (address, name) }
    }
  }

  /// The app came back to the front, from the local network prompt or from
  /// Settings: a server on the local network that failed gets another try.
  func retryLocal(_ session: MatineeSession) async {
    guard let retry, !busy else { return }
    await connect(session, retry.address, name: retry.name)
  }

  func clearError() {
    error = nil
    local = false
    retry = nil
  }
}

/// The OAuth device grant under way: the code to show once it came, and
/// what went wrong. `expired` once the code ran out, when it isn't renewed
/// on its own. A poll that fails tries again on its own.
@Observable final class DeviceCodeState {
  private(set) var code: DeviceCode?
  private(set) var error: String?
  private(set) var expired = false
  /// Moves to start again; the view runs `run` once per value, in `.task(id:)`.
  private(set) var attempt = 0

  /// Start again with a new code: after one expired, or never came.
  func newCode() { attempt += 1 }

  /// Starts the device grant and polls until someone signed in approves
  /// this device, then signs the session in. A code that expires is
  /// replaced at once when `renewExpired`, with a new one; otherwise
  /// `expired` says so and waits for `newCode`. Ends when its task is cancelled.
  func run(_ session: MatineeSession, renewExpired: Bool) async {
    // A server being added, before it's saved, or the one in use.
    let api = session.signInApi()
    error = nil
    expired = false
    let started: DeviceCode
    do {
      started = try await api.auth.device.start(
        appDevice: AppDevice(name: session.deviceName, platform: session.platform))
    } catch {
      if !Task.isCancelled { self.error = describeFailure(error) }
      return
    }
    code = started
    while true {
      do {
        try await Task.sleep(for: .seconds(max(1, started.interval)))
      } catch {
        return
      }
      do {
        let answer = try await api.auth.device.poll(deviceCode: started.deviceCode)
        error = nil
        if case .approved(let approved) = answer {
          do {
            try session.signedIn(AppSession(token: approved.token, user: approved.user))
          } catch {
            self.error = Str.signinFailed
          }
          return
        }
      } catch let failure as ApiException where failure.status == 404 {
        // The code expired: get a new one.
        if renewExpired {
          attempt += 1
        } else {
          code = nil
          expired = true
        }
        return
      } catch {
        if Task.isCancelled { return }
        // Wi-Fi dropping, or the system cutting the app off while the
        // browser has the screen: keep asking about the same code, which
        // someone may have approved meanwhile.
        self.error = describeFailure(error)
      }
    }
  }
}

/// Why the saved server didn't answer, in a line. `canWatchOffline` when the downloads still play.
func unreachableMessage(_ reason: Unreachability, server: String, canWatchOffline: Bool) -> String {
  let host = server.components(separatedBy: "://").last ?? server
  return switch reason {
  case .noNetwork: canWatchOffline ? Str.unreachableOfflineDownloads : Str.unreachableOffline
  case .refused: Str.unreachableRefused(host)
  case .notFound: Str.unreachableNotFound(host)
  case .timeout: Str.unreachableTimeout(host)
  case .certificate: Str.unreachableCertificate(host)
  case .other: Str.unreachableOther(host)
  }
}
