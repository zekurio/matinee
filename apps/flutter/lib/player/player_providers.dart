import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'player.dart';

/// A player for [PlayerEngine], disposed when nothing watches it. Android has
/// one native player at a time, so a screen holds one of these, and
/// switching engines is watching the other one.
final playerProvider = Provider.autoDispose.family<Player, PlayerEngine>((
  ref,
  engine,
) {
  final player = Player(engine: engine);
  ref.onDispose(() => unawaited(player.dispose()));
  return player;
});

/// What [player] is doing now. It starts with the player's current state.
final playbackStateProvider = StreamProvider.autoDispose
    .family<PlaybackState, Player>((ref, player) => player.states);
