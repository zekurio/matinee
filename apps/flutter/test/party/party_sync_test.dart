import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/party/party_state.dart';
import 'package:matinee/party/party_sync.dart';
import 'package:matinee/party/party_watch.dart';
import 'package:matinee/player/player_state.dart';

import '../player/playback_fakes.dart';

/// A party whose playback is at [position] as of [now].
Party party({
  required DateTime now,
  bool playing = true,
  double position = 10,
  List<String> waitingFor = const [],
  bool owner = false,
  String id = itemId,
}) => Party(
  id: 'party',
  name: null,
  owner: owner,
  members: [
    PartyMember(user: _user('self'), owner: owner),
    if (!owner) PartyMember(user: _user('other'), owner: true),
  ],
  item: item(id),
  restricted: false,
  playback: PartyPlayback(
    playing: playing,
    positionSeconds: position,
    at: now.toIso8601String(),
    by: null,
  ),
  queue: const [],
  proposals: const [],
  waitingFor: waitingFor,
  now: now.toIso8601String(),
);

ProfileUser _user(String name) => ProfileUser(
  id: name,
  username: name,
  displayName: null,
  role: 'user',
  avatarUrl: null,
  createdAt: '2026-01-01T00:00:00Z',
);

final class _Watch {
  _Watch(this.party);

  Party? party;
  final String selfId = 'self';
  int controls = 0;
  bool? lastPlaying;
  double? lastPosition;
  final reports = <PartyStatusReport>[];
  int nexts = 0;
  final plays = <double>[];

  late final watch = PartyWatch(
    itemId: itemId,
    snapshot: () => PartySnapshot(party: party, offsetMs: 0, selfId: selfId),
    control: ({required bool playing, required double positionSeconds}) async {
      controls++;
      lastPlaying = playing;
      lastPosition = positionSeconds;
    },
    report: (report) async => reports.add(report),
    next: () async => nexts++,
    play: (position) async => plays.add(position),
  );
}

final class _Host implements PartySyncHost {
  _Host({
    this.position = 10,
    this.playing = true,
    this.wantsPlay = true,
    this.phase = PlaybackPhase.ready,
    this.buffered = 200,
    this.busy = false,
  });

  @override
  double position;
  @override
  double duration = 120;
  @override
  double? buffered;
  @override
  String? method = PlaybackMethod.direct;
  @override
  String? quality = PlaybackQuality.original;
  @override
  bool hls = false;
  @override
  bool busy;
  @override
  bool waiting = false;
  @override
  bool canFollow = true;
  bool playing;
  bool wantsPlay;
  PlaybackPhase phase;

  final seeks = <double>[];
  final rates = <double>[];
  int plays = 0;
  int pauses = 0;

  @override
  PlaybackState get playback => PlaybackState(
    status: (
      phase: phase,
      playing: playing,
      wantsPlay: wantsPlay,
      message: null,
    ),
    timeline: (
      position: Duration(milliseconds: (position * 1000).round()),
      duration: const Duration(seconds: 120),
      buffered: buffered == null
          ? null
          : Duration(milliseconds: (buffered! * 1000).round()),
    ),
  );

  @override
  Future<void> playFromParty() async {
    plays++;
    playing = true;
    wantsPlay = true;
  }

  @override
  Future<void> pauseFromParty() async {
    pauses++;
    playing = false;
    wantsPlay = false;
  }

  @override
  Future<void> seekFromParty(double seconds) async => seeks.add(seconds);

  @override
  Future<void> setRateFromParty(double rate) async => rates.add(rate);
}

