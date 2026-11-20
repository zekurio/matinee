import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import '../../player/player_preferences.dart';
import '../../player/player_system.dart';
import '../../player/subtitle_look.dart';
import 'settings_rows.dart';
import 'settings_screen.dart';

/// Settings, Subtitles: how subtitles look on this device, with a sample,
/// as the Kotlin app's subtitles page. The system's caption style leaves
/// only the way to its settings; otherwise the app's own choices show.
class SubtitlesPage extends ConsumerWidget {
  const SubtitlesPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final prefs = ref.watch(playerPrefsProvider).value ?? const PlayerPrefs();
    final percent = NumberFormat.percentPattern(l.localeName);
    void change(PlayerPrefs Function(PlayerPrefs) edit) =>
        ref.read(playerPrefsProvider.notifier).change(edit);
    return SettingsScaffold(
      title: l.settingsSubtitlesTitle,
      sections: [
        _Preview(look: subtitleLook(ref, prefs)),
        Panel(
          rows: [
            SwitchRow(
              title: l.settingsSubtitlesSystem,
              checked: prefs.subtitleSystemStyle,
              onChanged: (on) =>
                  change((prefs) => prefs.copyWith(subtitleSystemStyle: on)),
            ),
            if (prefs.subtitleSystemStyle)
              LinkRow(
                title: l.settingsSubtitlesSystemOpen,
                onPressed: () =>
                    ref.read(playerSystemProvider).openCaptionSettings(),
              )
            else ...[
              PickerRow<double>(
                title: l.settingsSubtitlesSize,
                options: [
                  for (final scale in subtitleScales)
                    (scale, percent.format(scale)),
                ],
                current: prefs.subtitleScale,
                onPicked: (picked) =>
                    change((prefs) => prefs.copyWith(subtitleScale: picked)),
              ),
              PickerRow<SubtitleColor>(
                title: l.settingsSubtitlesColor,
                options: [
                  for (final color in SubtitleColor.values)
                    (color, subtitleColorLabel(l, color)),
                ],
                current: prefs.subtitleColor,
                onPicked: (picked) =>
                    change((prefs) => prefs.copyWith(subtitleColor: picked)),
              ),
              PickerRow<SubtitleBackground>(
                title: l.settingsSubtitlesBackground,
                options: [
                  for (final background in SubtitleBackground.values)
                    (background, subtitleBackgroundLabel(l, background)),
                ],
                current: prefs.subtitleBackground,
                onPicked: (picked) => change(
                  (prefs) => prefs.copyWith(subtitleBackground: picked),
                ),
              ),
              PickerRow<SubtitleEdge>(
                title: l.settingsSubtitlesEdge,
                options: [
                  for (final edge in ownSubtitleEdges)
                    (edge, subtitleEdgeLabel(l, edge)),
                ],
                current: prefs.subtitleEdge,
                onPicked: (picked) =>
                    change((prefs) => prefs.copyWith(subtitleEdge: picked)),
              ),
            ],
          ],
        ),
      ],
    );
  }
}

String subtitleColorLabel(AppLocalizations l, SubtitleColor color) =>
    switch (color) {
      SubtitleColor.white => l.settingsSubtitlesColorWhite,
      SubtitleColor.yellow => l.settingsSubtitlesColorYellow,
      SubtitleColor.cyan => l.settingsSubtitlesColorCyan,
      SubtitleColor.green => l.settingsSubtitlesColorGreen,
    };

String subtitleBackgroundLabel(
  AppLocalizations l,
  SubtitleBackground background,
) => switch (background) {
  SubtitleBackground.none => l.settingsSubtitlesBackgroundNone,
  SubtitleBackground.shaded => l.settingsSubtitlesBackgroundShaded,
  SubtitleBackground.black => l.settingsSubtitlesBackgroundBlack,
};

// Settings offers only its own edges; the system's others never show here.
String subtitleEdgeLabel(AppLocalizations l, SubtitleEdge edge) =>
    switch (edge) {
      SubtitleEdge.shadow => l.settingsSubtitlesEdgeShadow,
      SubtitleEdge.outline => l.settingsSubtitlesEdgeOutline,
      _ => l.settingsSubtitlesEdgeNone,
    };

/// A line of subtitles over a stand-in for a bright frame, as the player
/// would draw it.
class _Preview extends StatelessWidget {
  const _Preview({required this.look});

  final SubtitleLook look;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return Container(
      height: 140,
      alignment: Alignment.bottomCenter,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: MatineeTheme.of(context).border),
        // Compose's default, corner to corner.
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color(0xFF9DB3D1),
            Color(0xFF55657F),
            Color(0xFF2B2622),
            Color(0xFF6E5A45),
          ],
        ),
      ),
      child: SubtitleLine(
        TextSpan(text: l.settingsSubtitlesPreview),
        look: look,
        size: 16,
      ),
    );
  }
}
