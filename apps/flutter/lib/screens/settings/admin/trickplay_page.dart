import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart' show NumberFormat;

import '../../../api/matinee_api.dart';
import '../../../core/session.dart';
import '../../../l10n/app_localizations.dart';
import '../settings_rows.dart';
import 'admin_data.dart';
import 'admin_parts.dart';

/// The seek bar's preview images, as the Kotlin app's `TrickplaySettings`
/// and the web's trickplay panel: whether the server makes them, how often
/// and how wide, and how it decodes. The fields save together from the
/// save bar; new settings make new images in the background. The choices
/// are the contract's, as the server's client has them.
class TrickplayPage extends ConsumerWidget {
  const TrickplayPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final data = ref.watch(trickplayProvider);
    final saved = data.value;
    if (saved == null) {
      return AdminPage(
        title: l.settingsAdminTrickplay,
        child: adminBody(
          context,
          data,
          onRetry: () => ref.invalidate(trickplayProvider),
          loaded: (_) => const SizedBox(),
        ),
      );
    }
    // A save brings the settings back as the server has them, and the
    // form starts again from there.
    return _TrickplayForm(key: ObjectKey(saved), saved: saved);
  }
}

class _TrickplayForm extends ConsumerStatefulWidget {
  const _TrickplayForm({super.key, required this.saved});

  final AdminTrickplaySettings saved;

  @override
  ConsumerState<_TrickplayForm> createState() => _TrickplayFormState();
}

class _TrickplayFormState extends ConsumerState<_TrickplayForm> {
  late TrickplaySettings _draft = widget.saved.settings;

  static bool _same(TrickplaySettings a, TrickplaySettings b) =>
      a.enabled == b.enabled &&
      a.intervalSeconds == b.intervalSeconds &&
      a.width == b.width &&
      a.keyframesOnly == b.keyframesOnly &&
      a.hardwareDecoding == b.hardwareDecoding;

  static TrickplaySettings _with(
    TrickplaySettings settings, {
    bool? enabled,
    int? intervalSeconds,
    int? width,
    bool? keyframesOnly,
    bool? hardwareDecoding,
  }) => TrickplaySettings(
    enabled: enabled ?? settings.enabled,
    intervalSeconds: intervalSeconds ?? settings.intervalSeconds,
    width: width ?? settings.width,
    keyframesOnly: keyframesOnly ?? settings.keyframesOnly,
    hardwareDecoding: hardwareDecoding ?? settings.hardwareDecoding,
  );

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final data = widget.saved;
    final settings = _draft;
    final dirty = !_same(settings, data.settings);
    void edit(TrickplaySettings next) => setState(() => _draft = next);
    final count = NumberFormat.decimalPattern(l.localeName);
    return SaveBarPage(
      title: l.settingsAdminTrickplay,
      dirty: dirty,
      onReset: () => setState(() => _draft = data.settings),
      onSave: () async {
        final api = ref.read(apiProvider);
        if (api == null) return;
        await api.admin.trickplay.update(settings);
        if (mounted) ref.invalidate(trickplayProvider);
      },
      child: AdminSections(
        bottom: !dirty,
        sections: [
          SettingsSection(
            title: l.webTrickplayTitle,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              spacing: 12,
              children: [
                Note(
                  l.webTrickplayDescriptionCount(
                    data.videos,
                    count.format(data.ready),
                  ),
                ),
                Panel(
                  rows: [
                    SwitchRow(
                      title: l.webTrickplayEnabled,
                      checked: settings.enabled,
                      onChanged: (on) => edit(_with(settings, enabled: on)),
                    ),
                    PickerRow<int>(
                      title: l.webTrickplayInterval,
                      options: [
                        for (final seconds in TrickplayInterval.all)
                          (seconds, l.webTrickplayIntervalOption(seconds)),
                      ],
                      current: settings.intervalSeconds,
                      onPicked: (seconds) =>
                          edit(_with(settings, intervalSeconds: seconds)),
                    ),
                    PickerRow<int>(
                      title: l.webTrickplayWidth,
                      options: [
                        for (final width in TrickplayWidth.all)
                          (width, l.webTrickplayWidthOption('$width')),
                      ],
                      current: settings.width,
                      onPicked: (width) => edit(_with(settings, width: width)),
                    ),
                    SwitchRow(
                      title: l.webTrickplayKeyframesOnly,
                      checked: settings.keyframesOnly,
                      onChanged: (on) =>
                          edit(_with(settings, keyframesOnly: on)),
                    ),
                    // Decoding on the GPU needs one set up for
                    // transcoding.
                    if (data.hardwareAcceleration != null)
                      SwitchRow(
                        title: l.webTrickplayHardwareDecoding,
                        checked: settings.hardwareDecoding,
                        onChanged: (on) =>
                            edit(_with(settings, hardwareDecoding: on)),
                      ),
                  ],
                ),
                if (data.hardwareAcceleration == null)
                  Note(l.webTrickplayHardwareDecodingUnavailable),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
