import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/device.dart';
import '../../core/session.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';

/* The saved servers, for the sign-in screens and Settings: switching between
   them, adding one, and removing one. */

/// What a saved server is called in a list: its name, when it told one, else
/// its address without the scheme.
String serverTitle(SavedServer server) =>
    server.name ?? withoutScheme(server.address);

/// The line under it: the address, when the name took its place, and who's
/// signed in there.
String serverFacts(AppLocalizations l, SavedServer server) => [
  if (server.name != null) withoutScheme(server.address),
  switch (server.user) {
    final user? => l.serversSignedInAs(user.displayName ?? user.username),
    null => l.serversSignedOut,
  },
].join(' · ');

/// An address as people type and read it, `media.example.com`.
String withoutScheme(String address) =>
    address.contains('://') ? address.split('://').last : address;

/// The saved server in use, if any.
SavedServer? activeServer(List<SavedServer> servers) {
  for (final server in servers) {
    if (server.active) return server;
  }
  return null;
}

/// The quiet button under the sign-in and unreachable screens that opens the
/// server list.
class ChangeServerButton extends StatelessWidget {
  const ChangeServerButton({super.key});

  @override
  Widget build(BuildContext context) => MatineeButton(
    look: ButtonLook.ghost,
    onPressed: () => showServerSwitcher(context),
    child: Text(
      AppLocalizations.of(context).connectChangeServer,
      style: KitText.sm.style(
        color: MatineeTheme.of(context).mutedForeground,
        weight: FontWeight.w500,
      ),
    ),
  );
}

/// Under the connect and sign-in screens while adding a server: back to the
/// one in use, as it was.
class BackToServer extends ConsumerWidget {
  const BackToServer({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final current = activeServer(ref.watch(savedServersProvider));
    if (current == null) return const SizedBox.shrink();
    final colors = MatineeTheme.of(context);
    return MatineeButton(
      look: ButtonLook.ghost,
      leading: Lucide.arrowLeft,
      onPressed: ref.read(sessionProvider.notifier).cancelAdd,
      child: Text(
        AppLocalizations.of(context).serversBackTo(serverTitle(current)),
        style: KitText.sm.style(
          color: colors.mutedForeground,
          weight: FontWeight.w500,
        ),
      ),
    );
  }
}

/// The saved servers in a sheet, the one in use checked. A tap on another
/// switches to it, signed in still where its session stands; Add server
/// connects to a new one, which can be left to come back here; the bin
/// removes one, after asking.
Future<void> showServerSwitcher(BuildContext context) {
  final words = AppLocalizations.of(context);
  return Sheet.show<void>(
    context,
    dismissLabel: words.commonCancel,
    builder: (context) => const _ServerSwitcher(),
  );
}

class _ServerSwitcher extends ConsumerWidget {
  const _ServerSwitcher();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final words = AppLocalizations.of(context);
    final session = ref.read(sessionProvider.notifier);
    final servers = ref.watch(savedServersProvider);
    final removing = ref.watch(removingServersProvider);
    final navigator = Navigator.of(context);
    final route = ModalRoute.of(context);
    // Moving to another server, or to none, changes the screen under the
    // sheet, so it goes with it.
    ref.listen(authStateProvider, (before, now) {
      if (before.runtimeType != now.runtimeType &&
          route != null &&
          route.isActive) {
        navigator.removeRoute(route);
      }
    });
    void closeThen(VoidCallback action) {
      navigator.pop();
      action();
    }

    return Sheet(
      title: words.serversTitle,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (final server in servers)
            _ServerRow(
              server,
              autofocus: server.active,
              busy: removing.contains(server.origin),
              onPressed: () => closeThen(() => session.switchTo(server.origin)),
              onRemove: () => _confirmRemove(context, ref, server),
            ),
          _AddRow(onPressed: () => closeThen(session.addServer)),
        ],
      ),
    );
  }

  Future<void> _confirmRemove(
    BuildContext context,
    WidgetRef ref,
    SavedServer server,
  ) async {
    final words = AppLocalizations.of(context);
    final tv = ref.read(deviceProvider).isTv;
    final session = ref.read(sessionProvider.notifier);
    final confirmed = await ConfirmDialog.show(
      context,
      title: words.serversRemoveTitle(serverTitle(server)),
      description: tv ? words.serversRemoveBodyTv : words.serversRemoveBody,
      confirmLabel: words.commonRemove,
      cancelLabel: words.commonCancel,
      destructive: true,
    );
    if (confirmed) unawaited(session.removeServer(server.origin));
  }
}

class _ServerRow extends StatelessWidget {
  const _ServerRow(
    this.server, {
    required this.busy,
    required this.onPressed,
    required this.onRemove,
    required this.autofocus,
  });

  final SavedServer server;
  final bool busy;
  final bool autofocus;
  final VoidCallback onPressed;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final words = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final title = serverTitle(server);
    return Row(
      spacing: 4,
      children: [
        Expanded(
          child: PressIndication(
            // One on its way out stays where it is and does nothing.
            onPressed: busy ? null : onPressed,
            autofocus: autofocus,
            shape: KitRadius.control,
            builder: (context, state) => PressFill(
              decoration: BoxDecoration(
                borderRadius: KitRadius.control,
                color: colors.foreground.withValues(
                  alpha: state == PressState.idle ? 0 : .08,
                ),
              ),
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 8,
                  vertical: 10,
                ),
                child: Row(
                  spacing: 14,
                  children: [
                    KitIcon(
                      Lucide.server,
                      color: server.active
                          ? colors.accent
                          : colors.mutedForeground,
                    ),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: KitText.base.style(color: colors.foreground),
                          ),
                          Text(
                            busy
                                ? words.serversRemoving
                                : serverFacts(words, server),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: KitText.sm.style(
                              color: colors.mutedForeground,
                            ),
                          ),
                        ],
                      ),
                    ),
                    if (server.active)
                      Semantics(
                        label: words.serversInUse,
                        child: KitIcon(
                          Lucide.check,
                          size: 20,
                          color: colors.accent,
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ),
        ),
        SizedBox.square(
          dimension: 40,
          child: busy
              ? Center(child: Spinner(size: 20, color: colors.mutedForeground))
              : MatineeButton(
                  look: ButtonLook.ghost,
                  size: ButtonSize.icon,
                  leading: Lucide.trash,
                  label: words.serversRemove(title),
                  onPressed: onRemove,
                ),
        ),
      ],
    );
  }
}

class _AddRow extends StatelessWidget {
  const _AddRow({required this.onPressed});

  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    return PressIndication(
      onPressed: onPressed,
      shape: KitRadius.control,
      builder: (context, state) => PressFill(
        decoration: BoxDecoration(
          borderRadius: KitRadius.control,
          color: colors.foreground.withValues(
            alpha: state == PressState.idle ? 0 : .08,
          ),
        ),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 14),
          child: Row(
            spacing: 14,
            children: [
              KitIcon(Lucide.plus, color: colors.mutedForeground),
              Flexible(
                child: Text(
                  AppLocalizations.of(context).serversAdd,
                  style: KitText.base.style(color: colors.foreground),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
