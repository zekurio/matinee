import MatineeCore
import SwiftUI

/*
 * PlayerScreen.kt. A stub from the shell's task until the player task fills
 * it in; keep the type and its parameters. The shell presents it over
 * everything, in landscape and the dark theme (`PlayerCover` in Nav.swift);
 * it leaves with `@Environment(\.dismiss)`.
 */

/// Plays `itemId` from where the person left off, or from `start` seconds.
struct PlayerScreen: View {
  let itemId: String
  let start: Double?
  @Environment(\.dismiss) private var dismiss
  @Environment(\.palette) private var palette

  var body: some View {
    ZStack(alignment: .topLeading) {
      Color.black.ignoresSafeArea()
      VStack(spacing: 6) {
        Text("PlayerScreen").textStyle(.headlineSmall)
        Text("itemId: \(itemId)").textStyle(.bodyMedium).foregroundStyle(palette.muted)
        Text(stubValue("start", start)).textStyle(.bodyMedium).foregroundStyle(palette.muted)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      RoundIconButton(.arrowLeft, label: Str.commonBack, iconSize: 22, background: palette.background.opacity(0.6)) {
        dismiss()
      }
      .padding(8)
    }
    .accessibilityIdentifier("stub.PlayerScreen")
  }
}
