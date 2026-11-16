import MatineeCore
import MatineeKit
import SwiftUI
import UIKit
import UserNotifications

/*
 * NoticeSettings.kt, as a page of its own that Settings links to: whether
 * this device looks for notices while Matinee is closed, kept per server
 * and account, and when iOS blocks them, the way to its settings. Turning
 * it on asks iOS for leave if it hasn't been asked yet. Notices.swift says
 * what iOS lets a look in the background do.
 */

struct NoticeSettingsScreen: View {
  @State private var on = true
  @State private var status: UNAuthorizationStatus?
  @Environment(\.requests) private var hub
  @Environment(\.gutter) private var gutter
  @Environment(\.scenePhase) private var phase
  @Environment(\.openURL) private var openURL

  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: Space.s6) {
        ListSection {
          MatineeKit.SwitchRow(
            Str.requestsNotifyTitle,
            // TODO(strings): ios_requests_notify_description "Get one when something you requested is ready or isn't coming, even with Matinee closed. iOS decides how often Matinee may look."
            subtitle: Str.requestsNotifyDescription,
            isOn: Binding(get: { on }, set: set))
          if on && status == .denied {
            // TODO(strings): ios_requests_notify_blocked "Notifications are off for Matinee in iOS's Settings." as the row's subtitle
            ListRow(Str.iosOpenSettings, icon: .settings, accessory: .chevron) {
              if let url = URL(string: UIApplication.openNotificationSettingsURLString) { openURL(url) }
            }
          }
        }
      }
      .padding(.horizontal, gutter)
      .padding(.vertical, Space.s4)
    }
    .topBar(Str.requestsNotifySection)
    .onAppear { on = hub?.notices?.settings.background ?? true }
    .task(id: phase) { await refreshStatus() }
  }

  private func refreshStatus() async {
    status = await UNUserNotificationCenter.current().notificationSettings().authorizationStatus
  }

  private func set(_ value: Bool) {
    on = value
    guard let store = hub?.notices else { return }
    var settings = store.settings
    settings.background = value
    if value, status == .notDetermined { settings.askedPermission = true }
    store.settings = settings
    RequestNoticeDelivery.scheduleBackground(store: store)
    guard value, status == .notDetermined else { return }
    Task {
      _ = try? await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge])
      await refreshStatus()
    }
  }
}
