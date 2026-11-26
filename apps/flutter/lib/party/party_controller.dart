import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/matinee_api.dart';
import '../core/session.dart';
import '../query/reconnecting.dart';
import '../query/server_data.dart';
import 'party_state.dart';

/// The viewer's watch party, followed from the server while they're in one.
///
/// The state comes from `party.get` once, and then from `party.follow`, which
/// sends the party again on each change and every little while for its clock.
/// The stream stays open while the app is signed in: the server takes a
/// member with none open for a minute as gone.
final partyProvider =
    AsyncNotifierProvider.autoDispose<PartyNotifier, PartySnapshot>(
      PartyNotifier.new,
    );

/// How every member's player keeps up, while something shows it.
final partyHealthProvider = serverStream((api) => api.party.health());

/// What an invite leads to, before joining.
final partyInviteProvider = serverQueryFamily(
  (api, String partyId) => api.party.invite(partyId),
);

class PartyNotifier extends AsyncNotifier<PartySnapshot> {
  StreamSubscription<Party?>? _stream;
  final _offsets = <int, int>{};
  PartySnapshot _latest = const PartySnapshot.empty();
  String _selfId = '';
  Uri? _server;
  DateTime? _ignoreNullUntil;
  DateTime? _ignorePartyUntil;

  MatineeApi get _api => ref.read(apiProvider) ?? (throw const NotConnected());

  int get _offsetMs =>
      _offsets.isEmpty ? 0 : _offsets.values.reduce((a, b) => a > b ? a : b);

  @override
  Future<PartySnapshot> build() async {
    unawaited(_stream?.cancel());
    _stream = null;
    _offsets.clear();
    _ignoreNullUntil = null;
    _ignorePartyUntil = null;
    ref.onDispose(() {
      unawaited(_stream?.cancel());
      _stream = null;
    });

    final api = ref.watch(apiProvider);
    // Where the app is between a server going away and coming back changes
    // this too, so a party is followed again once it answers.
    final auth = ref.watch(authStateProvider);
    final selfId = switch (auth) {
      SignedIn(:final user) => user.id,
      _ => '',
    };
    final server = api?.base;
    if (_selfId != selfId || _server != server) {
      _latest = PartySnapshot(party: null, offsetMs: 0, selfId: selfId);
      _offsets.clear();
    }
    _selfId = selfId;
    _server = server;
    if (api == null || selfId.isEmpty) {
      _latest = const PartySnapshot.empty();
      return _latest;
    }

    // The stream opens even when the first read fails: a read that answers
    // while down would otherwise leave the account out of its party, which
    // the server takes as leaving.
    var heard = false;
    _stream = reconnecting(api.party.follow).listen((party) {
      heard = true;
      _receive(party);
    }, onError: _ignoreStreamError);
    try {
      final initial = await api.party.get();
      if (!ref.mounted) return _latest;
      if (initial != null) {
        _remember(initial);
      } else if (!heard) {
        // No stream has said otherwise, so the account is in no party.
        _remember(null);
      }
    } on Object {
      // The stream's own answer still counts, and it reconnects anyway.
      if (!ref.mounted || _latest.party == null) rethrow;
    }
    return _latest;
  }

  void _receive(Party? party) {
    if (!ref.mounted) return;
    final now = DateTime.now();
    if (party == null) {
      final until = _ignoreNullUntil;
      if (until != null && now.isBefore(until)) return;
      _set(null);
      return;
    }
    final until = _ignorePartyUntil;
    if (until != null && now.isBefore(until)) return;
    _set(party);
  }

  void _set(Party? party) {
    if (!ref.mounted) return;
    _remember(party);
    state = AsyncData(_latest);
  }

  void _remember(Party? party) {
    if (party != null) _sample(party, DateTime.now());
    _latest = PartySnapshot(party: party, offsetMs: _offsetMs, selfId: _selfId);
  }

  /// A sample of how far the server's clock is ahead. The quickest trip is
  /// the truest, so the largest of the recent samples shows.
  void _sample(Party party, DateTime receivedAt) {
    final at = receivedAt.millisecondsSinceEpoch;
    _offsets.putIfAbsent(at, () => serverClock(party) - at);
    while (_offsets.length > 6) {
      _offsets.remove(_offsets.keys.first);
    }
  }

  /// Start a party the viewer owns, leaving any they were in.
  Future<void> create(String? name) async {
    final party = await _api.party.create(name: name);
    _ignoreNullUntil = DateTime.now().add(const Duration(seconds: 2));
    _set(party);
  }

  /// Join the party with this id, leaving any other.
  Future<void> join(String partyId) async {
    final party = await _api.party.join(partyId);
    _ignoreNullUntil = DateTime.now().add(const Duration(seconds: 2));
    _set(party);
  }

  /// Leave the viewer's party, which ends with its last member.
  Future<void> leave() async {
    await _api.party.leave();
    _ignorePartyUntil = DateTime.now().add(const Duration(seconds: 2));
    _set(null);
  }

  Future<void> rename(String name) => _api.party.rename(name: name);

  Future<void> transfer(String userId) => _api.party.transfer(userId: userId);

  Future<void> kick(String userId) => _api.party.kick(userId);

  /// Have the party watch [itemId], from [positionSeconds] or its start.
  Future<void> play(String itemId, {double? positionSeconds}) =>
      _api.party.play(itemId: itemId, positionSeconds: positionSeconds);

  /// Play, pause, or move the party's file for every member.
  Future<void> control({
    required String itemId,
    required bool playing,
    required double positionSeconds,
  }) => _api.party.control(
    itemId: itemId,
    playing: playing,
    positionSeconds: positionSeconds,
  );

  /// Go on to the first file in the queue.
  Future<void> next(String itemId) => _api.party.next(itemId: itemId);

  /// Tell the party how this player plays its file.
  Future<void> status(PartyStatusReport report) => _api.party.status(report);

  Future<void> queueAdd(String itemId) => _api.party.queue.add(itemId: itemId);

  Future<void> queueAccept(String entryId) => _api.party.queue.accept(entryId);

  Future<void> queueRemove(String entryId) => _api.party.queue.remove(entryId);

  Future<void> queueMove(String entryId, int index) =>
      _api.party.queue.move(entryId, index: index);
}

/// A stream that dropped opens again by itself, so there's nothing to do
/// but keep the last party on screen.
void _ignoreStreamError(Object error, StackTrace stack) {}
