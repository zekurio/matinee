import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../api/matinee_api.dart';
import '../../../core/failure_text.dart';
import '../../../core/permissions.dart';
import '../../../core/session.dart';
import '../../../core/toasts.dart';
import '../../../kit/kit.dart';
import '../../../l10n/app_localizations.dart';
import '../../../l10n/server_text.dart';
import '../../../query/failure_view.dart';
import '../../../router.dart';
import '../settings_rows.dart';
import 'admin_data.dart';
import 'admin_parts.dart';

/// The services requests go through, as the web's Requests settings: each
/// connection tested, edited, or removed by an account whose permissions
/// allow it, and Add connection opens the editor. Routing rules are set on
/// the web, since their ordered conditions want a wide screen.
class ConnectionsPage extends ConsumerWidget {
  const ConnectionsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l = AppLocalizations.of(context);
    final sources = ref.watch(fulfilmentSourcesProvider);
    final connections = ref.watch(adminConnectionsProvider);
    final sourceList = sources.value;
    final list = connections.value;
    final may = (
      // The editor asks the source for its choices with `options`, which
      // needs update too, so adding one takes both.
      add:
          ref.watch(canProvider(Permission.fulfilmentCreate)) &&
          ref.watch(canProvider(Permission.fulfilmentUpdate)),
      test: ref.watch(canProvider(Permission.fulfilmentUpdate)),
      edit: ref.watch(canProvider(Permission.fulfilmentUpdate)),
      remove: ref.watch(canProvider(Permission.fulfilmentDelete)),
    );
    void retry() {
      ref
        ..invalidate(fulfilmentSourcesProvider)
        ..invalidate(adminConnectionsProvider);
    }

    final Widget body;
    if (sourceList != null && list != null) {
      body = AdminSections(
        sections: [
          Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            spacing: 16,
            children: [
              if (list.isEmpty)
                EmptyState(
                  icon: Lucide.link,
                  title: l.webConnectionsEmptyTitle,
                  message: l.webConnectionsEmptyDescription,
                  action: may.add
                      ? MatineeButton(
                          leading: Lucide.plus,
                          onPressed: () => unawaited(_edit(context, ref)),
                          child: Text(l.webConnectionsAdd),
                        )
                      : null,
                )
              else
                Panel(
                  rows: [
                    for (final connection in list)
                      _ConnectionRow(
                        connection: connection,
                        source: _sourceOf(sourceList, connection.source),
                        onPressed: _canAct(connection, may)
                            ? () =>
                                  unawaited(_act(context, ref, connection, may))
                            : null,
                      ),
                  ],
                ),
            ],
          ),
        ],
      );
    } else if ((sources.error ?? connections.error) case final error?) {
      body = Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: FailureState(
            title: l.adminLoadFailed,
            error: error,
            onRetry: retry,
          ),
        ),
      );
    } else {
      body = LoadingState(label: l.adminLoading);
    }
    return AdminPage(
      title: l.webConnectionsTitle,
      // An empty list offers it in its own message.
      actions: [
        if (may.add && list != null && list.isNotEmpty)
          PageBarButton(
            icon: Lucide.plus,
            label: l.webConnectionsAdd,
            onPressed: () => unawaited(_edit(context, ref)),
          ),
      ],
      child: body,
    );
  }
}

FulfilmentSourceDescription? _sourceOf(
  List<FulfilmentSourceDescription> sources,
  String id,
) {
  for (final source in sources) {
    if (source.id == id) return source;
  }
  return null;
}

bool _canAct(
  FulfilmentConnection connection,
  ({bool add, bool test, bool edit, bool remove}) may,
) => may.test || (connection.editable && (may.edit || may.remove));

Future<void> _edit(BuildContext context, WidgetRef ref, [String? id]) async {
  await context.push<void>(Routes.connectionEditor(id));
  if (context.mounted) ref.invalidate(adminConnectionsProvider);
}

