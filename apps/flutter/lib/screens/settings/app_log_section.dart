import 'dart:async';

import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/app_log.dart';
import '../../core/device.dart';
import '../../core/session.dart';
import '../../core/toasts.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import 'settings_rows.dart';

/// The app's log in About, as the Kotlin app's `AppLogSection`: shown,
/// copied, or shared, read afresh each time. What it takes out is in the
/// first row's description and the log's own header.
class AppLogSection extends ConsumerStatefulWidget {
  const AppLogSection({super.key});

  @override
  ConsumerState<AppLogSection> createState() => _AppLogSectionState();
}

class _AppLogSectionState extends ConsumerState<AppLogSection> {
  var _busy = false;

  Future<void> _withLog(FutureOr<void> Function(String log) use) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final log = await readAppLog(
        ref.read(logReaderProvider),
        ref.read(authStateProvider),
      );
      if (mounted) await use(log);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return SettingsSection(
      title: l.logsTitle,
      child: Panel(
        rows: [
          LinkRow(
            title: l.logsShow,
            description: l.logsNote,
            onPressed: () => _withLog((log) => showAppLog(context, log)),
          ),
          LinkRow(
            title: l.logsCopy,
            onPressed: () => _withLog((log) => copyAppLog(context, ref, log)),
          ),
          LinkRow(
            title: l.logsShare,
            onPressed: () => _withLog(
              (log) => ref.read(textSharerProvider)(l.logsTitle, log),
            ),
          ),
        ],
      ),
    );
  }
}

/// Puts [log] on the clipboard, and says so where Android doesn't: it
/// confirms a copy itself from Android 13 on.
Future<void> copyAppLog(BuildContext context, WidgetRef ref, String log) async {
  final copied = AppLocalizations.of(context).logsCopied;
  final toasts = ref.read(toastProvider);
  final android = int.tryParse(
    ref.read(deviceProvider).osVersion.split('.').first,
  );
  await Clipboard.setData(ClipboardData(text: log));
  if (android == null || android < 13) unawaited(toasts.show(copied));
}

/// [log] in a dialog, the latest line at the bottom, where it opens.
Future<void> showAppLog(BuildContext context, String log) {
  final l = AppLocalizations.of(context);
  final lines = log.trimRight().split('\n').reversed.toList();
  return Dialog.show<void>(
    context,
    dismissLabel: l.diagnosticsClose,
    builder: (dialog) {
      final colors = MatineeTheme.of(dialog);
      final height = MediaQuery.sizeOf(dialog).height * .55;
      return Consumer(
        builder: (dialog, ref, _) => Dialog(
          title: l.logsTitle,
          actions: [
            MatineeButton(
              look: ButtonLook.secondary,
              onPressed: () => copyAppLog(dialog, ref, log),
              child: Text(l.logsCopy),
            ),
            MatineeButton(
              onPressed: () => Navigator.of(dialog).pop(),
              child: Text(l.diagnosticsClose),
            ),
          ],
          child: SizedBox(
            height: height < 420 ? height : 420,
            child: ListView.builder(
              reverse: true,
              itemCount: lines.length,
              itemBuilder: (context, index) => Text(
                lines[index],
                style: TextStyle(
                  fontFamily: 'monospace',
                  fontSize: 11,
                  height: 15 / 11,
                  color: colors.foreground,
                ),
              ),
            ),
          ),
        ),
      );
    },
  );
}