void main() {
  final now = DateTime.utc(2026, 1, 1, 12);

  test('where a party is now follows its clock while it plays', () {
    final state = PartyPlayback(
      playing: true,
      positionSeconds: 10,
      at: now.toIso8601String(),
      by: null,
    );
    expect(
      partyPosition(state, 0, now: now.add(const Duration(seconds: 5))),
      15,
    );
    // The server's clock is a second ahead: five more seconds have passed
    // there than here.
    expect(
      partyPosition(state, 1000, now: now.add(const Duration(seconds: 5))),
      16,
    );
    final paused = PartyPlayback(
      playing: false,
      positionSeconds: 10,
      at: now.toIso8601String(),
      by: null,
    );
    expect(
      partyPosition(paused, 0, now: now.add(const Duration(seconds: 5))),
      10,
    );
  });

  test('reads a party id from a code or a link', () {
    const id = '110c6827-a589-4282-b61b-dfa7396b35db';
    expect(partyIdFromInput(id), id);
    expect(partyIdFromInput('  $id '), id);
    expect(partyIdFromInput('https://media.test/party/$id'), id);
    expect(partyIdFromInput('matinee://party/$id'), id);
    expect(partyIdFromInput('not a party'), isNull);
    expect(partyIdFromInput(''), isNull);
  });

  test('a player ahead of the party jumps to where it is', () {
    final at = now;
    final watch = _Watch(party(now: at));
    final host = _Host(position: 13);
    final follower = PartyFollower(
      watch: watch.watch,
      host: host,
      now: () => at,
    );
    follower.tick();
    expect(host.seeks.single, closeTo(10, .001));
    expect(host.rates.last, 1);
  });

  test('a player less than a jump ahead slows down', () {
    final at = now;
    final watch = _Watch(party(now: at));
    final host = _Host(position: 11);
    final follower = PartyFollower(
      watch: watch.watch,
      host: host,
      now: () => at,
    );
    follower.tick();
    expect(host.seeks, isEmpty);
    expect(host.rates.last, closeTo(1 - partyNudge, .001));
  });

  test('a player behind hurries only with the buffer to spare', () {
    final at = now;
    final watch = _Watch(party(now: at));
    final host = _Host(position: 9, buffered: 30);
    final follower = PartyFollower(
      watch: watch.watch,
      host: host,
      now: () => at,
    );
    follower.tick();
    expect(host.seeks, isEmpty);
    expect(host.rates.last, closeTo(1 + partyNudge, .001));

    final tight = _Host(position: 9, buffered: 10.5);
    PartyFollower(watch: watch.watch, host: tight, now: () => at).tick();
    expect(tight.seeks, isEmpty);
    expect(tight.rates.last, 1);
  });

  test('a player with the party stays at normal speed', () {
    final at = now;
    final watch = _Watch(party(now: at));
    final host = _Host(position: 10.05);
    final follower = PartyFollower(
      watch: watch.watch,
      host: host,
      now: () => at,
    );
    follower.tick();
    expect(host.seeks, isEmpty);
    expect(host.rates.last, 1);
  });

  test('a paused party pauses the player, and moves it only when far', () {
    final at = now;
    final watch = _Watch(party(now: at, playing: false));
    final host = _Host(position: 10.5);
    PartyFollower(watch: watch.watch, host: host, now: () => at).tick();
    expect(host.pauses, 1);
    expect(host.seeks, isEmpty);
    expect(host.rates.last, 1);

    final far = _Host(position: 20);
    PartyFollower(watch: watch.watch, host: far, now: () => at).tick();
    expect(far.seeks.single, closeTo(10, .001));
  });

  test('where the party waits for a player, it moves it very close', () {
    final at = now;
    final watch = _Watch(
      party(now: at, playing: false, waitingFor: const ['self']),
    );
    final host = _Host(position: 10.4);
    PartyFollower(watch: watch.watch, host: host, now: () => at).tick();
    expect(host.seeks.single, closeTo(10, .001));
  });

  test('a playing party presses play on a player that is paused', () {
    final at = now;
    final watch = _Watch(party(now: at));
    final host = _Host(position: 10, playing: false, wantsPlay: false);
    PartyFollower(watch: watch.watch, host: host, now: () => at).tick();
    expect(host.plays, 1);
  });

  test('a file that ended moves the party on once', () {
    final at = now;
    final watch = _Watch(party(now: at));
    final host = _Host(position: 120, phase: PlaybackPhase.ended);
    final follower = PartyFollower(
      watch: watch.watch,
      host: host,
      now: () => at,
    );
    follower.onPlayback();
    follower.onPlayback();
    expect(watch.nexts, 1);
  });

  test('the viewer tells the party what they did', () {
    final at = now;
    final watch = _Watch(party(now: at));
    final host = _Host();
    final follower = PartyFollower(
      watch: watch.watch,
      host: host,
      now: () => at,
    );
    follower.viewerPlayed(playing: false, positionSeconds: 42);
    expect(watch.controls, 1);
    expect(watch.lastPlaying, isFalse);
    expect(watch.lastPosition, 42);
    follower.viewerSought(43);
    expect(watch.controls, 2);
  });

  test('a player that stalls while the party plays says it buffers', () {
    var at = now;
    final watch = _Watch(party(now: at));
    final host = _Host(position: 10, playing: false, busy: true)
      ..wantsPlay = true;
    final follower = PartyFollower(
      watch: watch.watch,
      host: host,
      now: () => at,
    );
    follower.tick();
    at = at.add(const Duration(seconds: 3));
    follower.tick();
    expect(
      watch.reports.map((report) => report.state),
      contains(PartyPlayerState.buffering),
    );
  });

  test('where the party waits for a player, it says when it has loaded', () {
    final at = now;
    final watch = _Watch(
      party(now: at, playing: false, waitingFor: const ['self']),
    );
    final host = _Host(position: 10, playing: false)..wantsPlay = false;
    final follower = PartyFollower(
      watch: watch.watch,
      host: host,
      now: () => at,
    );
    follower.tick();
    expect(watch.reports.last.state, PartyPlayerState.paused);
  });

  test('the owner opening another file tells the party to watch it', () {
    final at = now;
    final same = _Watch(party(now: at, owner: true));
    PartyFollower(
      watch: same.watch,
      host: _Host(),
      now: () => at,
    ).sourceOpened(12);
    expect(same.plays, isEmpty, reason: 'the party already watches it');

    final other = _Watch(party(now: at, owner: true, id: 'other'));
    PartyFollower(
      watch: other.watch,
      host: _Host(),
      now: () => at,
    ).sourceOpened(12);
    expect(other.plays, [12]);
  });
}
