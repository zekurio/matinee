// Android playback commands and events. All times cross the bridge in milliseconds.
import 'package:pigeon/pigeon.dart';

@ConfigurePigeon(
  PigeonOptions(
    dartOut: 'lib/platform/player.g.dart',
    kotlinOut:
        'android/app/src/main/kotlin/io/github/zekurio/matinee/player/Player.g.kt',
    kotlinOptions: KotlinOptions(package: 'io.github.zekurio.matinee.player'),
    copyrightHeader: 'pigeons/header.txt',
  ),
)
enum EngineMessage { mpv, media3 }

enum FitMessage { contain, cover, fill }

enum PhaseMessage { idle, buffering, ready, ended, error }

/// The video widget's bounds in physical pixels relative to the Flutter view.
class ViewportMessage {
  ViewportMessage({
    required this.left,
    required this.top,
    required this.width,
    required this.height,
  });

  final int left;
  final int top;
  final int width;
  final int height;
}

class OpenMessage {
  OpenMessage({
    required this.url,
    required this.headers,
    required this.startMs,
    required this.engine,
    required this.fit,
    this.viewport,
  });

  final String url;
  final Map<String, String> headers;
  final int startMs;
  final EngineMessage engine;
  final FitMessage fit;
  final ViewportMessage? viewport;
}

sealed class PlaybackEventMessage {}

class StateMessage extends PlaybackEventMessage {
  StateMessage({required this.phase, required this.playing, this.message});

  final PhaseMessage phase;
  final bool playing;
  final String? message;
}

class TimelineMessage extends PlaybackEventMessage {
  TimelineMessage({required this.positionMs, this.durationMs, this.bufferedMs});

  final int positionMs;
  final int? durationMs;
  final int? bufferedMs;
}

class TrackMessage {
  TrackMessage({
    required this.id,
    this.language,
    this.title,
    this.codec,
    required this.isDefault,
    required this.isForced,
    required this.selected,
  });

  final String id;
  final String? language;
  final String? title;
  final String? codec;
  final bool isDefault;
  final bool isForced;
  final bool selected;
}

class TracksMessage extends PlaybackEventMessage {
  TracksMessage({required this.audio, required this.subtitles});

  final List<TrackMessage> audio;
  final List<TrackMessage> subtitles;
}

class VideoMessage extends PlaybackEventMessage {
  VideoMessage({required this.width, required this.height, this.frameRate});

  final int width;
  final int height;
  final double? frameRate;
}

class ActiveEngineMessage extends PlaybackEventMessage {
  ActiveEngineMessage({required this.engine});

  final EngineMessage engine;
}

/// One native player per activity. Each open has its own session and event
/// channel suffix, so a previous route or source cannot control the new one.
@HostApi()
abstract class PlayerApi {
  void open(int session, OpenMessage request);
  void play(int session);
  void pause(int session);
  void seekTo(int session, int positionMs);
  void setRate(int session, double rate);

  /// Null turns the track type off.
  void selectAudioTrack(int session, String? id);
  void selectSubtitleTrack(int session, String? id);

  /// A new URL selects that sidecar. Null removes any attached sidecar.
  void setSubtitleUrl(int session, String? url);
  void setVideoFit(int session, FitMessage fit);

  /// Null hides the native video while the widget is off screen.
  void setViewport(int session, ViewportMessage? viewport);
  void dispose(int session);
}

@FlutterApi()
abstract class PlayerEventsApi {
  void onEvent(PlaybackEventMessage event);
}
