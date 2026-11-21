import 'dart:async';

import 'package:flutter/services.dart' show Clipboard, ClipboardData;
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/toasts.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import '../../player/playback_report.dart';
import 'settings_rows.dart';

/// The report of the latest playback, in Settings, About, as the Kotlin
/// app's `PlaybackDiagnosticsSection`: how the last try went, and ways to
/// read, copy, and clear it. It reads the report kept in memory, so it's
/// there after the player closes. What it holds and leaves out is in the
/// report's own first lines.
class PlaybackReportSection extends ConsumerWidget {
  const PlaybackReportSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final report = ref.watch(playbackReportProvider);
    final latest = report?.latest;
    return SettingsSection(
      title: l.diagnosticsTitle,
      child: Panel(
        rows: report == null || latest == null
            ? [
                Padding(
                  padding: const EdgeInsets.all(16),
                  child: Text(
                    l.diagnosticsEmpty,
                    style: KitText.sm.style(color: colors.mutedForeground),
                  ),
                ),
              ]
            : [
                ValueRow(
                  title: l.diagnosticsLatest,
                  value: diagnosticsStatus(l, latest),
                ),
                LinkRow(
                  title: l.diagnosticsShow,
                  onPressed: () => unawaited(
                    Dialog.show<void>(
                      context,
                      dismissLabel: l.diagnosticsClose,
                      builder: (context) => _ReportDialog(report: report),
                    ),
                  ),
                ),
                LinkRow(
                  title: l.diagnosticsCopy,
                  onPressed: () => copyReport(ref, l, report),
                ),
                LinkRow(
                  title: l.diagnosticsClear,
                  destructive: true,
                  onPressed: () =>
                      ref.read(playbackReportProvider.notifier).clear(),
                ),
              ],
      ),
    );
  }
}

/// Copies [report] as text. Android 13 and later confirm a copy themselves.
Future<void> copyReport(
  WidgetRef ref,
  AppLocalizations l,
  PlaybackReport report,
) async {
  await Clipboard.setData(ClipboardData(text: formatReport(report)));
  final sdk = ref.read(deviceDiagnosticsProvider).value?.sdk;
  if (sdk == null || sdk < 33) {
    unawaited(ref.read(toastProvider).show(l.diagnosticsCopied));
  }
}

/// "Failed (stream)": how the latest try went, and with which source.
String diagnosticsStatus(AppLocalizations l, AttemptDiagnostics attempt) {
  final mode = switch (attempt.mode) {
    SourceMode.direct => l.diagnosticsModeDirect,
    SourceMode.stream => l.diagnosticsModeStream,
    SourceMode.hls || SourceMode.encode => l.diagnosticsModeHls,
    SourceMode.local => l.diagnosticsModeLocal,
  };
  return switch (attempt.outcome) {
    AttemptOutcome.loading => l.diagnosticsStatusLoading(mode),
    AttemptOutcome.playing => l.diagnosticsStatusPlaying(mode),
    AttemptOutcome.failed => l.diagnosticsStatusFailed(mode),
    AttemptOutcome.replaced => l.diagnosticsStatusReplaced(mode),
    AttemptOutcome.closed => l.diagnosticsStatusClosed(mode),
  };
}

/// The whole report, with Copy and Close.
class _ReportDialog extends ConsumerWidget {
  const _ReportDialog({required this.report});

  final PlaybackReport report;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    return Dialog(
      title: l.diagnosticsTitle,
      actions: [
        MatineeButton(
          look: ButtonLook.secondary,
          onPressed: () => copyReport(ref, l, report),
          child: Text(l.diagnosticsCopy),
        ),
        MatineeButton(
          onPressed: () => Navigator.of(context).pop(),
          child: Text(l.diagnosticsClose),
        ),
      ],
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxHeight: 420),
        child: SingleChildScrollView(
          // Copy takes it all; selecting part of it needs Material's
          // selection, which only the kit may use.
          child: Text(
            formatReport(report),
            style: TextStyle(
              fontFamily: 'monospace',
              fontSize: 12,
              height: 16 / 12,
              color: colors.foreground,
            ),
          ),
        ),
      ),
    );
  }
}