Future<void> _act(
  BuildContext context,
  WidgetRef ref,
  FulfilmentConnection connection,
  ({bool add, bool test, bool edit, bool remove}) may,
) async {
  final l = AppLocalizations.of(context);
  await pickFrom(
    context,
    title: connection.name,
    items: [
      if (may.test)
        (
          Lucide.refreshCw,
          l.webConnectionsTest,
          () => unawaited(_test(context, ref, connection)),
          false,
        ),
      if (may.edit && connection.editable)
        (
          Lucide.settings,
          l.webConnectionsEdit,
          () => unawaited(_edit(context, ref, connection.id)),
          false,
        ),
      if (may.remove && connection.editable)
        (
          Lucide.trash,
          l.webConnectionsDelete,
          () => unawaited(_remove(context, ref, connection)),
          true,
        ),
    ],
  );
}

Future<void> _test(
  BuildContext context,
  WidgetRef ref,
  FulfilmentConnection connection,
) async {
  final l = AppLocalizations.of(context);
  final api = ref.read(apiProvider);
  if (api == null) return;
  final toasts = ref.read(toastProvider);
  try {
    await api.admin.fulfilment.test(id: connection.id);
    unawaited(toasts.show(l.webConnectionsConnected, kind: ToastKind.success));
  } on Object catch (error) {
    unawaited(
      toasts.show(
        l.webConnectionsTestFailedDetail(describeFailure(l, error)),
        kind: ToastKind.error,
      ),
    );
  }
}

Future<void> _remove(
  BuildContext context,
  WidgetRef ref,
  FulfilmentConnection connection,
) async {
  final l = AppLocalizations.of(context);
  final api = ref.read(apiProvider);
  final yes = await ConfirmDialog.show(
    context,
    title: l.webConnectionsDeleteTitle(connection.name),
    description: connection.defaultFor.isEmpty
        ? l.webConnectionsDeleteDescriptionUnused
        : l.webConnectionsDeleteDescriptionDefault,
    confirmLabel: l.webConnectionsDeleteConfirm,
    cancelLabel: l.commonCancel,
    destructive: true,
  );
  if (!yes || api == null || !context.mounted) return;
  final toasts = ref.read(toastProvider);
  try {
    await api.admin.fulfilment.remove(connection.id);
    if (!context.mounted) return;
    ref.invalidate(adminConnectionsProvider);
    unawaited(
      toasts.show(
        l.webConnectionsDeleted(connection.name),
        kind: ToastKind.success,
      ),
    );
  } on Object catch (error) {
    unawaited(toasts.show(describeFailure(l, error), kind: ToastKind.error));
  }
}

/// A connection: its name, the source it goes through, and the kinds it's
/// the default for. It opens its actions for an account whose permissions
/// allow any.
class _ConnectionRow extends StatelessWidget {
  const _ConnectionRow({
    required this.connection,
    required this.source,
    required this.onPressed,
  });

  final FulfilmentConnection connection;
  final FulfilmentSourceDescription? source;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    final l = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final sourceName =
        source?.name.serverWords(l) ?? l.webConnectionsCardUnknownSource;
    final defaults = [
      for (final kind in connection.defaultFor) _defaultLabel(l, kind),
    ];
    return PressIndication(
      onPressed: onPressed,
      label: l.webConnectionsActions(connection.name),
      builder: (context, state) => ColoredBox(
        color: colors.foreground.withValues(
          alpha: state == PressState.idle ? 0 : .06,
        ),
        child: ExcludeSemantics(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
            child: Row(
              spacing: 14,
              children: [
                KitIcon(Lucide.link, size: 20, color: colors.mutedForeground),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        connection.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: KitText.base.style(color: colors.foreground),
                      ),
                      Text(
                        [sourceName, ...defaults].join(' · '),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: KitText.sm.style(color: colors.mutedForeground),
                      ),
                      if (!connection.editable)
                        Text(
                          l.webConnectionsCardReadOnly,
                          style: KitText.sm.style(
                            color: colors.mutedForeground,
                          ),
                        ),
                    ],
                  ),
                ),
                if (onPressed != null)
                  KitIcon(
                    Lucide.ellipsis,
                    size: 18,
                    color: colors.mutedForeground,
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

String _defaultLabel(AppLocalizations l, String kind) => switch (kind) {
  TitleKind.movie => l.webConnectionsCardDefaultMovie,
  TitleKind.show => l.webConnectionsCardDefaultShow,
  _ => kind,
};
