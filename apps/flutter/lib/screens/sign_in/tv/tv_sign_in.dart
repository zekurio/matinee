import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/failure_text.dart';
import '../../../core/session.dart';
import '../../../core/sign_in_state.dart';
import '../../../core/unreachability.dart';
import '../../../kit/kit.dart';
import '../../../l10n/app_localizations.dart';
import '../auth_layout.dart';
import '../code_details.dart';
import '../login_backdrop.dart';
import '../server_switcher.dart';
import 'tv_frame.dart';

/// Signing a TV in with a code, the only way it has: the QR code to scan on
/// the right, large enough for a phone across the room, and on the left the
/// address and the code to type there, read from the couch. A code that
/// runs out waits for a new one to be asked for, so a TV left here doesn't
/// keep asking the server for codes.
class TvSignInScreen extends ConsumerWidget {
  const TvSignInScreen({super.key});

  static const _qrSize = 272.0;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authStateProvider);
    if (auth is! SignedOut) return const AuthBlank();
    final words = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final flow = ref.watch(deviceCodeSignInProvider(false));
    final session = ref.read(sessionProvider.notifier);
    final code = flow.code;
    final error = flow.error;
    // A code that ran out, or never came, puts focus on getting one; else
    // the one way out.
    final stuck = flow.expired || (code == null && error != null);
    final current = auth.adding
        ? activeServer(ref.watch(savedServersProvider))
        : null;
    final server = withoutScheme(auth.server);

    return KeyedSubtree(
      key: ValueKey(auth.server),
      // A server being added: Back goes to finding or typing another, its
      // row back to the one in use.
      child: PopScope(
        canPop: !auth.adding,
        onPopInvokedWithResult: (didPop, _) {
          if (!didPop) session.addServer();
        },
        child: TvAuthFrame(
          title: words.tvSigninTitle,
          // A server not set up yet can't approve anyone; its setup runs in
          // a browser.
          description: auth.config.setup != null
              ? words.signinSetup
              : words.tvSigninDescription,
          split: .56,
          backdrop: LoginBackdropWall(settings: auth.config.loginBackdrop),
          side: [
            Padding(
              padding: const EdgeInsets.only(top: 28),
              child: flow.expired
                  ? Text(
                      words.tvSigninExpired,
                      style: KitText.xl.style(
                        color: colors.foreground,
                        weight: FontWeight.w600,
                      ),
                    )
                  : CodeDetails(
                      code: code,
                      error: error == null
                          ? null
                          : describeFailure(words, error),
                      onRetry: null,
                      afterQr: true,
                      large: true,
                    ),
            ),
            const SizedBox(height: 24),
            SizedBox(
              width: 360,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                spacing: 10,
                children: [
                  if (stuck)
                    TvListItem(
                      title: flow.expired
                          ? words.tvSigninNewCode
                          : words.commonRetry,
                      icon: Lucide.refreshCw,
                      autofocus: true,
                      onPressed: ref
                          .read(deviceCodeSignInProvider(false).notifier)
                          .newCode,
                    ),
                  // Nothing else gets a TV out of here, and it may have the
                  // wrong server.
                  if (current != null)
                    TvListItem(
                      title: words.serversBackTo(serverTitle(current)),
                      subtitle: server,
                      icon: Lucide.arrowLeft,
                      quiet: true,
                      autofocus: !stuck,
                      onPressed: session.cancelAdd,
                    )
                  else
                    TvListItem(
                      title: words.connectChangeServer,
                      subtitle: server,
                      icon: Lucide.server,
                      quiet: true,
                      autofocus: !stuck,
                      onPressed: () => showServerSwitcher(context),
                    ),
                ],
              ),
            ),
          ],
          children: [
            Center(
              child: _CodeQr(flow: flow, size: _qrSize),
            ),
          ],
        ),
      ),
    );
  }
}

/// The QR code of the link page with the code in it; a spinner before it
/// comes, a blank card once it ran out.
class _CodeQr extends StatelessWidget {
  const _CodeQr({required this.flow, required this.size});

  final DeviceCodeSignInState flow;
  final double size;

  @override
  Widget build(BuildContext context) {
    final words = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final code = flow.code;
    if (code != null) {
      return QrCodeCard(
        text: code.verificationUriComplete,
        label: words.signinCodeQr(code.userCode),
        size: size,
      );
    }
    final radius = BorderRadius.circular(size / 14);
    return SizedBox.square(
      dimension: size,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: colors.foreground.withValues(alpha: .05),
          borderRadius: radius,
          border: Border.all(
            color: colors.foreground.withValues(alpha: .1),
            width: 2,
          ),
        ),
        child: Center(
          child: flow.expired
              ? Padding(
                  padding: const EdgeInsets.all(24),
                  child: Text(
                    words.tvSigninExpiredShort,
                    textAlign: TextAlign.center,
                    style: KitText.xl.style(
                      color: colors.mutedForeground,
                      weight: FontWeight.w600,
                    ),
                  ),
                )
              : flow.error == null
              ? Spinner(size: 32, color: colors.accent)
              : null,
        ),
      ),
    );
  }
}

/// The saved server didn't answer: what happened and why on the left, and
/// Retry, focused, over the way to the server list on the right. The app
/// also tries again when the network comes back. A TV has no downloads, so
/// no offline mode.
class TvUnreachableScreen extends ConsumerWidget {
  const TvUnreachableScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authStateProvider);
    if (auth is! Unreachable) return const AuthBlank();
    final words = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final noNetwork = auth.reason == Unreachability.noNetwork;
    return TvAuthFrame(
      title: noNetwork ? words.unreachableOfflineTitle : words.unreachableTitle,
      description: unreachableMessage(
        words,
        auth.reason,
        auth.server,
        canWatchOffline: false,
      ),
      side: [
        Padding(
          padding: const EdgeInsets.only(top: 36),
          child: Text(
            auth.server,
            style: KitText.px15.style(
              color: colors.mutedForeground,
              weight: FontWeight.w500,
            ),
          ),
        ),
      ],
      children: [
        TvListItem(
          title: auth.retrying
              ? words.tvUnreachableRetrying
              : words.commonRetry,
          icon: Lucide.refreshCw,
          autofocus: true,
          trailing: auth.retrying ? const Spinner(size: 22) : null,
          // While it tries, Select waits for the answer.
          onPressed: auth.retrying
              ? null
              : () => ref.read(sessionProvider.notifier).retry(),
        ),
        const SizedBox(height: 10),
        TvListItem(
          title: words.connectChangeServer,
          icon: Lucide.server,
          quiet: true,
          onPressed: () => showServerSwitcher(context),
        ),
      ],
    );
  }
}

/// Checking the saved server and session, as the app starts.
class TvConnectingScreen extends ConsumerWidget {
  const TvConnectingScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final auth = ref.watch(authStateProvider);
    if (auth is! Connecting) return const AuthBlank();
    final colors = MatineeTheme.of(context);
    return ColoredBox(
      color: colors.background,
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          spacing: 28,
          children: [
            const Logo(height: 36),
            Spinner(size: 32, color: colors.mutedForeground),
            Text(
              AppLocalizations.of(context)
                  .connectConnecting(withoutScheme(auth.server)),
              style: KitText.base.style(color: colors.mutedForeground),
            ),
          ],
        ),
      ),
    );
  }
}
