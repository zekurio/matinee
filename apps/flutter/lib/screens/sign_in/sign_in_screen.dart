import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/failure_text.dart';
import '../../core/link_opener.dart';
import '../../core/session.dart';
import '../../core/sign_in_state.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import 'auth_layout.dart';
import 'code_details.dart';
import 'login_backdrop.dart';
import 'server_switcher.dart';

/// Signing in to the server: through the browser, or with a code approved
/// from a device that's signed in. A server being added goes back to the
/// one in use, or to typing another address, with the system's back.
class SignInScreen extends ConsumerStatefulWidget {
  const SignInScreen({super.key});

  @override
  ConsumerState<SignInScreen> createState() => _SignInScreenState();
}

class _SignInScreenState extends ConsumerState<SignInScreen> {
  bool _withCode = false;
  bool _busy = false;
  String? _error;

  Future<void> _browser() async {
    setState(() {
      _error = null;
      _busy = true;
    });
    final failure = await ref
        .read(sessionProvider.notifier)
        .signInWithBrowser();
    if (!mounted) return;
    final words = AppLocalizations.of(context);
    setState(() {
      _busy = false;
      _error = failure == null ? null : describeSignInFailure(words, failure);
    });
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authStateProvider);
    if (auth is! SignedOut) return const AuthBlank();
    final adding = auth.adding;
    // Another server's sign-in starts afresh, with its own code.
    return KeyedSubtree(
      key: ValueKey(auth.server),
      child: PopScope(
        // Back from the code to the browser, then, for a server being added,
        // to typing another address.
        canPop: !_withCode && !adding,
        onPopInvokedWithResult: (didPop, _) {
          if (didPop) return;
          if (_withCode) {
            setState(() => _withCode = false);
          } else {
            ref.read(sessionProvider.notifier).addServer();
          }
        },
        child: AuthLayout(
          // The server's login backdrop, if it has one on.
          backdrop: LoginBackdropWall(settings: auth.config.loginBackdrop),
          children: _withCode
              ? [_CodeSignIn(onBack: () => setState(() => _withCode = false))]
              : _browserChildren(context, auth),
        ),
      ),
    );
  }

  List<Widget> _browserChildren(BuildContext context, SignedOut auth) {
    final words = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final config = auth.config;
    final oidc = config.oidc;
    return [
      AuthHeading(
        title: words.signinTitle,
        description: words.signinServer(withoutScheme(auth.server)),
      ),
      const SizedBox(height: 28),
      if (config.setup != null) ...[
        Text(
          words.signinSetup,
          style: KitText.sm.style(color: colors.mutedForeground),
        ),
        const SizedBox(height: 16),
      ],
      MatineeButton(
        onPressed: _busy ? null : () => unawaited(_browser()),
        leading: _busy
            ? null
            : config.passkeys
            ? Lucide.keyRound
            : Lucide.logIn,
        child: BusyLabel(
          busy: _busy,
          color: colors.accentForeground,
          label: !config.passkeys && oidc != null
              ? words.signinOidc(oidc.displayName)
              : words.signinBrowser,
        ),
      ),
      const SizedBox(height: 10),
      MatineeButton(
        look: ButtonLook.ghost,
        leading: Lucide.smartphone,
        onPressed: () => setState(() => _withCode = true),
        child: Text(words.signinWithCode),
      ),
      if (_error case final error?) ...[
        const SizedBox(height: 12),
        AuthError(error, centered: true),
      ],
      const SizedBox(height: 32),
      // A server being added goes back to the one in use; a saved one
      // offers the others.
      Center(
        child: auth.adding ? const BackToServer() : const ChangeServerButton(),
      ),
    ];
  }
}

/// The OAuth device grant: show the code, and wait while someone signed in
/// approves this device at the server's /link page. A phone or tablet shows
/// no QR code, since the device that would scan it is usually the one
/// signing in.
class _CodeSignIn extends ConsumerWidget {
  const _CodeSignIn({required this.onBack});

  final VoidCallback onBack;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final words = AppLocalizations.of(context);
    final flow = ref.watch(deviceCodeSignInProvider(true));
    final code = flow.code;
    final error = flow.error;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        AuthHeading(
          title: words.signinCodeTitleTyped,
          description: words.signinCodeApprove,
        ),
        const SizedBox(height: 28),
        CodeDetails(
          code: code,
          error: error == null ? null : describeFailure(words, error),
          // Only a code that never came needs a new start; a poll that
          // failed tries again on its own.
          onRetry: code == null
              ? ref.read(deviceCodeSignInProvider(true).notifier).newCode
              : null,
        ),
        const SizedBox(height: 24),
        if (code != null)
          MatineeButton(
            look: ButtonLook.outline,
            leading: Lucide.link,
            onPressed: () => unawaited(
              ref.read(linkOpenerProvider)(
                Uri.parse(code.verificationUriComplete),
              ),
            ),
            child: Text(words.signinCodeOpen),
          ),
        const SizedBox(height: 12),
        MatineeButton(
          look: ButtonLook.ghost,
          onPressed: onBack,
          child: Text(words.signinCodeBack),
        ),
      ],
    );
  }
}
