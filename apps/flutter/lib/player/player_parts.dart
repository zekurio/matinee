import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:intl/intl.dart';

import '../api/matinee_api.dart';
import '../core/failure_text.dart';
import '../l10n/app_localizations.dart';
import '../media/format.dart';
import 'offline_session.dart' show DownloadUnplayable;
import 'playback_session.dart';
import 'player.dart';
import 'player_overlays.dart' show PlayerNote;
import 'player_panel.dart';
import 'player_system.dart';

/// What the phone's and the TV's players share over a [PlayerSitting]:
/// the words for a failure, a note, and the skip button, the menus'
/// entries, the next episode's countdown, the speed kept across a new
/// source, and the system's media controls. Each player lays them out its
/// own way.

/// What went wrong, as a title and a line under it.
(String, String) playbackErrorText(AppLocalizations l, Object error) {
  switch (error) {
    case ApiException(code: playbackBusy):
      final playing = error.dataAs(PlaybackBusyData.fromJson)?.playing;
      return (
        l.playerBusy,
        playing == null ? l.playerBusyGeneric : l.playerBusyDetail(playing),
      );
    case ApiException(code: playbackRestricted):
      final reason = error.dataAs(PlaybackRestrictedData.fromJson)?.reason;
      return (
        l.playerRestricted,
        switch (reason) {
          PlaybackRestriction.bitrateOriginal => l.playerRestrictedOriginal,
          PlaybackRestriction.bitrateTranscode => l.playerRestrictedNoTranscode,
          PlaybackRestriction.bitrateFailed => l.playerRestrictedFailed,
          PlaybackRestriction.bitrate => l.playerRestrictedBitrate,
          PlaybackRestriction.transcode => l.playerRestrictedTranscode,
          _ => error.message ?? l.playerRestrictedGeneric,
        },
      );
    case ApiException(code: playbackUnplayable):
      return (l.playerErrorLost, l.playerUnplayable);
    case PlaybackServerUnavailable():
      return (l.playerErrorLost, l.errorUnreachable);
    case DownloadUnplayable():
      return (l.playerErrorLost, l.playerErrorDownload);
    default:
      return (l.playerErrorLost, describeFailure(l, error));
  }
}

/// The note for a [PlaybackNotice], over the video, [margin] off its
/// edges.
PlayerNote playbackNoticeNote(
  AppLocalizations l,
  PlaybackNotice notice,
  Object? detail, {
  EdgeInsets margin = PlayerNote.phoneMargin,
}) => switch (notice) {
  PlaybackNotice.burnInFailed => PlayerNote(
    margin: margin,
    title: l.playerNoticeBurnInFailed,
    detail: l.playerNoticeBurnInFailedDetail,
  ),
  PlaybackNotice.qualityFailed => PlayerNote(
    margin: margin,
    title: l.playerNoticeSwitchFailed,
    detail: l.playerNoticeQualityFailedDetail,
  ),
  PlaybackNotice.switchFailed => PlayerNote(
    margin: margin,
    title: l.playerNoticeSwitchFailed,
    detail: detail == null ? null : playbackErrorText(l, detail).$2,
  ),
  PlaybackNotice.subtitleFailed => PlayerNote(
    margin: margin,
    title: l.playerErrorSubtitles,
  ),
};

/// What the button that skips [segment] says.
String skipSegmentLabel(AppLocalizations l, MediaSegment segment) =>
    switch (segment.kind) {
      MediaSegmentKind.recap => l.playerSkipRecap,
      MediaSegmentKind.credits => l.playerSkipCredits,
      MediaSegmentKind.preview => l.playerSkipPreview,
      _ => l.playerSkipIntro,
    };

/// The player's menus. The phone opens each from its own button; the TV
/// puts quality and speed together under its settings button.
enum PlayerMenu { audio, subtitles, speed, quality }

/// The speeds the speed menu offers, from half to double.
const playerSpeeds = [.5, .75, 1.0, 1.25, 1.5, 2.0];

/// The name a [PlayerMenu] goes by, over its entries.
String playerMenuName(AppLocalizations l, PlayerMenu menu) => switch (menu) {
  PlayerMenu.audio => l.playerMenuAudio,
  PlayerMenu.subtitles => l.playerMenuSubtitles,
  PlayerMenu.speed => l.playerSpeed,
  PlayerMenu.quality => l.playerQuality,
};

/// Whether [sitting] offers the quality menu: only a stream does, and only
/// with a choice.
bool offersQuality(PlayerSitting sitting) =>
    sitting is PlaybackSession &&
    sitting.plan != null &&
    (sitting.plan!.original || sitting.qualities.isNotEmpty);

