import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/device.dart';
import '../../core/session.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import '../../router.dart';
import '../sign_in/server_switcher.dart';
import 'about_page.dart';
import 'account_page.dart';
import 'admin/admin_parts.dart';
import 'admin/admin_settings.dart';
import 'appearance_page.dart';
import 'playback_page.dart';
import 'settings_rows.dart';

/// A category of Settings, as the Kotlin app's `SettingsPage`: each is a
/// row on the first page and opens a page of its own at
/// `Routes.settingsPage(key)`. The Kotlin app's subtitles and downloads
/// pages aren't here yet; the admin pages are `AdminCategory`.
enum SettingsPage {
  account('account', Lucide.userRound),
  appearance('appearance', Lucide.palette),
  playback('playback', Lucide.tvPlay),
  about('about', Lucide.info),
  licenses('licenses', Lucide.list);

  const SettingsPage(this.key, this.icon);

  final String key;
  final String icon;

  String title(AppLocalizations l) => switch (this) {
    account => l.settingsPageAccount,
    appearance => l.settingsPageAppearance,
    playback => l.settingsPagePlayback,
    about => l.aboutTitle,
    licenses => l.aboutLicenses,
  };

  /// Whether this device has the page: the engines are Android's.
  bool get available =>
      this != playback || defaultTargetPlatform == TargetPlatform.android;

  static SettingsPage? of(String key) {
    for (final page in values) {
      if (page.key == key && page.available) return page;
    }
    return null;
  }
}

/// A Settings page: Back and its title, then its sections down a list, no
/// wider than a phone's column on a tablet.
class SettingsScaffold extends StatelessWidget {
  const SettingsScaffold({
    super.key,
    required this.title,
    required this.sections,
  });

  final String title;
  final List<Widget> sections;

  @override
  Widget build(BuildContext context) => PageFrame(
    title: title,
    backLabel: AppLocalizations.of(context).commonBack,
    onBack: () => context.pop(),
    child: ListView.separated(
      padding: EdgeInsets.fromLTRB(
        CardMetrics.gutter,
        8,
        CardMetrics.gutter,
        MediaQuery.paddingOf(context).bottom + 20,
      ),
      itemCount: sections.length,
      separatorBuilder: (context, index) => const SizedBox(height: 28),
      itemBuilder: (context, index) => Align(
        alignment: AlignmentDirectional.topStart,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 720),
          child: sections[index],
        ),
      ),
    ),
  );
}

/// Settings' first page, as the Kotlin app's: offline mode on top, the
/// categories, then the server this app is on and its version. Switching
/// server or account and signing out are on the profile, with the account.
class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final auth = ref.watch(authStateProvider);
    final device = ref.watch(deviceProvider);
    final server = activeServer(ref.watch(savedServersProvider));
    Widget row(SettingsPage page) => LinkRow(
      icon: page.icon,
      title: page.title(l),
      onPressed: () => context.push(Routes.settingsPage(page.key)),
    );
    return SettingsScaffold(
      title: l.shellSettings,
      sections: [
        // On top, as the Kotlin app has it: the app leaves the server alone
        // and shows the downloads. A TV has none, so it's never offline.
        if (!device.isTv)
          Panel(
            rows: [
              SwitchRow(
                icon: Lucide.cloudOff,
                title: l.settingsOfflineMode,
                checked: auth is Offline,
                onChanged: (on) =>
                    ref.read(sessionProvider.notifier).setOfflineMode(on: on),
              ),
            ],
          ),
        Panel(
          rows: [
            // The sessions live on the server.
            if (auth is! Offline) row(SettingsPage.account),
            for (final page in const [
              SettingsPage.appearance,
              SettingsPage.playback,
              SettingsPage.about,
            ])
              if (page.available) row(page),
          ],
        ),
        // The server's settings, for an account it says is an admin.
        if (canAdminister(auth)) const AdminSection(),
        SettingsSection(
          title: l.settingsServer,
          child: Panel(
            rows: [
              Padding(
                padding: const EdgeInsets.all(16),
                child: Row(
                  spacing: 14,
                  children: [
                    KitIcon(Lucide.server, color: colors.mutedForeground),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            server == null ? '' : serverTitle(server),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: KitText.base.style(color: colors.foreground),
                          ),
                          Text(
                            l.settingsVersion(device.appVersion),
                            style: KitText.xs.style(
                              color: colors.mutedForeground,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

/// A category's page, by its key in the route; the first page for a key
/// it doesn't know, or one this device doesn't have. The admin pages'
/// keys open theirs, for an admin.
class SettingsPageScreen extends StatelessWidget {
  const SettingsPageScreen({super.key, required this.pageKey});

  final String pageKey;

  @override
  Widget build(BuildContext context) => switch (SettingsPage.of(pageKey)) {
    SettingsPage.account => const AccountPage(),
    SettingsPage.appearance => const AppearancePage(),
    SettingsPage.playback => const PlaybackPage(),
    SettingsPage.about => const AboutPage(),
    SettingsPage.licenses => const LicensesPage(),
    null => AdminCategory.of(pageKey)?.page ?? const SettingsScreen(),
  };
}
