import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/offline.dart';
import '../../core/session.dart';
import '../../core/sign_in_state.dart';
import '../../core/unreachability.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import 'auth_layout.dart';
import 'server_switcher.dart';

/// Whether the downloads can play without the server: there are some, and an
/// account to show them under.
bool canWatchOffline(WidgetRef ref) =>
    ref.watch(hasDownloadsProvider) &&
    ref.read(sessionProvider.notifier).lastUser != null;

/// The saved server didn't answer. Laid out like sign-in: what happened, one
/// line on why, then the ways on. Without a network the downloads come
/// first.
class UnreachableScreen extends ConsumerWidget {
  const UnreachableScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authStateProvider);
    if (auth is! Unreachable) return const AuthBlank();
    final words = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final session = ref.read(sessionProvider.notifier);
    final offline = canWatchOffline(ref);
    final noNetwork = auth.reason == Unreachability.noNetwork;

    Widget retry(ButtonLook look) => MatineeButton(
      look: look,
      leading: auth.retrying ? null : Lucide.refreshCw,
      // A saved LAN server is unreachable without local network access,
      // which Settings can take back: retrying asks again.
      onPressed: auth.retrying ? null : () => unawaited(session.retry()),
      child: BusyLabel(
        busy: auth.retrying,
        label: words.commonRetry,
        color: look == ButtonLook.primary
            ? colors.accentForeground
            : colors.foreground,
      ),
    );
    Widget watchOffline(ButtonLook look) => MatineeButton(
      look: look,
      leading: Lucide.download,
      onPressed: () => session.setOfflineMode(on: true),
      child: Text(words.downloadsWatchOffline),
    );

    return AuthLayout(
      children: [
        AuthHeading(
          title: noNetwork
              ? words.unreachableOfflineTitle
              : words.unreachableTitle,
          description: unreachableMessage(
            words,
            auth.reason,
            auth.server,
            canWatchOffline: offline,
          ),
        ),
        const SizedBox(height: 28),
        if (!offline)
          retry(ButtonLook.primary)
        else if (noNetwork) ...[
          watchOffline(ButtonLook.primary),
          const SizedBox(height: 10),
          retry(ButtonLook.outline),
        ] else ...[
          retry(ButtonLook.primary),
          const SizedBox(height: 10),
          watchOffline(ButtonLook.outline),
        ],
        const SizedBox(height: 32),
        const Center(child: ChangeServerButton()),
      ],
    );
  }
}

/// Checking the saved server and session, as the app starts.
class ConnectingScreen extends ConsumerWidget {
  const ConnectingScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authStateProvider);
    if (auth is! Connecting) return const AuthBlank();
    final colors = MatineeTheme.of(context);
    return ColoredBox(
      color: colors.background,
      child: SafeArea(
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            spacing: 20,
            children: [
              Spinner(size: 32, color: colors.accent),
              Text(
                AppLocalizations.of(context).connectConnecting(auth.server),
                textAlign: TextAlign.center,
                style: KitText.sm.style(color: colors.mutedForeground),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
