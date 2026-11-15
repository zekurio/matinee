import MatineeCore
import MatineeKit
import SwiftUI

/*
 * TrickplaySettings.kt: the seek bar's preview images.
 */

/// The seek bar's preview images, as the web's trickplay panel: whether the
/// server makes them, how often and how wide, and how it decodes. The
/// fields save together, from the save bar; new settings make new images
/// in the background.
struct TrickplaySettings: View {
  @State private var loader = Loader<AdminTrickplaySettings>()
  @State private var draft: MatineeCore.TrickplaySettings?
  @Environment(\.api) private var api

  var body: some View {
    let saved = loader.state.value?.settings
    SaveBarScaffold(
      Str.settingsAdminTrickplay, dirty: draft != nil && draft != saved, onReset: { draft = saved },
      onSave: {
        guard let api, let draft else { return }
        loader.show(try await api.admin.trickplay.update(trickplaySettings: draft))
      }
    ) {
      AdminLoaded(loader, failed: Str.webTrickplayLoadFailed) { data in
        TrickplayForm(
          data: data, settings: Binding(get: { draft ?? data.settings }, set: { draft = $0 }))
      }
    }
    .loads(loader) { api in try await api.admin.trickplay.get() }
    .onChange(of: saved, initial: true) { _, saved in draft = saved }
  }
}

private struct TrickplayForm: View {
  let data: AdminTrickplaySettings
  @Binding var settings: MatineeCore.TrickplaySettings

  var body: some View {
    SettingsSection(Str.webTrickplayTitle) {
      VStack(spacing: 12) {
        Note(Str.webTrickplayDescriptionCount(data.videos, formatCount(data.ready)))
        Panel {
          LegacySwitchRow(Str.webTrickplayEnabled, isOn: $settings.enabled)
          RowDivider()
          PickerRow(
            Str.webTrickplayInterval, options: TrickplayInterval.knownValues.map { ($0, Str.webTrickplayIntervalOption($0)) },
            current: settings.intervalSeconds
          ) { settings.intervalSeconds = $0 }
          RowDivider()
          PickerRow(
            Str.webTrickplayWidth, options: TrickplayWidth.knownValues.map { ($0, Str.webTrickplayWidthOption(String($0))) },
            current: settings.width
          ) { settings.width = $0 }
          RowDivider()
          LegacySwitchRow(Str.webTrickplayKeyframesOnly, isOn: $settings.keyframesOnly)
          // Decoding on the GPU needs one set up for transcoding.
          if data.hardwareAcceleration != nil {
            RowDivider()
            LegacySwitchRow(Str.webTrickplayHardwareDecoding, isOn: $settings.hardwareDecoding)
          }
        }
      }
    }
  }
}
