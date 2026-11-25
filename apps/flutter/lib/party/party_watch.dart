import '../api/matinee_api.dart';
import 'party_state.dart';

/// Tells the party the viewer played, paused, or moved its file.
typedef PartyControl = Future<void> Function({
  required bool playing,
  required double positionSeconds,
});

/// The party side of one player: where the party is, and what the player
/// tells it as it follows.
///
/// The screen makes one for its session, reading [snapshot] for the party
/// the app follows now. The player itself never asks the server.
final class PartyWatch {
  const PartyWatch({
    required this.itemId,
    required this.snapshot,
    required this.control,
    required this.report,
    required this.next,
    required this.play,
  });

  /// The file this player has.
  final String itemId;

  /// The viewer's party and clock offset, as they are now.
  final PartySnapshot Function() snapshot;

  /// Tell the party the viewer played, paused, or moved its file.
  final PartyControl control;

  /// Tell the party how this player plays its file.
  final Future<void> Function(PartyStatusReport report) report;

  /// The file played to its end here, so the party may go on to its queue.
  final Future<void> Function() next;

  /// Tell the party the owner opened this file, at [positionSeconds].
  final Future<void> Function(double positionSeconds) play;

  Party? get party => snapshot().party;

  int get offsetMs => snapshot().offsetMs;

  String get selfId => snapshot().selfId;

  /// The party watches this very file, so this player follows it.
  bool get inStep {
    final current = party;
    return current != null &&
        current.item?.id == itemId &&
        current.playback != null;
  }
}
