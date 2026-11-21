import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/session.dart';
import '../../kit/kit.dart';
import '../../kit/tv/tv.dart';
import '../../l10n/app_localizations.dart';
import '../sign_in/server_switcher.dart' show withoutScheme;

/// Asks before the TV signs itself out, since signing in again takes a
/// phone and a code: a panel with Sign out and Cancel, focus on Cancel so
/// a stray Select keeps the session.
Future<void> confirmTvSignOut(BuildContext context, WidgetRef ref) async {
  final l = AppLocalizations.of(context);
  final server = switch (ref.read(authStateProvider)) {
    SignedIn(:final server) || Offline(:final server) => server,
    _ => null,
  };
  final sure = await showTvPanel<bool>(
    context,
    title: server == null
        ? l.shellSignOut
        : l.tvSignOutTitle(withoutScheme(server)),
    description: l.tvSignOutDescription,
    builder: (panel) => [
      TvListItem(
        title: l.shellSignOut,
        icon: Lucide.logOut,
        quiet: true,
        destructive: true,
        onPressed: () => Navigator.of(panel).pop(true),
      ),
      TvListItem(
        title: l.commonCancel,
        icon: Lucide.x,
        quiet: true,
        autofocus: true,
        onPressed: () => Navigator.of(panel).pop(false),
      ),
    ],
  );
  if (sure == true) await ref.read(sessionProvider.notifier).signOut();
}