/// What [menu] lists for [sitting], headed by its name. [rate] is the
/// speed in force and [onRate] picks another.
List<PanelEntry> playerMenuEntries(
  AppLocalizations l,
  PlayerSitting sitting,
  PlayerMenu menu, {
  required double rate,
  required ValueChanged<double> onRate,
}) {
  void run(Future<void> Function() pick) => unawaited(pick());
  final decimal = NumberFormat.decimalPattern(l.localeName);
  switch (menu) {
    case PlayerMenu.audio:
      return [
        PanelHeading(l.playerMenuAudio),
        if (sitting.audioTracks.isEmpty) PanelNote(l.playerAudioNoTracks),
        for (final track in sitting.audioTracks)
          PanelChoice(
            track.label,
            detail: [track.format, ?track.layout].join(' · '),
            selected: track.index == sitting.audio?.index,
            pick: () => run(() => sitting.pickAudio(track)),
          ),
      ];
    case PlayerMenu.subtitles:
      return [
        PanelHeading(l.playerMenuSubtitles),
        PanelChoice(
          l.playerSubtitlesOff,
          selected: sitting.subtitle == null,
          pick: () => run(() => sitting.pickSubtitle(null)),
        ),
        for (final track in sitting.subtitleTracks)
          PanelChoice(
            track.label,
            detail: [
              if (track.forced) l.playerSubtitlesForced,
              if (track.sdh) 'SDH',
              track.format,
              if (sitting.burnsIn(track)) l.playerSubtitlesBurnedIn,
            ].join(' · '),
            selected: track.id == sitting.subtitle?.id,
            enabled: sitting.canPick(track),
            pick: () => run(() => sitting.pickSubtitle(track)),
          ),
      ];
    case PlayerMenu.speed:
      return [
        PanelHeading(l.playerSpeed),
        for (final speed in playerSpeeds)
          PanelChoice(
            speed == 1
                ? l.playerSpeedNormal
                : l.playerSpeedRate(decimal.format(speed)),
            selected: rate == speed,
            pick: () => onRate(speed),
          ),
      ];
    case PlayerMenu.quality:
      // Only a stream has the menu.
      final session = sitting;
      final plan = session is PlaybackSession ? session.plan : null;
      if (session is! PlaybackSession || plan == null) return const [];
      return [
        PanelHeading(l.playerQuality),
        if (plan.original)
          PanelChoice(
            l.playerQualityOriginal,
            selected: plan.quality == PlaybackQuality.original,
            pick: () =>
                run(() => session.pickQuality(PlaybackQuality.original)),
          ),
        for (final preset in session.qualities)
          PanelChoice(
            l.playbackQualityPreset(
              preset.height,
              l.playerBitrateMbpsExact(
                decimal.format(preset.bitrate / 1000000),
              ),
            ),
            selected: plan.quality == preset.id,
            pick: () => run(() => session.pickQuality(preset.id)),
          ),
      ];
  }
}

/// The next episode's countdown, as the Kotlin player's `UpNextState`:
/// once the file ends, the next episode starts at once if the credits
/// already counted down to it, or after [seconds] of its own, unless the
/// countdown stopped or autoplay is off, when it waits for Play. [onTick]
/// redraws each second; [onPlay] moves on.
class UpNextCountdown {
  UpNextCountdown({
    required bool autoplay,
    required this.onTick,
    required this.onPlay,
  }) : _autoplay = autoplay,
       cancelled = !autoplay;

  static const seconds = 10;

  final bool _autoplay;
  final VoidCallback onTick;
  final ValueChanged<MediaItem> onPlay;

  /// The countdown stopped, or never ran with autoplay off.
  bool cancelled;

  /// Put away: the phone's card while the credits roll, the TV's button on
  /// the picture until the next episode changes.
  bool hidden = false;

  /// The seconds left of its own countdown, once the file ended.
  int left = seconds;

  bool _sawEarly = false;
  Timer? _advance;

  /// Follows [sitting]: call on each change.
  void sync(PlayerSitting sitting, {required bool leaving}) {
    final next = sitting.error == null ? sitting.next : null;
    if (next == null || !sitting.ended) {
      stop();
      left = seconds;
      _sawEarly = next != null;
      if (next == null) {
        cancelled = !_autoplay;
        hidden = false;
      }
      return;
    }
    if (leaving || cancelled || _advance != null) return;
    if (_sawEarly) {
      _advance = Timer(Duration.zero, () => onPlay(next));
    } else {
      _advance = Timer.periodic(const Duration(seconds: 1), (_) {
        left--;
        onTick();
        if (left <= 0) {
          stop();
          onPlay(next);
        }
      });
    }
  }

  /// Stops the countdown, and puts the offer away when [hide].
  void cancel({required bool hide}) {
    stop();
    cancelled = true;
    if (hide) hidden = true;
  }

