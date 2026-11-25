import 'dart:async';
import 'dart:math' as math;

import '../api/matinee_api.dart';
import '../player/player_state.dart';
import 'party_state.dart';
import 'party_watch.dart';

/// How far off the party a player may be before it jumps to it, in seconds.
const partyJumpSeconds = 2.0;

/// How far off it may be before it plays a little faster or slower.
const partyNudgeSeconds = 0.3;

/// Closer than this, the player is with the party and plays at normal speed.
const partySettledSeconds = 0.1;

/// The rate change that closes a gap of a second or two.
const partyNudge = 0.08;

/// After the viewer's own play, pause, or seek, the party's older state is
/// left alone this long, until the server sends the new one.
const partyHold = Duration(milliseconds: 1500);

/// A jump takes a moment to load, and one in a copied stream lands on a
/// keyframe, seconds from where it aimed. The player waits this long before
/// it jumps again, and nudges in the meantime.
const partyJumpAgain = Duration(seconds: 8);
const partyJumpAgainCopied = Duration(seconds: 30);

/// Behind the party, the player only speeds up with this much buffered
/// ahead. With less, its connection barely keeps up, and playing faster
/// would run the buffer dry sooner.
const partyAheadSeconds = 10.0;

/// A jump past what is buffered aims this far ahead of the party, guessing
/// until a jump has shown how long the player took to play again.
const partyLeadGuessSeconds = 1.0;
const partyMaxLeadSeconds = 6.0;
const partyMaxLanding = Duration(seconds: 15);

/// Loading this long while the party plays, the player holds it up.
const partyStall = Duration(seconds: 2);

/// A player tells the party how it plays this often, and at once when that
/// changes.
const partyStatusEvery = Duration(seconds: 5);

/// Where the party waits for the player, it is ready with this much loaded
/// past the point it waits at.
const partyReadySeconds = 8.0;

/// What a player needs from its sitting to follow a party. The session
/// implements it; a test can stand in for one.
abstract interface class PartySyncHost {
  PlaybackState get playback;
  double get position;
  double get duration;
  double? get buffered;

  /// How the source is played, for the status the party shows of it.
  String? get method;
  String? get quality;
  bool get hls;

  /// A source or a pick is on its way, and nothing else may be done.
  bool get busy;

  /// Nothing has arrived for a while as it buffers.
  bool get waiting;

  /// The player has a source to command and no failure stopping it.
  bool get canFollow;

  Future<void> playFromParty();
  Future<void> pauseFromParty();
  Future<void> seekFromParty(double seconds);
  Future<void> setRateFromParty(double rate);
}

/// Keeps one player where the party is.
///
/// The party's state says where it was at some moment on the server's clock
/// and whether it plays; each second, and at once when that state changes,
/// this works out where the party is now and plays, pauses, nudges, or jumps
/// to match. A player that buffers falls behind alone and catches up after:
/// faster only with the buffer to spare, and with a jump that aims ahead by
/// its own loading time.
///
/// It also tells the party how this player plays, and what the viewer does.
/// Following the party never tells it anything, or two players would answer
/// each other forever.
final class PartyFollower {
  PartyFollower({
    required this.watch,
    required this.host,
    DateTime Function()? now,
  }) : _now = now ?? DateTime.now;

  final PartyWatch watch;
  final PartySyncHost host;
  final DateTime Function() _now;

  /// The party as of the parts of its state that matter here. The server
  /// sends the same state again every little while, which changes none of
  /// them.
  String? _moment;
  DateTime? _lastApply;
  DateTime? _holdUntil;
  DateTime? _jumpedAt;
  DateTime? _landingAt;
  DateTime? _loadingSince;
  DateTime? _sentAt;
  DateTime? _playPauseAt;
  double? _rate;
  double _lead = partyLeadGuessSeconds;
  String? _sentState;
  bool? _playPauseWanted;
  bool _active = false;
  bool _announced = false;
  bool _ended = false;

