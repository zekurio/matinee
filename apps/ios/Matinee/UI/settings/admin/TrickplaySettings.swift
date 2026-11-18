import MatineeCore
import MatineeKit
import SwiftUI

/*
 * TrickplaySettings.kt: the seek bar's preview images, as the web's
 * trickplay panel.
 */

/// The seek bar's preview images: whether the server makes them, how often
/// and how wide, and how it decodes. The fields save together, from the
/// save bar; new settings make new images in the background.
struct TrickplaySettings: View {
  @State private var loader = Loader<AdminTrickplaySettings>()
  @State private var draft: MatineeCore.TrickplaySettings?
  @Environment(\.api) private var api

  var body: some View {
    let saved = loader.state.value?.settings
    SaveBarPage(
      Str.settingsAdminTrickplay, dirty: draft != nil && draft != saved, onReset: { draft = saved },
      onSave: {
        guard let api, let draft else { return }
        loader.show(try await api.admin.trickplay.update(trickplaySettings: draft))
      }
    ) {
      AdminLoaded(loader) { data in
        TrickplayForm(data: data, settings: Binding(get: { draft ?? data.settings }, set: { draft = $0 }))
      }
    }
    .loads(loader) { api in try await api.admin.trickplay.get() }
    // A new answer, from the server or a save, starts the form again from it.
    .onChange(of: saved, initial: true) { _, saved in
      draft = saved
    }
  }
}

private struct TrickplayForm: View {
  let data: AdminTrickplaySettings
  @Binding var settings: MatineeCore.TrickplaySettings

  var body: some View {
    SettingsSection(Str.webTrickplayTitle) {
      // What the images are and how many videos have them, as the web says it under the title.
      Note(Str.webTrickplayDescriptionCount(data.videos, formatCount(data.ready)))
      ListBlock {
        SwitchRow(Str.webTrickplayEnabled, isOn: $settings.enabled)
        SelectRow(
          Str.webTrickplayInterval, selection: $settings.intervalSeconds,
          options: TrickplayInterval.knownValues.map { ($0, Str.webTrickplayIntervalOption($0)) })
        SelectRow(
          Str.webTrickplayWidth, selection: $settings.width,
          options: TrickplayWidth.knownValues.map { ($0, Str.webTrickplayWidthOption(String($0))) })
        SwitchRow(Str.webTrickplayKeyframesOnly, isOn: $settings.keyframesOnly)
        // Decoding on the GPU needs one set up for transcoding; without one the row
        // stays out, as Android's.
        if data.hardwareAcceleration != nil {
          SwitchRow(Str.webTrickplayHardwareDecoding, isOn: $settings.hardwareDecoding)
        }
      }
    }
  }
}
