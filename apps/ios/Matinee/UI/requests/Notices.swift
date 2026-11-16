import BackgroundTasks
import MatineeCore
import MatineeKit
import SwiftUI
import UserNotifications

/*
 * Notices.kt, for iOS. The server stores a notice for each thing worth
 * telling: a title that's ready, one that isn't coming, and for an admin,
 * requests waiting or needing attention. Android looks for them about
 * every 15 minutes with WorkManager and posts what's new. iOS allows less:
 *
 * - When the app comes to the front, it looks (`RequestsHost`), and posts
 *   what's new as notifications, which show as banners over the app too,
 *   or with no leave to notify, as toasts. This always runs.
 * - In the background, a `BGAppRefreshTask` asks iOS to look about every
 *   15 minutes. iOS decides when, from how the app is used: often for an
 *   app opened every day, rarely or never for one that isn't, and never
 *   after the person swipes it away in the app switcher. It's worth having
 *   for the days it runs, and costs one fetch when it does.
 * - Real push would need the server to reach Apple's push service with
 *   the app's own key, which a self-hosted server can't have without a
 *   relay of the project's; that's a design of its own, left out.
 *
 * Each notice shown is kept per server and account (`RequestNoticeStore`),
 * and every unread one is marked read once shown, which is all "read"
 * means while there's no inbox, as on Android.
 */

/// The identifier `project.yml` lets the app schedule its background look under.
let REQUEST_NOTICES_TASK = "io.github.zekurio.matinee.requests.notices"

enum RequestNoticeDelivery {
  /// What the app does at launch for notices: the delegate that opens a
  /// tapped one and shows them over the open app, and the background look.
  /// The app delegate calls this before launch finishes, as iOS requires.
  static func register(session: MatineeSession) {
    UNUserNotificationCenter.current().delegate = RequestNoticeDelegate.shared
    BGTaskScheduler.shared.register(forTaskWithIdentifier: REQUEST_NOTICES_TASK, using: nil) { task in
      // SAFETY: the task is only finished and its expiry set, both of which BGTask allows from any thread.
      nonisolated(unsafe) let task = task
      let work = Task { @MainActor in
        let done = await backgroundCheck(session)
        task.setTaskCompleted(success: done)
      }
      task.expirationHandler = { work.cancel() }
    }
  }

  /// Asks iOS for the next look in the background, unless the person
  /// turned them off for this account.
  static func scheduleBackground(store: RequestNoticeStore?) {
    guard store?.settings.background ?? true else {
      BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: REQUEST_NOTICES_TASK)
      return
    }
    let request = BGAppRefreshTaskRequest(identifier: REQUEST_NOTICES_TASK)
    request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60)
    do {
      try BGTaskScheduler.shared.submit(request)
    } catch {
      // The simulator and a device with Background App Refresh off say no.
      AppLog.app.info("Background look for notices not scheduled")
    }
  }

  /// The look iOS runs in the background: signed in, allowed to notify,
  /// and still wanted, it posts what's new and asks for the next.
  private static func backgroundCheck(_ session: MatineeSession) async -> Bool {
    for _ in 0..<40 {
      if case .signedIn = session.state { break }
      if case .connecting = session.state {
        try? await Task.sleep(for: .milliseconds(500))
        continue
      }
      return true
    }
    guard case .signedIn(_, let user) = session.state, let api = session.api, let server = session.activeServer
    else { return true }
    let store = RequestNoticeStore(server: server, account: user.id)
    defer { scheduleBackground(store: store) }
    guard store.settings.background, await allowed() else { return true }
    await check(api: requestApi(api), store: store, foreground: false) { _ in }
    return true
  }

  /// Whether iOS lets the app post notifications.
  static func allowed() async -> Bool {
    let settings = await UNUserNotificationCenter.current().notificationSettings()
    return [.authorized, .provisional, .ephemeral].contains(settings.authorizationStatus)
  }

  /// One look: the newest page of notices, the fresh ones posted, then all
  /// of them marked read. In the front, at most once a minute; without
  /// leave to notify, `toasts` says them instead.
  static func check(
    api: MatineeApi, store: RequestNoticeStore, foreground: Bool,
    toasts: @escaping @MainActor ([MatineeCore.Notification]) -> Void
  ) async {
    if foreground, let last = store.lastCheck, Date().timeIntervalSince(last) < 60 { return }
    let allowed = await allowed()
    let link: @Sendable (MatineeCore.Notification) -> RequestNoticeLink? = { item in
      requestNoticeTarget(item).map { RequestNoticeLink(server: store.server, account: store.account, target: $0) }
    }
    do {
      try await checkRequestNotices(
        store: store,
        fetch: { try await api.notifications.list(limit: 40).items },
        markRead: { ids in try await api.notifications.markRead(ids: ids, all: false) },
        present: { fresh in
          guard allowed else {
            await MainActor.run { toasts(fresh) }
            return fresh
          }
          return await post(fresh, link: link)
        })
    } catch {
      // The next look tries again.
      AppLog.app.info("Could not look for notices")
    }
  }

  /// Posts `items` as notifications, each opening its page when tapped.
  /// Nil when iOS took none of them, so they're shown next time.
  private static func post(
    _ items: [MatineeCore.Notification], link: @Sendable (MatineeCore.Notification) -> RequestNoticeLink?
  ) async -> [MatineeCore.Notification]? {
    var shown: [MatineeCore.Notification] = []
    for item in items {
      guard let words = requestNoticeWords(item) else { continue }
      let text = requestNoticeText(words)
      let content = UNMutableNotificationContent()
      content.title = text.title
      if let body = text.body { content.body = body }
      content.sound = .default
      content.threadIdentifier = "requests"
      if let link = link(item) { content.userInfo = link.userInfo }
      do {
        try await UNUserNotificationCenter.current().add(
          UNNotificationRequest(identifier: "request-notice-\(item.id)", content: content, trigger: nil))
        shown.append(item)
      } catch {
        AppLog.app.info("A notice wasn't posted")
      }
    }
    return shown.isEmpty && !items.isEmpty ? nil : shown
  }
}

/// The page a tapped notice asked for, until the signed-in app opens it.
@Observable final class RequestNoticeOpener {
  static let shared = RequestNoticeOpener()
  var pending: RequestNoticeLink?
}

/// Shows notices as banners over the open app too, and hands a tapped one's
/// page to the app.
final class RequestNoticeDelegate: NSObject, UNUserNotificationCenterDelegate {
  static let shared = RequestNoticeDelegate()

  nonisolated func userNotificationCenter(
    _ center: UNUserNotificationCenter, willPresent notification: UNNotification
  ) async -> UNNotificationPresentationOptions {
    [.banner, .list, .sound]
  }

  nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
    guard let link = RequestNoticeLink(userInfo: response.notification.request.content.userInfo) else { return }
    await MainActor.run { RequestNoticeOpener.shared.pending = link }
  }
}