  void stop() {
    _advance?.cancel();
    _advance = null;
  }

  /// The seconds the countdown shows: those left in the file, then its own.
  int secondsLeft(PlayerSitting sitting) => sitting.ended
      ? left
      : (sitting.duration - sitting.position).ceil().clamp(0, 9999);
}

/// The speed picked in the player, which a source the sitting opens again
/// starts without, so it goes again once that source is ready.
class PlayerSpeed {
  PlayerSpeed(this._sitting);

  final PlayerSitting _sitting;
  double value = 1;
  PlaybackPhase _phase = PlaybackPhase.idle;

  /// Call on each change of the sitting.
  void follow() {
    final phase = _sitting.playback.phase;
    if (phase == PlaybackPhase.ready && _phase != phase && value != 1) {
      unawaited(apply());
    }
    _phase = phase;
  }

  void pick(double speed) {
    value = speed;
    unawaited(apply());
  }

  /// Sets [rate], or the picked speed, on the player.
  Future<void> apply([double? rate]) async {
    try {
      await _sitting.player.setRate(rate ?? value);
    } on Exception {
      // The speed applies again once the source is ready.
    }
  }
}

/// The video in the system's controls: the notification shade, the lock
/// screen, a headset, and a TV's own remote and assistant, as the Kotlin
/// player's media session. [sync] says what plays and where; presses come
/// back to [sitting].
class PlayerMediaSession {
  PlayerMediaSession(this._sitting, this._controls, {required this.headers}) {
    _commands = _controls.commands.listen(_command);
  }

  final PlayerSitting _sitting;
  final MediaControls _controls;

  /// The session's headers, for the server's own artwork.
  final Map<String, String> Function() headers;
  StreamSubscription<MediaCommandMessage>? _commands;
  String? _shown;
  MediaStateMessage? _state;
  DateTime _at = DateTime.now();
  bool _playing = false;

  /// What the controls show: the episode and its show, or the movie and its
  /// year, with its picture. [rate] is the speed the video moves at.
  void sync(AppLocalizations l, {required bool playing, required double rate}) {
    _playing = playing;
    final item = _sitting.item;
    if (item == null) return;
    final names = itemNames(item, l);
    final code = item.label.code;
    final back = _sitting.skipBack;
    final ahead = _sitting.skipForward;
    final art =
        item.episode?.still ??
        item.title?.images.backdrop ??
        item.title?.images.poster;
    final artwork = art == null ? null : _sitting.artworkUrl(art.id);
    final info = MediaInfoMessage(
      title: names.title,
      subtitle: item.title?.kind == TitleKind.show
          ? [names.showName, ?code].join(' · ')
          : names.year,
      artworkUrl: artwork?.toString(),
      // The session's token goes only with the server's own artwork.
      headers: artwork == null ? const {} : headers(),
      playLabel: l.playerPlay,
      pauseLabel: l.playerPause,
      backMs: back == null ? null : back * 1000,
      backLabel: back == null ? null : l.playerSkipBack(back),
      aheadMs: ahead == null ? null : ahead * 1000,
      aheadLabel: ahead == null ? null : l.playerSkipForward(ahead),
    );
    final key = [
      item.id,
      info.title,
      info.subtitle,
      info.artworkUrl,
      back,
      ahead,
      info.playLabel,
    ].join('\u0000');
    if (key != _shown) {
      _shown = key;
      _state = null;
      unawaited(_controls.show(info));
    }
    final state = mediaState(
      playing: playing,
      phase: _sitting.playback.phase,
      position: _sitting.position,
      duration: _sitting.duration,
      rate: rate,
    );
    final now = DateTime.now();
    if (!mediaStateMoved(_state, state, now.difference(_at))) return;
    _state = state;
    _at = now;
    unawaited(_controls.update(state));
  }

  /// The words changed with the language, so the next [sync] sends all.
  void forget() => _shown = null;

  void _command(MediaCommandMessage command) {
    switch (command.kind) {
      case MediaCommandKind.play:
        if (!_playing) unawaited(_sitting.togglePlay());
      case MediaCommandKind.pause:
        if (_playing) unawaited(_sitting.togglePlay());
      case MediaCommandKind.seekTo:
        if (command.positionMs case final ms?) {
          unawaited(_sitting.seek(ms / 1000));
        }
      case MediaCommandKind.back:
        if (_sitting.skipBack case final step?) {
          unawaited(_sitting.skip(-step));
        }
      case MediaCommandKind.ahead:
        if (_sitting.skipForward case final step?) {
          unawaited(_sitting.skip(step));
        }
    }
  }

  void dispose() {
    unawaited(_commands?.cancel());
    if (_shown != null) unawaited(_controls.hide());
  }
}
