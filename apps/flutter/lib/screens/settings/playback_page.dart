import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../l10n/app_localizations.dart';
import '../../player/player_preferences.dart';
import '../../player/player_state.dart';
import 'settings_rows.dart';
import 'settings_screen.dart';

/// Settings, Playback: what this device plays with. Only the engine so
/// far, mpv or Media3, which `playerEngineProvider` keeps and the player
/// and the player lab read. The Kotlin app's account languages, skips,
/// quality, decoders, gestures, buttons, and passthrough come later.
class PlaybackPage extends ConsumerWidget {
  const PlaybackPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final engine = ref.watch(playerEngineProvider).value ?? PlayerEngine.mpv;
    return SettingsScaffold(
      title: l.settingsPagePlayback,
      sections: [
        SettingsSection(
          title: l.playbackDeviceTitle,
          child: Panel(
            rows: [
              PickerRow<PlayerEngine>(
                title: l.playbackEngineTitle,
                // Their own names, the same in every language.
                options: const [
                  (PlayerEngine.mpv, 'mpv'),
                  (PlayerEngine.media3, 'Media3'),
                ],
                current: engine,
                onPicked: (picked) =>
                    ref.read(playerEngineProvider.notifier).setEngine(picked),
              ),
            ],
          ),
        ),
      ],
    );
  }
}
