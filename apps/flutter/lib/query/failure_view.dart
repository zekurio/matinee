import 'package:flutter/widgets.dart';

import '../core/failure_text.dart';
import '../kit/kit.dart';
import '../l10n/app_localizations.dart';

/// A read that failed, as the kit's [ErrorState] with the app's words:
/// [title] says what didn't load, the reason comes from [describeFailure],
/// and a failure to reach the server shows only the cloud and Try again.
/// [onHome] offers Back to Home too, for a page with nothing else on it.
class FailureState extends StatelessWidget {
  const FailureState({
    super.key,
    required this.title,
    required this.error,
    required this.onRetry,
    this.onHome,
  });

  final String title;
  final Object error;
  final VoidCallback? onRetry;
  final VoidCallback? onHome;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    return ErrorState(
      title: title,
      message: describeFailure(l, error),
      retryLabel: l.commonRetry,
      onRetry: onRetry,
      homeLabel: l.commonBackHome,
      onHome: onHome,
      disconnected: isDisconnect(error),
      disconnectedLabel: l.serverUnreachable,
    );
  }
}
