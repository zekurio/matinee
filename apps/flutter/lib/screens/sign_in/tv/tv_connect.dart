import 'dart:async';

import 'package:flutter/services.dart' show TextInputAction;
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/session.dart';
import '../../../core/sign_in_state.dart';
import '../../../kit/kit.dart';
import '../../../kit/tv/tv_text_field.dart';
import '../../../l10n/app_localizations.dart';
import '../server_switcher.dart';
import 'tv_frame.dart';

/// Picking a server on a TV, as Wholphin does it: the servers found on the
/// local network first, searched for while the screen shows, each a large
/// row with its name and address. The server last used comes next, then
/// typing an address with the TV's keyboard. Every server calls itself
/// Matinee unless its admin renamed it, so the address is what tells them
/// apart.
class TvConnectScreen extends ConsumerStatefulWidget {
  const TvConnectScreen({super.key});

  @override
  ConsumerState<TvConnectScreen> createState() => _TvConnectScreenState();
}

class _TvConnectScreenState extends ConsumerState<TvConnectScreen> {
  bool _typing = false;

  void _setTyping({required bool typing}) {
    ref.read(serverConnectProvider.notifier).clearError();
    setState(() => _typing = typing);
  }

  @override
  Widget build(BuildContext context) {
    final auth = ref.watch(authStateProvider);
    final canCancel = auth is NoServer && auth.canCancel;
    // Adding a server: Back from the list returns to the one in use, as it
    // was; Back from typing returns to the list.
    return PopScope(
      canPop: !_typing && !canCancel,
      onPopInvokedWithResult: (didPop, _) {
        if (didPop) return;
        if (_typing) {
          _setTyping(typing: false);
        } else {
          ref.read(sessionProvider.notifier).cancelAdd();
        }
      },
      child: _typing
          ? _AddressEntry(onBack: () => _setTyping(typing: false))
          : _ServerList(
              canCancel: canCancel,
              onType: () => _setTyping(typing: true),
            ),
    );
  }
}

/// Two addresses of one server, as the app shows them and as a server sends
/// them.
bool _sameServer(String a, String b) =>
    a.replaceAll(RegExp(r'/+$'), '').toLowerCase() ==
    b.replaceAll(RegExp(r'/+$'), '').toLowerCase();

class _ServerList extends ConsumerStatefulWidget {
  const _ServerList({required this.canCancel, required this.onType});

  final bool canCancel;
  final VoidCallback onType;

  @override
  ConsumerState<_ServerList> createState() => _ServerListState();
}

class _ServerListState extends ConsumerState<_ServerList> {
  /// The one being tried, for its spinner and the message under it.
  String? _trying;

  void _connect(String url, String? name) {
    // A second try waits for the first.
    if (ref.read(serverConnectProvider).busy) return;
    setState(() => _trying = url);
    unawaited(
      ref.read(serverConnectProvider.notifier).connect(url, name: name),
    );
  }

  @override
  Widget build(BuildContext context) {
    final words = AppLocalizations.of(context);
    final session = ref.read(sessionProvider.notifier);
    final nearby = ref.watch(nearbyServersProvider);
    final connect = ref.watch(serverConnectProvider);
    final servers = ref.watch(savedServersProvider);
    final found = nearby.found;
    final last = session.lastServer;
    final showLast =
        last != null && !found.any((server) => _sameServer(server.url, last));
    final current = activeServer(servers);
    const spinner = Spinner(size: 22);

    Widget? note(String url) {
      final error = connect.error;
      if (connect.busy || error == null || _trying != url) return null;
      return TvNote(
        describeConnectFailure(
          words,
          error,
          localNetworkHint: connect.localNetworkHint,
        ),
        danger: true,
      );
    }

    return TvAuthFrame(
      title: words.tvConnectTitle,
      description: words.tvConnectDescription,
      children: [
        Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          spacing: 10,
          children: [
            TvListHeading(words.tvConnectFound),
            for (final server in found) ...[
              TvListItem(
                key: ValueKey(server.url),
                title: server.name,
                subtitle: withoutScheme(server.url),
                icon: Lucide.server,
                autofocus: server == found.first && !showLast,
                trailing: connect.busy && _trying == server.url
                    ? spinner
                    : null,
                onPressed: () => _connect(server.url, server.name),
              ),
              ?note(server.url),
            ],
            if (found.isEmpty && !nearby.searching) TvNote(words.tvConnectNone),
            // Always there, so focus stays on it while it searches
            // again.
            TvListItem(
              title: nearby.searching
                  ? words.tvConnectSearching
                  : words.tvConnectSearchAgain,
              icon: Lucide.refreshCw,
              trailing: nearby.searching ? spinner : null,
              onPressed: nearby.searching
                  ? null
                  : () => unawaited(
                      ref.read(nearbyServersProvider.notifier).search(),
                    ),
            ),
            if (showLast) ...[
              TvListHeading(words.tvConnectLast),
              TvListItem(
                title: withoutScheme(last),
                icon: Lucide.rotateCcw,
                autofocus: true,
                trailing: connect.busy && _trying == last ? spinner : null,
                onPressed: () => _connect(last, null),
              ),
              ?note(last),
            ],
            TvListHeading(words.tvConnectOther),
            TvListItem(
              title: words.tvConnectEnter,
              icon: Lucide.link,
              autofocus: found.isEmpty && !showLast,
              onPressed: widget.onType,
            ),
            if (widget.canCancel && current != null)
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: TvListItem(
                  title: words.serversBackTo(serverTitle(current)),
                  icon: Lucide.arrowLeft,
                  quiet: true,
                  onPressed: session.cancelAdd,
                ),
              ),
          ],
        ),
      ],
    );
  }
}

/// Typing the address, as the phone's connect screen takes it, with its
/// checks and messages.
class _AddressEntry extends ConsumerStatefulWidget {
  const _AddressEntry({required this.onBack});

  final VoidCallback onBack;

  @override
  ConsumerState<_AddressEntry> createState() => _AddressEntryState();
}

class _AddressEntryState extends ConsumerState<_AddressEntry> {
  final _address = TextEditingController();

  @override
  void dispose() {
    _address.dispose();
    super.dispose();
  }

  void _connect() => unawaited(
    ref.read(serverConnectProvider.notifier).connect(_address.text),
  );

  @override
  Widget build(BuildContext context) {
    final words = AppLocalizations.of(context);
    final connect = ref.watch(serverConnectProvider);
    final error = connect.error;
    return TvAuthFrame(
      title: words.tvConnectEnter,
      description: words.connectDescription,
      children: [
        TvTextField(
          controller: _address,
          autofocus: true,
          placeholder: words.connectPlaceholder,
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
          onSubmitted: (_) => _connect(),
        ),
        const SizedBox(height: 12),
        TvListItem(
          title: words.connectButton,
          icon: Lucide.logIn,
          trailing: connect.busy ? const Spinner(size: 22) : null,
          onPressed: connect.busy ? null : _connect,
        ),
        const SizedBox(height: 10),
        TvListItem(
          title: words.tvConnectBackToList,
          icon: Lucide.arrowLeft,
          quiet: true,
          onPressed: widget.onBack,
        ),
      ],
    );
  }
}
