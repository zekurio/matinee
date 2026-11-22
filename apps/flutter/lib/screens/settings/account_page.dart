import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../api/matinee_api.dart';
import '../../core/failure_text.dart';
import '../../core/session.dart';
import '../../core/toasts.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import '../../query/failure_view.dart';
import '../../query/refresh.dart';
import '../../query/server_data.dart';
import '../../router.dart';
import 'devices.dart';
import 'settings_rows.dart';
import 'settings_screen.dart';

/// The places the account is signed in.
final accountSessionsProvider = serverQuery(
  (api) => api.account.sessions.list(),
);

/// A little more than the server's poll interval for devices signing in
/// with a code: a device approved from here gets its session on its next
/// poll, up to five seconds after.
const devicePoll = Duration(seconds: 6);

/// Settings, Account: signing in another device, then the places the account is
/// signed in, each but this one with a way to sign it out. Switching server or
/// account and signing out are on the profile.
class AccountPage extends ConsumerStatefulWidget {
  const AccountPage({super.key});

  @override
  ConsumerState<AccountPage> createState() => _AccountPageState();
}

class _AccountPageState extends ConsumerState<AccountPage> {
  Timer? _again;

  @override
  void dispose() {
    _again?.cancel();
    super.dispose();
  }

  /// Back from signing in a device: show it, and ask once more after the
  /// device's next poll.
  void _returned() {
    ref.invalidate(accountSessionsProvider);
    _again?.cancel();
    _again = Timer(devicePoll, () {
      if (mounted) ref.invalidate(accountSessionsProvider);
    });
  }

  Future<void> _signOut(Session session) async {
    final l = AppLocalizations.of(context);
    final api = ref.read(apiProvider);
    final toasts = ref.read(toastProvider);
    try {
      if (api == null) throw const NotConnected();
      await api.account.sessions.revoke(session.id);
      if (mounted) ref.invalidate(accountSessionsProvider);
    } on Object catch (error) {
      unawaited(
        toasts.show(
          l.accountSessionsSignOutFailed,
          description: describeFailure(l, error),
          kind: ToastKind.error,
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final sessions = ref.watch(accountSessionsProvider);
    final list = sessions.value;
    return ReturnWatcher(
      path: Routes.settingsPage(SettingsPage.account.key),
      onReturn: _returned,
      child: SettingsScaffold(
        title: l.settingsPageAccount,
        sections: [
          Panel(
            rows: [
              LinkRow(
                icon: Lucide.scanQrCode,
                title: l.linkTitle,
                description: l.linkRowDescription,
                onPressed: () => context.push(Routes.linkDevice),
              ),
            ],
          ),
          SettingsSection(
            title: l.accountSessionsTitle,
            child: list != null
                ? Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    spacing: 12,
                    children: [
                      for (final session in list)
                        SessionRow(
                          session: session,
                          onSignOut: () => _signOut(session),
                        ),
                    ],
                  )
                : sessions.hasError
                ? FailureState(
                    title: l.accountSessionsFailed,
                    error: sessions.error!,
                    onRetry: () => ref.invalidate(accountSessionsProvider),
                  )
                : Text(
                    '…',
                    style: KitText.sm.style(color: colors.mutedForeground),
                  ),
          ),
        ],
      ),
    );
  }
}

/// What a session in the list is called: the device's name, the browser,
/// or the kind of app.
String sessionName(Session session, AppLocalizations l) =>
    session.deviceName ??
    session.browser ??
    switch (session.platform) {
      final platform? => l.accountDeviceApp(platformLabel(platform)),
      null => l.accountDeviceBrowser,
    };

/// A session as a card: what it runs on, its name, this device's marked,
/// when it signed in, and signing out any but this one.
class SessionRow extends StatelessWidget {
  const SessionRow({super.key, required this.session, required this.onSignOut});

  final Session session;
  final VoidCallback onSignOut;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final name = sessionName(session, l);
    final signedIn = DateTime.tryParse(session.createdAt)?.toLocal();
    final detail = [
      if (session.platform case final platform?)
        l.accountDeviceApp(platformLabel(platform)),
      l.accountSessionsSignedIn(
        signedIn == null
            ? '—'
            : DateFormat.yMMMd(l.localeName).format(signedIn),
      ),
    ].join(' · ');
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: KitRadius.panel,
        border: Border.all(color: colors.border),
      ),
      child: Row(
        spacing: 14,
        children: [
          Container(
            width: 40,
            height: 40,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: colors.secondary,
              borderRadius: const BorderRadius.all(Radius.circular(10)),
            ),
            child: KitIcon(
              platformIcon(session.platform),
              color: colors.mutedForeground,
            ),
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  spacing: 8,
                  children: [
                    Flexible(
                      child: Text(
                        name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: KitText.base.style(color: colors.foreground),
                      ),
                    ),
                    if (session.current)
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 2,
                        ),
                        decoration: BoxDecoration(
                          color: colors.secondary,
                          borderRadius: KitRadius.pill,
                        ),
                        child: Text(
                          l.accountSessionsThisDevice,
                          style: KitText.px11.style(
                            color: colors.foreground,
                            weight: FontWeight.w500,
                          ),
                        ),
                      ),
                  ],
                ),
                Text(
                  detail,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: KitText.px13.style(color: colors.mutedForeground),
                ),
              ],
            ),
          ),
          if (!session.current)
            RoundIconButton(
              icon: Lucide.logOut,
              label: l.accountSessionsSignOutNamed(name),
              size: 40,
              iconSize: 18,
              background: const Color(0x00000000),
              onPressed: onSignOut,
            ),
        ],
      ),
    );
  }
}
