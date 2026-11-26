import 'dart:async';

import 'package:flutter/services.dart' show TextInputAction;
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/server_discovery.dart';
import '../../core/session.dart';
import '../../core/sign_in_state.dart';
import '../../kit/kit.dart';
import '../../l10n/app_localizations.dart';
import 'auth_layout.dart';
import 'server_switcher.dart';

/// Typing a server's address, or picking one found on the local network.
/// While adding a server with another in use, it offers to go back to that
/// one, as the system's back does.
class ConnectScreen extends ConsumerStatefulWidget {
  const ConnectScreen({super.key});

  @override
  ConsumerState<ConnectScreen> createState() => _ConnectScreenState();
}

class _ConnectScreenState extends ConsumerState<ConnectScreen> {
  final _address = TextEditingController();

  /// The nearby server being tried, for its spinner.
  String? _trying;

  @override
  void dispose() {
    _address.dispose();
    super.dispose();
  }

  void _connect(String address, {String? name, String? nearby}) {
    setState(() => _trying = nearby);
    unawaited(
      ref.read(serverConnectProvider.notifier).connect(address, name: name),
    );
  }

  @override
  Widget build(BuildContext context) {
    final words = AppLocalizations.of(context);
    final colors = MatineeTheme.of(context);
    final auth = ref.watch(authStateProvider);
    final canCancel = auth is NoServer && auth.canCancel;
    final connect = ref.watch(serverConnectProvider);
    final nearby = ref.watch(nearbyServersProvider);
    final error = connect.error;
    return PopScope(
      canPop: !canCancel,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) ref.read(sessionProvider.notifier).cancelAdd();
      },
      child: AuthLayout(
        children: [
          AuthHeading(
            title: words.connectTitle,
            description: words.connectDescription,
          ),
          const SizedBox(height: 24),
          MatineeTextField(
            controller: _address,
            placeholder: words.connectPlaceholder,
            leading: Lucide.server,
            enabled: !connect.busy,
            error: error == null
                ? null
                : describeConnectFailure(
                    words,
                    error,
                    localNetworkHint: connect.localNetworkHint,
                  ),
            keyboardType: TextInputType.url,
            textInputAction: TextInputAction.go,
            onChanged: (_) =>
                ref.read(serverConnectProvider.notifier).clearError(),
            onSubmitted: (text) {
              if (text.trim().isNotEmpty) _connect(text);
            },
          ),
          const SizedBox(height: 16),
          ValueListenableBuilder(
            valueListenable: _address,
            builder: (context, field, _) {
              final ready = field.text.trim().isNotEmpty && !connect.busy;
              return MatineeButton(
                onPressed: ready ? () => _connect(field.text) : null,
                child: BusyLabel(
                  busy: connect.busy && _trying == null,
                  label: words.connectButton,
                  color: colors.accentForeground,
                ),
              );
            },
          ),
          if (nearby.found.isNotEmpty) ...[
            const SizedBox(height: 28),
            _NearbyHeading(searching: nearby.searching),
            const SizedBox(height: 8),
            for (final server in nearby.found)
              NearbyServerRow(
                server: server,
                busy: connect.busy && _trying == server.url,
                onPressed: connect.busy
                    ? null
                    : () => _connect(
                        server.url,
                        name: server.name,
                        nearby: server.url,
                      ),
              ),
          ],
          if (canCancel) ...[
            const SizedBox(height: 32),
            const Center(child: BackToServer()),
          ],
        ],
      ),
    );
  }
}

class _NearbyHeading extends StatelessWidget {
  const _NearbyHeading({required this.searching});

  final bool searching;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    return Row(
      spacing: 8,
      children: [
        Flexible(
          child: Text(
            AppLocalizations.of(context).tvConnectFound,
            style: KitText.sm.style(
              color: colors.mutedForeground,
              weight: FontWeight.w500,
            ),
          ),
        ),
        if (searching) Spinner(size: 14, color: colors.mutedForeground),
      ],
    );
  }
}

/// A server found on the local network: its name over its address, with a
/// spinner while it's tried. Every server calls itself Matinee unless its
/// admin renamed it, so the address is what tells them apart.
class NearbyServerRow extends StatelessWidget {
  const NearbyServerRow({
    super.key,
    required this.server,
    required this.busy,
    required this.onPressed,
  });

  final DiscoveredServer server;
  final bool busy;
  final VoidCallback? onPressed;

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
          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 10),
          child: Row(
            spacing: 14,
            children: [
              KitIcon(Lucide.server, color: colors.mutedForeground),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      server.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: KitText.base.style(color: colors.foreground),
                    ),
                    Text(
                      withoutScheme(server.url),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: KitText.sm.style(color: colors.mutedForeground),
                    ),
                  ],
                ),
              ),
              if (busy) Spinner(size: 20, color: colors.mutedForeground),
            ],
          ),
        ),
      ),
    );
  }
}