  /// Called each of the sitting's ticks, which come several times a second.
  void tick() {
    final now = _now();
    if (!watch.inStep) {
      _release();
      return;
    }
    if (!_active) {
      _active = true;
      _moment = null;
    }
    final party = watch.party!;
    final playback = party.playback!;
    final moment =
        '${playback.at}|${playback.playing}|${playback.positionSeconds}|'
        '${party.waitingFor.join(',')}';
    final fresh = moment != _moment;
    if (fresh) {
      _moment = moment;
      // The server's state is newer than whatever the viewer just did.
      _holdUntil = null;
      _apply(now, fresh: true);
      _lastApply = now;
    } else if (_lastApply == null ||
        now.difference(_lastApply!) >= const Duration(seconds: 1)) {
      _apply(now, fresh: false);
      _lastApply = now;
    }
    _checkStatus(now);
  }

  /// Called on each change of the player's own state: its end, a jump
  /// landing, and a buffering state that changed at once.
  void onPlayback() {
    final now = _now();
    if (!watch.inStep) {
      _release();
      return;
    }
    if (host.playback.phase == PlaybackPhase.ended) {
      if (!_ended) {
        _ended = true;
        _send(watch.next());
      }
    } else {
      // Played again from the end: the next end moves the party on again.
      _ended = false;
    }
    final landing = _landingAt;
    if (landing != null && host.playback.status.playing) {
      _landingAt = null;
      final took = now.difference(landing);
      if (took <= partyMaxLanding) {
        _lead = math.min(took.inMilliseconds / 1000, partyMaxLeadSeconds);
      }
    }
    _checkStatus(now);
  }

  /// A source opened at [positionSeconds]: the owner's announcement goes
  /// out, and a new source starts at normal speed.
  void sourceOpened(double positionSeconds) {
    _rate = null;
    _jumpedAt = null;
    if (_announced) return;
    _announced = true;
    final party = watch.party;
    if (party == null || !party.owner || party.item?.id == watch.itemId) {
      return;
    }
    _send(watch.play(positionSeconds));
  }

  /// The viewer played or paused, at [positionSeconds].
  void viewerPlayed({required bool playing, required double positionSeconds}) {
    if (!watch.inStep) return;
    _holdUntil = _now().add(partyHold);
    // The viewer moved it, so the wait that follows isn't a jump's.
    _landingAt = null;
    _send(
      watch.control(
        playing: playing,
        positionSeconds: math.max(0, positionSeconds),
      ),
    );
  }

  /// Holds the party's state still for [duration], as a seek bar drag does
  /// until it ends.
  void hold(Duration duration) {
    _holdUntil = _now().add(duration);
  }

  /// The viewer moved the file to [positionSeconds].
  void viewerSought(double positionSeconds) => viewerPlayed(
    playing: host.playback.status.wantsPlay,
    positionSeconds: positionSeconds,
  );

  void _apply(DateTime now, {required bool fresh}) {
    final party = watch.party;
    final playback = party?.playback;
    if (party == null || playback == null || !host.canFollow) return;
    final hold = _holdUntil;
    if (hold != null && now.isBefore(hold)) return;
    final target = partyPosition(playback, watch.offsetMs, now: now);
    final length = host.duration;
    final expected = length > 0 ? math.min(target, length) : target;
    final drift = host.position - expected;

    if (!playback.playing) {
      if (host.playback.status.wantsPlay) _wantPlaying(false, now);
      _setRate(1);
      // A party that waits for this player waits where it paused, so the
      // player loads that very spot.
      final close = party.waitingFor.contains(watch.selfId)
          ? partyNudgeSeconds
          : partyJumpSeconds;
      if (drift.abs() > close && _mayJump(now, fresh)) {
        _jump(expected, playback, now);
      }
      return;
    }
    // The party is at the end, so this player runs out on its own.
    if (length > 0 && expected >= length - 1) return;
    if (!host.playback.status.playing && !host.playback.status.wantsPlay) {
      _wantPlaying(true, now);
    }
    if (host.waiting) return;
    if (drift.abs() > partyJumpSeconds) {
      if (_mayJump(now, fresh)) {
        _jump(expected, playback, now);
      } else {
        _nudge(drift);
      }
      return;
    }
    if (drift.abs() > partyNudgeSeconds) {
      _nudge(drift);
    } else if (drift.abs() < partySettledSeconds) {
      _setRate(1);
    }
  }

  bool _mayJump(DateTime now, bool fresh) {
    if (fresh) return true;
    final jumped = _jumpedAt;
    if (jumped == null) return true;
    final wait = host.method == PlaybackMethod.remux && !host.hls
        ? partyJumpAgainCopied
        : partyJumpAgain;
    return now.difference(jumped) > wait;
  }

