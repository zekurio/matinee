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

enum SourceKindMessage { file, mp4, hls }

enum SubtitleEdgeMessage { none, outline, shadow }

class FrameSizeMessage {
  FrameSizeMessage({required this.width, required this.height});

  final int width;
  final int height;
}

class VideoDecoderMessage {
  VideoDecoderMessage({
    required this.codec,
    this.widest,
    this.tallest,
    required this.tenBit,
  });

  final String codec;
  final FrameSizeMessage? widest;
  final FrameSizeMessage? tallest;
  final bool tenBit;
}

class CodecCapabilitiesMessage {
  CodecCapabilitiesMessage({
    required this.video,
    required this.audio,
    required this.dolbyVision,
  });

  final List<VideoDecoderMessage> video;
  final List<String> audio;
  final bool dolbyVision;
}

/// Track identifiers on the server's plan. An engine resolves them against
/// the demuxer for the current source.
class SourceTracksMessage {
  SourceTracksMessage({
    this.audioIndex,
    this.audioOrdinal,
    this.subtitleIndex,
    this.subtitleUrl,
    required this.subtitleOffset,
  });

  final int? audioIndex;
  final int? audioOrdinal;
  final int? subtitleIndex;
  final String? subtitleUrl;
  final double subtitleOffset;
}

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
    this.sourceKind,
    this.tracks,
    this.autoplay = true,
    this.softwareDecoders = false,
    this.subtitleScale = 1,
    this.systemSubtitleScale = false,
    this.subtitleColor = 0xFFFFFFFF,
    this.subtitleBackground = 0x73000000,
    this.subtitleEdge = SubtitleEdgeMessage.shadow,
  });

  final String url;
  final Map<String, String> headers;
  final int startMs;
  final EngineMessage engine;
  final FitMessage fit;
  final ViewportMessage? viewport;
  final SourceKindMessage? sourceKind;
  final SourceTracksMessage? tracks;
  final bool autoplay;

  /// Try the device's software decoders before its hardware ones.
  final bool softwareDecoders;

  /// How much bigger than their own size subtitles draw, in either engine.
  final double subtitleScale;

  /// The system's caption size in place of [subtitleScale], when Settings
  /// follows the system's caption style.
  final bool systemSubtitleScale;

  /// The app's own look for the cues Media3 draws, ARGB, as Settings sets
  /// it. With [systemSubtitleScale], Android's caption style applies whole.
  final int subtitleColor;
  final int subtitleBackground;
  final SubtitleEdgeMessage subtitleEdge;
}

sealed class PlaybackEventMessage {}

class StateMessage extends PlaybackEventMessage {
  StateMessage({
    required this.phase,
    required this.playing,
    this.message,
    this.serverUnavailable = false,
  });

  final PhaseMessage phase;
  final bool playing;
  final String? message;
  final bool serverUnavailable;
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

enum TrackKindMessage { video, audio, text, other }

/// A format the player has, for the playback report: its MIME type, codec
/// string, size or channels, and what the device makes of it. Never its
/// id, label, or language. Dart checks each string before keeping it.
class FormatDiagnosticsMessage {
  FormatDiagnosticsMessage({
    required this.type,
    required this.selected,
    this.mime,
    this.codecs,
    this.width,
    this.height,
    this.channels,
    this.sampleRate,
    this.bitrate,
    this.support,
  });

  final TrackKindMessage type;
  final bool selected;
  final String? mime;
  final String? codecs;
  final int? width;
  final int? height;
  final int? channels;
  final int? sampleRate;
  final int? bitrate;
  final String? support;
}

/// A playback error by its codes: the engine's code and its name, the HTTP
/// status, the decoder, and the classes of its causes. Never its message,
/// which can hold the file's address.
class ErrorDiagnosticsMessage {
  ErrorDiagnosticsMessage({
    required this.code,
    this.name,
    this.type,
    this.renderer,
    this.format,
    this.formatSupport,
    this.httpStatus,
    this.decoder,
    this.secureDecoder,
    required this.causes,
  });

  final int code;
  final String? name;
  final String? type;
  final String? renderer;
  final FormatDiagnosticsMessage? format;
  final String? formatSupport;
  final int? httpStatus;
  final String? decoder;
  final bool? secureDecoder;
  final List<String> causes;
}

/// What the playback report learns from the engine as it plays: an error,
/// sent before the error state it explains, the tracks Media3 picked, or a
/// decoder it started. mpv picks its own decoders and tracks, so it sends
/// only errors.
class DiagnosticsMessage extends PlaybackEventMessage {
  DiagnosticsMessage({this.error, this.tracks, this.decoderKind, this.decoder});

  final ErrorDiagnosticsMessage? error;
  final List<FormatDiagnosticsMessage>? tracks;
  final TrackKindMessage? decoderKind;
  final String? decoder;
}

/// The app and the device for the playback report, without anything that
/// tells them apart from others of the same model.
class DeviceDiagnosticsMessage {
  DeviceDiagnosticsMessage({
    required this.appBuild,
    required this.buildType,
    required this.release,
    required this.sdk,
    required this.manufacturer,
    required this.model,
    this.abi,
    required this.tv,
    required this.media3,
    required this.ffmpeg,
  });

  final int appBuild;
  final String buildType;
  final String release;
  final int sdk;
  final String manufacturer;
  final String model;
  final String? abi;
  final bool tv;
  final String media3;
  final bool ffmpeg;
}

/// One native player per activity. Each open has its own session and event
/// channel suffix, so a previous route or source cannot control the new one.
@HostApi()
abstract class PlayerApi {
  CodecCapabilitiesMessage codecs();
  DeviceDiagnosticsMessage deviceDiagnostics();
  void setFullscreen(int owner, bool enabled);
  void open(int session, OpenMessage request);
  void play(int session);
  void pause(int session);
  void seekTo(int session, int positionMs);
  void setRate(int session, double rate);

  /// Null turns the track type off.
  void selectAudioTrack(int session, String? id);
  void selectSubtitleTrack(int session, String? id);
  void setSourceTracks(int session, SourceTracksMessage tracks);

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
