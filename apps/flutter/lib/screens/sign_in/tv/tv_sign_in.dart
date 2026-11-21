import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/failure_text.dart';
import '../../../core/session.dart';
import '../../../core/sign_in_state.dart';
import '../../../core/unreachability.dart';
import '../../../kit/kit.dart';
import '../../../kit/tv/tv_metrics.dart';
import '../../../l10n/app_localizations.dart';
import '../auth_layout.dart';
import '../login_backdrop.dart';
import '../server_switcher.dart';
import 'tv_frame.dart';
import 'tv_servers.dart';

/// Signing a TV in with a code, the only way it has: on the left, the
/// title, one sentence on where to go, and the code to type there, read
/// from the couch; on the right, the QR code to scan, large enough for a
/// phone across the room. Changing the server waits small at the bottom
/// left. A code that runs out waits for a new one to be asked for, so a TV
/// left here doesn't keep asking the server for codes.
///
/// This is quieter than the Kotlin app's screen on purpose: no line on the
/// phone app's Settings, and the server row out of the content.
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
    final muted = TvType.body.style(color: colors.mutedForeground);

    return KeyedSubtree(
      key: ValueKey(auth.server),
      // A server being added: Back goes to finding or typing another, its
      // control back to the one in use.
      child: PopScope(
        canPop: !auth.adding,
        onPopInvokedWithResult: (didPop, _) {
          if (!didPop) session.addServer();
        },
        child: TvAuthFrame(
          title: words.tvSigninTitle,
          split: .56,
          backdrop: LoginBackdropWall(settings: auth.config.loginBackdrop),
          side: [
            // A server not set up yet can't approve anyone; its setup runs
            // in a browser.
            if (auth.config.setup != null)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Text(words.signinSetup, style: muted),
              ),
            if (flow.expired)
              Padding(
                padding: const EdgeInsets.only(top: 16),
                child: Text(
                  words.tvSigninExpired,
                  style: TvType.title.style(color: colors.foreground),
                ),
              )
            else if (code != null) ...[
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: _Where(
                  words: words,
                  address: withoutScheme(code.verificationUri),
                  style: muted,
                  emphasis: colors.foreground,
                ),
              ),
              Padding(
                padding: const EdgeInsets.only(top: 8),
                child: Semantics(
                  label: code.userCode,
                  child: ExcludeSemantics(
                    child: FittedBox(
                      fit: BoxFit.scaleDown,
                      alignment: AlignmentDirectional.centerStart,
                      child: Text(
                        code.userCode,
                        maxLines: 1,
                        style: tvCodeStyle.copyWith(
                          fontSize: 56,
                          height: 1.2,
                          color: colors.foreground,
                        ),
                      ),
                    ),
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Row(
                  spacing: 12,
                  children: [
                    Spinner(size: 18, color: colors.mutedForeground),
                    Flexible(
                      child: Text(words.signinCodeWaiting, style: muted),
                    ),
                  ],
                ),
              ),
            ] else if (error == null)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Text(words.signinCodeLoading, style: muted),
              ),
            if (error != null)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Semantics(
                  liveRegion: true,
                  child: Text(
                    describeFailure(words, error),
                    style: TvType.body.style(color: colors.danger),
                  ),
                ),
              ),
          ],
          footer: Row(
            mainAxisSize: MainAxisSize.min,
            spacing: 12,
            children: [
              if (stuck)
                TvAuthAction(
                  label: flow.expired
                      ? words.tvSigninNewCode
                      : words.commonRetry,
                  icon: Lucide.refreshCw,
                  quiet: false,
                  autofocus: true,
                  onPressed: ref
                      .read(deviceCodeSignInProvider(false).notifier)
                      .newCode,
                ),
              // Nothing else gets a TV out of here, and it may have the
              // wrong server.
              if (current != null)
                TvAuthAction(
                  label: words.serversBackTo(serverTitle(current)),
                  icon: Lucide.arrowLeft,
                  autofocus: !stuck,
                  onPressed: session.cancelAdd,
                )
              else
                TvAuthAction(
                  label: words.connectChangeServer,
                  detail: server,
                  icon: Lucide.server,
                  autofocus: !stuck,
                  onPressed: () => showTvServerPanel(context),
                ),
            ],
          ),
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

/// Where to type the code, with its address in [emphasis].
class _Where extends StatelessWidget {
  const _Where({
    required this.words,
    required this.address,
    required this.style,
    required this.emphasis,
  });

  final AppLocalizations words;
  final String address;
  final TextStyle style;
  final Color emphasis;

  @override
  Widget build(BuildContext context) {
    final text = words.tvSigninScanOrEnter(address);
    final at = text.indexOf(address);
    return Text.rich(
      at < 0
          ? TextSpan(text: text)
          : TextSpan(
              children: [
                TextSpan(text: text.substring(0, at)),
                TextSpan(
                  text: address,
                  style: TextStyle(color: emphasis),
                ),
                TextSpan(text: text.substring(at + address.length)),
              ],
            ),
      style: style,
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
                    style: TvType.title.style(color: colors.mutedForeground),
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
    final unreadable = auth.reason == Unreachability.unreadableSession;
    return TvAuthFrame(
      title: noNetwork
          ? words.unreachableOfflineTitle
          : unreadable
          ? words.unreachableSessionTitle
          : words.unreachableTitle,
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
            style: TvType.label.style(color: colors.mutedForeground),
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
        if (unreadable) ...[
          const SizedBox(height: 10),
          TvListItem(
            title: words.unreachableSignInAgain,
            icon: Lucide.logIn,
            onPressed: ref.read(sessionProvider.notifier).signInAgain,
          ),
        ],
        const SizedBox(height: 10),
        TvListItem(
          title: words.connectChangeServer,
          icon: Lucide.server,
          quiet: true,
          onPressed: () => showTvServerPanel(context),
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
            const LogoMark(size: 72),
            Spinner(size: 32, color: colors.mutedForeground),
            Text(
              AppLocalizations.of(context)
                  .connectConnecting(withoutScheme(auth.server)),
              style: TvType.body.style(color: colors.mutedForeground),
            ),
          ],
        ),
      ),
    );
  }
}
