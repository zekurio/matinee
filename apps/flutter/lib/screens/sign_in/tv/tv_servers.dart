import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/session.dart';
import '../../../kit/kit.dart';
import '../../../kit/tv/tv.dart';
import '../../../l10n/app_localizations.dart';
import '../../../router.dart' show addServerReturnProvider;
import '../server_switcher.dart' show serverFacts, serverTitle;

/// What the server panel does once it has closed.
typedef _Then = void Function(SessionNotifier session);

/// The saved servers in the TV's panel at the right edge, in place of the
/// phone's sheet: the one in use checked and focused. Select on another
/// switches to it, signed in still where its session stands. Add server goes to
/// finding or typing one. Remove a server turns to picking one, then to asking,
/// focused on Cancel; each step is a panel of its own over the last, so Back
/// goes a step back, then closes, and focus goes back to the row that opened
/// it. [returnTo] is where cancelling Add server comes back to, when it's more
/// than the page's location.
Future<void> showTvServerPanel(BuildContext context, {String? returnTo}) async {
  final l = AppLocalizations.of(context);
  final session = ProviderScope.containerOf(
    context,
    listen: false,
  ).read(sessionProvider.notifier);
  final then = await showTvPanel<_Then>(
    context,
    title: l.serversTitle,
    builder: (panel) => [_ServerList(panel: panel, returnTo: returnTo)],
  );
  then?.call(session);
}

/// A saved server's row: its name, and where it stands under it, or that
/// it's on its way out, when it stays focusable but does nothing.
TvListItem _serverRow(
  AppLocalizations l,
  SavedServer server, {
  required bool busy,
  required VoidCallback onPressed,
  bool checked = false,
  bool autofocus = false,
}) => TvListItem(
  title: serverTitle(server),
  subtitle: busy ? l.serversRemoving : serverFacts(l, server),
  icon: Lucide.server,
  quiet: true,
  checked: checked,
  autofocus: autofocus,
  minHeight: TvListItems.height + 12,
  onPressed: busy ? () {} : onPressed,
);

class _ServerList extends ConsumerWidget {
  const _ServerList({required this.panel, this.returnTo});

  /// The panel's own context, which closes it.
  final BuildContext panel;
  final String? returnTo;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final servers = ref.watch(savedServersProvider);
    final removing = ref.watch(removingServersProvider);
    final active = servers.any((server) => server.active);
    void close(_Then then) => Navigator.of(panel).pop(then);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final server in servers)
          _serverRow(
            l,
            server,
            busy: removing.contains(server.origin),
            checked: server.active,
            autofocus: server.active,
            onPressed: () =>
                close((session) => session.switchTo(server.origin)),
          ),
        TvListItem(
          title: l.serversAdd,
          icon: Lucide.plus,
          quiet: true,
          autofocus: !active,
          onPressed: () => close((session) {
            if (returnTo case final location?) {
              ref.read(addServerReturnProvider.notifier).remember(location);
            }
            session.addServer();
          }),
        ),
        if (servers.isNotEmpty)
          TvListItem(
            title: l.tvServersRemove,
            icon: Lucide.trash,
            quiet: true,
            destructive: true,
            onPressed: () => _remove(context),
          ),
      ],
    );
  }

  /// Picking the server to remove, over the list.
  Future<void> _remove(BuildContext context) async {
    final l = AppLocalizations.of(context);
    await showTvPanel<void>(
      context,
      title: l.tvServersRemove,
      description: l.tvServersRemoveDescription,
      builder: (pick) => [
        Consumer(
          builder: (context, ref, _) {
            final removing = ref.watch(removingServersProvider);
            return Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (final server in ref.watch(savedServersProvider))
                  _serverRow(
                    l,
                    server,
                    busy: removing.contains(server.origin),
                    onPressed: () => _confirm(pick, server),
                  ),
              ],
            );
          },
        ),
      ],
    );
  }

  /// Asking about [server], over the pick, focused on Cancel. Remove goes
  /// back to the list, where it shows as being removed until it's gone.
  Future<void> _confirm(BuildContext pick, SavedServer server) async {
    final l = AppLocalizations.of(pick);
    final session = ProviderScope.containerOf(
      pick,
      listen: false,
    ).read(sessionProvider.notifier);
    final removed = await showTvPanel<bool>(
      pick,
      title: l.serversRemoveTitle(serverTitle(server)),
      description: l.serversRemoveBodyTv,
      builder: (ask) => [
        TvListItem(
          title: l.commonRemove,
          icon: Lucide.trash,
          quiet: true,
          destructive: true,
          onPressed: () => Navigator.of(ask).pop(true),
        ),
        TvListItem(
          title: l.commonCancel,
          icon: Lucide.x,
          quiet: true,
          autofocus: true,
          onPressed: () => Navigator.of(ask).pop(false),
        ),
      ],
    );
    if (removed != true) return;
    // Its future ends once it's gone; the list shows it going meanwhile.
    session.removeServer(server.origin).ignore();
    if (pick.mounted) Navigator.of(pick).pop();
  }
}