  void _jump(double expected, PartyPlayback playback, DateTime now) {
    _jumpedAt = now;
    _setRate(1);
    // A paused party waits where it is, and a jump within the buffer plays
    // at once, so only a playing one past it needs the lead.
    final far = playback.playing && !_bufferedTo(expected);
    _landingAt = far ? now : null;
    final ahead = far ? expected + _lead : expected;
    final length = host.duration;
    final to = length > 0 ? math.min(ahead, length) : ahead;
    _send(host.seekFromParty(to));
  }

  /// Behind, it hurries only with buffer to spare; ahead, it always may
  /// slow down.
  void _nudge(double drift) {
    if (drift > 0) {
      _setRate(1 - partyNudge);
    } else {
      _setRate(_mayHurry() ? 1 + partyNudge : 1);
    }
  }

  bool _bufferedTo(double seconds) {
    final end = host.buffered;
    return end != null && end >= seconds;
  }

  bool _mayHurry() {
    final end = host.buffered;
    if (end == null) return false;
    final length = host.duration;
    // The rest of the file is here, however little that is.
    if (length > 0 && end >= length - .5) return true;
    return end - host.position >= partyAheadSeconds;
  }

  void _setRate(double rate) {
    if (_rate == rate) return;
    _rate = rate;
    _send(host.setRateFromParty(rate));
  }

  void _wantPlaying(bool playing, DateTime now) {
    final at = _playPauseAt;
    if (_playPauseWanted == playing &&
        at != null &&
        now.difference(at) < const Duration(seconds: 1)) {
      return;
    }
    _playPauseWanted = playing;
    _playPauseAt = now;
    _send(playing ? host.playFromParty() : host.pauseFromParty());
  }

  void _checkStatus(DateTime now) {
    final party = watch.party;
    final playback = party?.playback;
    if (party == null || playback == null || !watch.inStep) return;
    final method = host.method;
    final quality = host.quality;
    if (method == null || quality == null) return;
    final loading = host.waiting || host.busy;
    if (!loading) {
      _loadingSince = null;
    } else {
      _loadingSince ??= now;
    }
    final waits = party.waitingFor.isNotEmpty;
    final String next;
    if (party.waitingFor.contains(watch.selfId)) {
      next = !loading && _ready()
          ? PartyPlayerState.paused
          : PartyPlayerState.buffering;
    } else if (loading &&
        (playback.playing || waits) &&
        now.difference(_loadingSince!) >= partyStall) {
      next = PartyPlayerState.buffering;
    } else {
      next = host.playback.status.playing
          ? PartyPlayerState.playing
          : PartyPlayerState.paused;
    }
    final sentAt = _sentAt;
    if (_sentState == next &&
        sentAt != null &&
        now.difference(sentAt) < partyStatusEvery) {
      return;
    }
    _sentState = next;
    _sentAt = now;
    final end = host.buffered;
    _send(
      watch.report(
        PartyStatusReport(
          itemId: watch.itemId,
          state: next,
          positionSeconds: math.max(0, host.position),
          bufferedSeconds: end == null ? 0 : math.max(0, end - host.position),
          method: method,
          quality: quality,
        ),
      ),
    );
  }

  /// Whether a paused player has loaded enough where the party waits.
  bool _ready() {
    final phase = host.playback.phase;
    if (phase == PlaybackPhase.idle || phase == PlaybackPhase.error) {
      return false;
    }
    final end = host.buffered;
    if (end == null) return phase == PlaybackPhase.ready;
    final length = host.duration;
    if (length > 0 && end >= length - .5) return true;
    return end - host.position >= partyReadySeconds;
  }

  void _release() {
    if (!_active) return;
    _active = false;
    _moment = null;
    _lastApply = null;
    _holdUntil = null;
    _jumpedAt = null;
    _landingAt = null;
    _loadingSince = null;
    _sentAt = null;
    _sentState = null;
    _rate = null;
    _playPauseAt = null;
    _playPauseWanted = null;
    _lead = partyLeadGuessSeconds;
    _ended = false;
    // A party plays at normal speed, and the video goes back to it after.
    _send(host.setRateFromParty(1));
  }

  void _send(Future<void> future) {
    unawaited(future.then((_) {}, onError: (Object _, StackTrace _) {}));
  }
}
