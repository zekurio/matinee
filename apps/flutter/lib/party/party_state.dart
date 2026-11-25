import 'package:flutter/foundation.dart' show immutable;

import '../api/matinee_api.dart';

/// The viewer's watch party and how far the server's clock is ahead of this
/// device's, as the app reads them.
///
/// [offsetMs] is a sample of the server's clock, in the web's way: each
/// state the server sends carries its clock when it left, and arrived some
/// way later, so each sample is short by its trip. The quickest trip is the
/// truest, so the largest of the recent samples is used.
@immutable
final class PartySnapshot {
  const PartySnapshot({
    required this.party,
    required this.offsetMs,
    required this.selfId,
  });

  /// Nobody is in a party, and no account is known.
  const PartySnapshot.empty() : party = null, offsetMs = 0, selfId = '';

  /// The party the viewer is in, or null while they're in none.
  final Party? party;

  /// Milliseconds the server's clock is ahead of this device's.
  final int offsetMs;

  /// The viewer's own account id.
  final String selfId;

  bool get inParty => party != null;
}

/// Where a party is in its file now, in seconds.
///
/// While it plays, that is [PartyPlayback.positionSeconds] plus the time
/// since [PartyPlayback.at] on the server's clock. Paused, it stays there.
/// [now] is read now unless a test says otherwise.
double partyPosition(PartyPlayback playback, int offsetMs, {DateTime? now}) {
  if (!playback.playing) return playback.positionSeconds;
  final at = DateTime.tryParse(playback.at);
  if (at == null) return playback.positionSeconds;
  final elapsed =
      ((now ?? DateTime.now()).millisecondsSinceEpoch +
          offsetMs -
          at.millisecondsSinceEpoch) /
      1000;
  return playback.positionSeconds + (elapsed > 0 ? elapsed : 0);
}

/// The server's clock at [party]'s answer, in milliseconds, which samples
/// the offset between the two clocks.
int serverClock(Party party) =>
    DateTime.tryParse(party.now)?.millisecondsSinceEpoch ?? 0;

/// The link another account joins a party with, as the web's invite page
/// takes it.
String partyInviteUrl(Uri server, String partyId) =>
    '${server.origin}/party/$partyId';

final _uuid = RegExp(
  r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-'
  r'[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
);

/// The party id in what a person pasted: a code itself, or an invite link
/// whose path has one, as `/party/<id>` or `matinee://party/<id>`. Null
/// when there's no id in it.
String? partyIdFromInput(String input) {
  final text = input.trim();
  if (text.isEmpty) return null;
  if (_uuid.hasMatch(text)) return text.toLowerCase();
  final uri = Uri.tryParse(text);
  if (uri == null) return null;
  for (final segment in uri.pathSegments.reversed) {
    if (_uuid.hasMatch(segment)) return segment.toLowerCase();
  }
  return null;
}
