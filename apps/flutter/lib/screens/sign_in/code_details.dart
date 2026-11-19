import 'package:flutter/widgets.dart';

import '../../api/matinee_api.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import 'auth_layout.dart';
import 'server_switcher.dart';

/// The code to type, where to type it, and whether it's still waiting, as
/// the phone's screen and the TV's show them.
class CodeDetails extends StatelessWidget {
  const CodeDetails({
    super.key,
    required this.code,
    required this.error,
    required this.onRetry,
    this.afterQr = false,
    this.large = false,
  });

  final DeviceCode? code;
  final String? error;
  final VoidCallback? onRetry;

  /// Words the steps as the other way in, under a QR code.
  final bool afterQr;

  /// A TV's sizes, read from across a room.
  final bool large;

  @override
  Widget build(BuildContext context) {
    final words = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final muted = (large ? KitText.lg : KitText.sm).style(
      color: colors.mutedForeground,
    );
    final shown = code;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        if (shown != null) ...[
          Text(
            afterQr
                ? words.signinCodeEnter(withoutScheme(shown.verificationUri))
                : words.signinCodeEnterOnly(
                    withoutScheme(shown.verificationUri),
                  ),
            style: muted,
          ),
          const SizedBox(height: 4),
          Semantics(
            label: shown.userCode,
            child: ExcludeSemantics(
              child: Text(
                shown.userCode,
                maxLines: 1,
                style: TextStyle(
                  fontFamily: 'monospace',
                  fontSize: large ? 56 : 36,
                  height: 1.2,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 4,
                  color: colors.foreground,
                ),
              ),
            ),
          ),
          const SizedBox(height: 20),
          Row(
            spacing: 10,
            children: [
              Spinner(size: 14, color: colors.mutedForeground),
              Text(
                words.signinCodeWaiting,
                style: KitText.xs.style(color: colors.mutedForeground),
              ),
            ],
          ),
        ] else if (error == null)
          Text(words.signinCodeLoading, style: muted),
        if (error case final message?) ...[
          const SizedBox(height: 12),
          AuthError(message),
          if (onRetry != null) ...[
            const SizedBox(height: 8),
            MatineeButton(
              look: ButtonLook.outline,
              onPressed: onRetry,
              child: Text(words.commonRetry),
            ),
          ],
        ],
      ],
    );
  }
}
