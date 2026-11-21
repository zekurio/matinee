import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../downloads/downloads.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import '../../router.dart';

/// What a tab that needs the server says offline: [message], what comes
/// back once the server answers, and when this server has finished
/// downloads, that they still play, with the way to them.
class OfflineNote extends ConsumerWidget {
  const OfflineNote({super.key, required this.message});

  final String message;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final downloads = ref.watch(
      shownDownloadsProvider.select(
        (shown) => shown.values.any((entry) => entry.done),
      ),
    );
    return EmptyState(
      icon: Lucide.cloudOff,
      title: l.unreachableOfflineTitle,
      message: [
        message,
        if (downloads) l.unreachableOfflineDownloads,
      ].join(' '),
      action: downloads
          ? MatineeButton(
              look: ButtonLook.outline,
              onPressed: () => context.go(Routes.downloads),
              child: Text(l.downloadsTitle),
            )
          : null,
    );
  }
}
