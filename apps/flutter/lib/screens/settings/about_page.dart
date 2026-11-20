import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/device.dart';
import '../../l10n/app_localizations.dart';
import '../../router.dart';
import 'app_log_section.dart';
import 'playback_report_section.dart';
import 'settings_rows.dart';
import 'settings_screen.dart';

/// Settings, About: what this app and device are, the licenses, then the
/// latest playback's report and the app's log, in the Kotlin app's order.
class AboutPage extends ConsumerWidget {
  const AboutPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final device = ref.watch(deviceProvider);
    return SettingsScaffold(
      title: l.aboutTitle,
      sections: [
        Panel(
          rows: [
            ValueRow(
              title: l.aboutVersion,
              value: kDebugMode
                  ? '${device.appVersion}, debug'
                  : device.appVersion,
            ),
            ValueRow(title: l.aboutAndroid, value: device.osVersion),
            ValueRow(title: l.aboutDevice, value: device.model),
          ],
        ),
        Panel(
          rows: [
            LinkRow(
              icon: SettingsPage.licenses.icon,
              title: l.aboutLicenses,
              onPressed: () =>
                  context.push(Routes.settingsPage(SettingsPage.licenses.key)),
            ),
          ],
        ),
        // The engines, and so the report, are Android's.
        if (defaultTargetPlatform == TargetPlatform.android)
          const PlaybackReportSection(),
        const AppLogSection(),
      ],
    );
  }
}
