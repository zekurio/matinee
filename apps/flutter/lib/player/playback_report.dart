import 'dart:math';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/matinee_api.dart';
import '../platform/player.g.dart' as wire;
import 'player_preferences.dart';
import 'player_state.dart';

/*
 * A report of the latest playback, for working out why something won't
 * play, as the Kotlin app's PlaybackDiagnostics.kt. It stays in memory
 * until the app closes or the viewer clears it, and leaves the device only
 * when the viewer copies it. Nothing here sends it anywhere.
 *
 * It holds codes, never text: every string in a report is a [Safe], which
 * only takes a value from a known list or a short code without the
 * characters a URL, a path, or a sentence needs. Titles, file names, the
 * server's address, the account, tokens, and error messages never reach
 * it; the error's typed code and the HTTP status do.
 */

/// The most attempts a report keeps, the latest ones.
const maxAttempts = 12;

/// The most tracks and decoders a report lists.
const maxTracks = 4;
const maxDecoders = 4;

/// How many of an error's causes a report names.
const maxCauses = 3;

const _maxToken = 48;

/// A string that may go in a report: one from a known list, or a short
/// code of letters, digits, spaces, and `. _ - +`. Anything else becomes
/// `other`. This checks codes the app and the engines produce, like
/// `c2.android.avc.decoder` or `Main 10`; it never cleans up free text.
extension type const Safe._(String text) {
  static const other = Safe._('other');

  static final _allowed = RegExp(r'^[a-zA-Z0-9._\-+ ]+$');
  static final _subtype = RegExp(r'^[a-z0-9.\-+_]{1,32}$');
  static const _mimeTypes = {'video', 'audio', 'text', 'application', 'image'};

  /// A short code, as it is, or [other]. Null for nothing.
  static Safe? token(String? value, [int max = _maxToken]) {
    final trimmed = value?.trim();
    if (trimmed == null || trimmed.isEmpty) return null;
    return trimmed.length <= max && _allowed.hasMatch(trimmed)
        ? Safe._(trimmed)
        : other;
  }

  /// [value] when [known] has it, in lower case, or [other]. Null for
  /// nothing.
  static Safe? known(String? value, Set<String> known) {
    final lower = value?.trim().toLowerCase();
    if (lower == null || lower.isEmpty) return null;
    return known.contains(lower) ? Safe._(lower) : other;
  }

  /// A MIME type like `video/avc`: a top-level type the engines use, then a
  /// short subtype.
  static Safe? mime(String? value) {
    final lower = value?.trim().toLowerCase();
    if (lower == null || lower.isEmpty) return null;
    final slash = lower.indexOf('/');
    if (slash < 0) return other;
    final ok =
        _mimeTypes.contains(lower.substring(0, slash)) &&
        _subtype.hasMatch(lower.substring(slash + 1));
    return ok ? Safe._(lower) : other;
  }

  /// An enum's name, which the app defines, in snake case.
  static Safe of(Enum value) => Safe._(_snake(value.name));

  /// The engines' constant names, like `ERROR_CODE_DECODING_FAILED`.
  static Safe? constant(String? value) => token(value, 64);
}

String _snake(String name) => name
    .replaceAllMapped(RegExp('[A-Z]'), (m) => '_${m[0]!.toLowerCase()}')
    .replaceFirst(RegExp('^_'), '');

/// ffmpeg's codec names the server reports, as Capabilities knows them and
/// a few more.
const knownVideoCodecs = {
  'h264', 'hevc', 'av1', 'vp9', 'vp8', 'mpeg2video', 'mpeg1video', 'mpeg4', //
  'msmpeg4v3', 'vc1', 'wmv3', 'h263', 'theora', 'prores', 'mjpeg',
};

const knownAudioCodecs = {
  'aac', 'mp3', 'mp2', 'opus', 'vorbis', 'flac', 'alac', 'ac3', 'eac3', //
  'ac4', 'dts', 'truehd', 'mlp', 'wmav2', 'wmapro', 'amr_nb',
};

/// The file extensions the server scans for.
const knownContainers = {
  'mp4', 'm4v', 'mov', 'webm', 'mkv', 'avi', 'ts', 'm2ts', 'mts', 'mpg', //
  'mpeg', 'ogv', 'wmv', 'flv',
};

/// The format names of subtitle tracks, as the server shows them.
const knownSubtitleFormats = {
  'srt', 'subrip', 'ass', 'ssa', 'vtt', 'webvtt', 'pgs', 'vobsub', //
  'dvdsub', 'dvb', 'mov_text', 'ttml', 'teletext',
};

const _knownSubtitleSources = {'sidecar', 'embedded'};
const _knownDeliveries = {'webvtt', 'pgs', 'ass', 'burn-in'};
const _knownHdr = {
  'hdr10', 'hdr10+', 'hlg', 'dolby-vision', 'dolby vision', 'sdr', //
};
final _knownQualities = PlaybackQuality.all.toSet();
final _knownReasons = PlaybackReason.all.toSet();
final _knownSettingCodecs = {
  ...knownVideoCodecs,
  ...knownAudioCodecs,
  automaticCodec,
};

// What a device profile may say besides codec names: every codec, and
// every PCM format.
final _knownProfileCodecs = {..._knownSettingCodecs, '*', 'pcm_*'};

Safe? safeVideoCodec(String? codec) => Safe.known(codec, knownVideoCodecs);

/// PCM comes in many forms, all named `pcm_` and a short code.
Safe? safeAudioCodec(String? codec) =>
    codec != null && codec.toLowerCase().startsWith('pcm_')
    ? Safe.token(codec.toLowerCase(), 16)
    : Safe.known(codec, knownAudioCodecs);

List<Safe> safeCodecs(Iterable<String> codecs, {int max = 8}) => [
  for (final codec in codecs.take(max)) ?Safe.known(codec, _knownProfileCodecs),
];

Safe? safeQuality(String? id) => Safe.known(id, _knownQualities);

/// Where the video came from: the file, a copied stream, an encode as HLS
/// or as one stream, or a download.
enum SourceMode { direct, stream, hls, encode, local }

/// Why the player loaded a source.
enum AttemptReason {
  start,
  fallback,
  retry,
  audioChange,
  subtitleChange,
  qualityChange,
}

/// How a source went: still loading, played, failed, left for another, or
/// the player closed first.
enum AttemptOutcome { loading, playing, failed, replaced, closed }

/// Who draws the subtitle picked: the app over the video, the engine, or
/// the server into the picture.
enum SubtitleRendering { screen, player, burnIn }

/// What a track or decoder is for.
enum TrackKind { video, audio, text, other }

/// Things that went wrong beside the video, counted: a subtitle that
/// didn't load, a `playback.start` or `playback.seek` that failed, the
/// server saying nothing it knows plays here, and the server refusing the
/// account: its access rules rule the file out, or it plays on too many
/// devices.
enum DiagnosticsNote {
  subtitleLoadFailed,
  startFailed,
  seekFailed,
  unplayable,
  restricted,
  tooManyStreams,
}

/// The app and the device, without anything that tells them apart from
/// others of the same model.
@immutable
class DeviceDiagnostics {
  const DeviceDiagnostics({
    this.appVersion,
    this.appBuild = 0,
    this.buildType,
    this.androidRelease,
    this.sdk = 0,
    this.manufacturer,
    this.model,
    this.abi,
    this.tv = false,
    this.media3,
    this.ffmpeg = false,
  });

  factory DeviceDiagnostics.of(
    String appVersion,
    wire.DeviceDiagnosticsMessage device,
  ) => DeviceDiagnostics(
    appVersion: Safe.token(appVersion, 32),
    appBuild: device.appBuild,
    buildType: Safe.token(device.buildType, 16),
    androidRelease: Safe.token(device.release, 16),
    sdk: device.sdk,
    manufacturer: Safe.token(device.manufacturer, 32),
    model: Safe.token(device.model, 40),
    abi: Safe.token(device.abi, 16),
    tv: device.tv,
    media3: Safe.token(device.media3, 16),
    ffmpeg: device.ffmpeg,
  );

  final Safe? appVersion;
  final int appBuild;
  final Safe? buildType;
  final Safe? androidRelease;
  final int sdk;
  final Safe? manufacturer;
  final Safe? model;
  final Safe? abi;
  final bool tv;
  final Safe? media3;
  final bool ffmpeg;
}

/// This device's player settings that change what plays.
@immutable
class SettingsDiagnostics {
  const SettingsDiagnostics({
    required this.engine,
    required this.decoders,
    this.quality,
    this.videoCodec,
    this.audioCodec,
    this.convertAudio = const [],
  });

  factory SettingsDiagnostics.of(
    PlayerEngine engine,
    PlayerPrefs prefs, {
    String? quality,
  }) => SettingsDiagnostics(
    engine: Safe.of(engine),
    decoders: Safe.of(prefs.decoders),
    quality: safeQuality(quality ?? prefs.quality),
    videoCodec: Safe.known(prefs.videoCodec, _knownSettingCodecs),
    audioCodec: Safe.known(prefs.audioCodec, _knownSettingCodecs),
    convertAudio: safeCodecs(prefs.convertAudio.toList()..sort()),
  );

  final Safe engine;
  final Safe decoders;
  final Safe? quality;
  final Safe? videoCodec;
  final Safe? audioCodec;
  final List<Safe> convertAudio;
}

/// What the server's probe says of the file: its formats, not its name or
/// where it is.
@immutable
class FileDiagnostics {
  const FileDiagnostics({
    this.container,
    this.videoCodec,
    this.videoProfile,
    this.width,
    this.height,
    this.bitDepth,
    this.hdr,
    this.dolbyVisionProfile,
    this.audioCodecs = const [],
    this.subtitleCount = 0,
    this.probed = false,
  });

  factory FileDiagnostics.of(MediaItem item) {
    final probe = item.probe;
    final video = probe?.video;
    return FileDiagnostics(
      container: Safe.known(item.container, knownContainers),
      videoCodec: safeVideoCodec(video?.codec),
      videoProfile: Safe.token(video?.profile, 24),
      width: video?.width,
      height: video?.height,
      bitDepth: video?.bitDepth,
      hdr: Safe.known(video?.hdr, _knownHdr),
      dolbyVisionProfile: video?.dolbyVisionProfile,
      audioCodecs: [
        for (final audio in (probe?.audio ?? const []).take(maxTracks * 2))
          ?safeAudioCodec(audio.codec),
      ],
      subtitleCount: probe?.subtitles.length ?? 0,
      probed: probe != null,
    );
  }

  final Safe? container;
  final Safe? videoCodec;
  final Safe? videoProfile;
  final int? width;
  final int? height;
  final int? bitDepth;
  final Safe? hdr;
  final int? dolbyVisionProfile;
  final List<Safe> audioCodecs;
  final int subtitleCount;
  final bool probed;
}

/// The audio and subtitle picked, by their formats; never their language,
/// label, or title.
@immutable
class SelectionDiagnostics {
  const SelectionDiagnostics({
    this.audioIndex,
    this.audioCodec,
    this.audioChannels,
    this.subtitleFormat,
    this.subtitleSource,
    this.subtitleDelivery,
    this.subtitleRendering,
  });

  /// What [plan] picked, and who draws its subtitle.
  factory SelectionDiagnostics.of(PlaybackStart plan) {
    final subtitle = plan.subtitle;
    return SelectionDiagnostics.picked(
      plan.audio,
      subtitle,
      switch (plan.subtitleMode) {
        PlaybackSubtitleMode.burnIn => SubtitleRendering.burnIn,
        // The app draws a WebVTT file itself; the engine the rest.
        PlaybackSubtitleMode.client
            when subtitle?.delivery == SubtitleDelivery.webvtt =>
          SubtitleRendering.screen,
        _ => SubtitleRendering.player,
      },
    );
  }

  /// [audio] and [subtitle], which [rendering] draws, as a download picks
  /// them without a server.
  factory SelectionDiagnostics.picked(
    AudioTrack? audio,
    SubtitleTrack? subtitle,
    SubtitleRendering? rendering,
  ) => SelectionDiagnostics(
    audioIndex: audio?.index,
    audioCodec: safeAudioCodec(audio?.codec),
    audioChannels: audio?.channels,
    subtitleFormat: Safe.known(subtitle?.format, knownSubtitleFormats),
    subtitleSource: Safe.known(subtitle?.source, _knownSubtitleSources),
    subtitleDelivery: subtitle == null
        ? null
        : Safe.known(subtitle.delivery ?? 'none', {
            ..._knownDeliveries,
            'none',
          }),
    subtitleRendering: subtitle == null ? null : rendering,
  );

  final int? audioIndex;
  final Safe? audioCodec;
  final int? audioChannels;
  final Safe? subtitleFormat;
  final Safe? subtitleSource;
  final Safe? subtitleDelivery;
  final SubtitleRendering? subtitleRendering;
}

/// What the player told the server this device plays, what the server
/// encodes to, and the most it streams to the account.
@immutable
class CapabilityDiagnostics {
  const CapabilityDiagnostics({
    this.videoCodecs = const [],
    this.audioCodecs = const [],
    this.embeddedSubtitles = const [],
    this.streamAudioCodecs = const [],
    this.encodeVideoCodecs = const [],
    this.serverVideoCodecs = const [],
    this.serverAudioCodecs = const [],
    this.maxBitrate,
  });

  factory CapabilityDiagnostics.of(
    PlaybackDevice device,
    PlaybackOptions? options,
  ) => CapabilityDiagnostics(
    videoCodecs: safeCodecs(device.video.map((d) => d.codec).toSet()),
    audioCodecs: safeCodecs(device.audio, max: 16),
    embeddedSubtitles: [
      for (final format in device.embeddedSubtitles.take(8))
        ?Safe.known(format, {...knownSubtitleFormats, '*'}),
    ],
    streamAudioCodecs: safeCodecs(device.streamAudio),
    encodeVideoCodecs: safeCodecs(device.encodeVideo),
    serverVideoCodecs: safeCodecs(options?.videoCodecs ?? const []),
    serverAudioCodecs: safeCodecs(options?.audioCodecs ?? const []),
    maxBitrate: options?.maxBitrate,
  );

  final List<Safe> videoCodecs;
  final List<Safe> audioCodecs;
  final List<Safe> embeddedSubtitles;
  final List<Safe> streamAudioCodecs;
  final List<Safe> encodeVideoCodecs;
  final List<Safe> serverVideoCodecs;
  final List<Safe> serverAudioCodecs;

  /// Bits per second, null without a limit.
  final int? maxBitrate;
}

TrackKind _kind(wire.TrackKindMessage kind) => switch (kind) {
  wire.TrackKindMessage.video => TrackKind.video,
  wire.TrackKindMessage.audio => TrackKind.audio,
  wire.TrackKindMessage.text => TrackKind.text,
  wire.TrackKindMessage.other => TrackKind.other,
};

/// A track the player has, by its format and whether the device can play
/// it.
@immutable
class TrackDiagnostics {
  const TrackDiagnostics({
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

  factory TrackDiagnostics.of(wire.FormatDiagnosticsMessage format) =>
      TrackDiagnostics(
        type: _kind(format.type),
        selected: format.selected,
        mime: Safe.mime(format.mime),
        codecs: Safe.token(format.codecs, 40),
        width: format.width,
        height: format.height,
        channels: format.channels,
        sampleRate: format.sampleRate,
        bitrate: format.bitrate,
        support: Safe.constant(format.support),
      );

  final TrackKind type;
  final bool selected;
  final Safe? mime;
  final Safe? codecs;
  final int? width;
  final int? height;
  final int? channels;
  final int? sampleRate;
  final int? bitrate;
  final Safe? support;
}

/// A decoder the player started, by its name on the device.
@immutable
class DecoderDiagnostics {
  const DecoderDiagnostics(this.type, this.name);

  final TrackKind type;
  final Safe? name;

  @override
  bool operator ==(Object other) =>
      other is DecoderDiagnostics && other.type == type && other.name == name;

  @override
  int get hashCode => Object.hash(type, name);
}

/// A playback error by its codes: the engine's error code and its name,
/// the HTTP status, the decoder, and the classes of its causes. Never its
/// message.
@immutable
class ErrorDiagnostics {
  const ErrorDiagnostics({
    required this.code,
    this.name,
    this.type,
    this.renderer,
    this.format,
    this.formatSupport,
    this.httpStatus,
    this.decoder,
    this.secureDecoder,
    this.causes = const [],
  });

  factory ErrorDiagnostics.of(wire.ErrorDiagnosticsMessage error) =>
      ErrorDiagnostics(
        code: error.code,
        name: Safe.constant(error.name),
        type: Safe.token(error.type),
        renderer: Safe.token(error.renderer, 64),
        format: switch (error.format) {
          final format? => TrackDiagnostics.of(format),
          null => null,
        },
        formatSupport: Safe.constant(error.formatSupport),
        httpStatus: error.httpStatus,
        decoder: Safe.token(error.decoder, 64),
        secureDecoder: error.secureDecoder,
        causes: [
          for (final cause in error.causes.take(maxCauses))
            ?Safe.token(cause, 64),
        ],
      );

  /// An error the engine said nothing of.
  static const unknown = ErrorDiagnostics(code: 0);

  final int code;
  final Safe? name;
  final Safe? type;
  final Safe? renderer;
  final TrackDiagnostics? format;
  final Safe? formatSupport;
  final int? httpStatus;
  final Safe? decoder;
  final bool? secureDecoder;
  final List<Safe> causes;
}

@immutable
class AttemptDiagnostics {
  const AttemptDiagnostics({
    required this.number,
    required this.mode,
    required this.reason,
    required this.startAt,
    this.audioIndex,
    this.quality,
    this.burnIn = false,
    this.why = const [],
    this.videoTo,
    this.audioTo,
    this.outcome = AttemptOutcome.loading,
    this.error,
  });

  final int number;
  final SourceMode mode;
  final AttemptReason reason;

  /// Seconds into the file, whole.
  final int startAt;
  final int? audioIndex;
  final Safe? quality;
  final bool burnIn;

  /// Why the server didn't play the file as it is, as its answer says.
  final List<Safe> why;

  /// What the server encodes the video and converts the audio to.
  final Safe? videoTo;
  final Safe? audioTo;
  final AttemptOutcome outcome;
  final ErrorDiagnostics? error;

  AttemptDiagnostics copyWith({
    AttemptOutcome? outcome,
    ErrorDiagnostics? error,
  }) => AttemptDiagnostics(
    number: number,
    mode: mode,
    reason: reason,
    startAt: startAt,
    audioIndex: audioIndex,
    quality: quality,
    burnIn: burnIn,
    why: why,
    videoTo: videoTo,
    audioTo: audioTo,
    outcome: outcome ?? this.outcome,
    error: error ?? this.error,
  );
}

/// All a report holds. Each part is bounded, so a long sitting can't grow
/// it.
@immutable
class PlaybackReport {
  const PlaybackReport({
    this.device = const DeviceDiagnostics(),
    required this.settings,
    this.file = const FileDiagnostics(),
    this.selection = const SelectionDiagnostics(),
    this.capabilities = const CapabilityDiagnostics(),
    this.attempts = const [],
    this.droppedAttempts = 0,
    this.tracks = const [],
    this.decoders = const [],
    this.notes = const {},
  });

  final DeviceDiagnostics device;
  final SettingsDiagnostics settings;
  final FileDiagnostics file;
  final SelectionDiagnostics selection;
  final CapabilityDiagnostics capabilities;
  final List<AttemptDiagnostics> attempts;
  final int droppedAttempts;
  final List<TrackDiagnostics> tracks;
  final List<DecoderDiagnostics> decoders;
  final Map<DiagnosticsNote, int> notes;

  AttemptDiagnostics? get latest => attempts.lastOrNull;

  /// Whether the latest attempt failed with nothing after it.
  bool get failed => latest?.outcome == AttemptOutcome.failed;

  PlaybackReport copyWith({
    DeviceDiagnostics? device,
    SettingsDiagnostics? settings,
    FileDiagnostics? file,
    SelectionDiagnostics? selection,
    CapabilityDiagnostics? capabilities,
    List<AttemptDiagnostics>? attempts,
    int? droppedAttempts,
    List<TrackDiagnostics>? tracks,
    List<DecoderDiagnostics>? decoders,
    Map<DiagnosticsNote, int>? notes,
  }) => PlaybackReport(
    device: device ?? this.device,
    settings: settings ?? this.settings,
    file: file ?? this.file,
    selection: selection ?? this.selection,
    capabilities: capabilities ?? this.capabilities,
    attempts: attempts ?? this.attempts,
    droppedAttempts: droppedAttempts ?? this.droppedAttempts,
    tracks: tracks ?? this.tracks,
    decoders: decoders ?? this.decoders,
    notes: notes ?? this.notes,
  );
}

/// Builds the report of one sitting with a file and hands each change to
/// [publish], which [playbackReportProvider] keeps.
class DiagnosticsRecorder {
  DiagnosticsRecorder(PlaybackReport initial, this._publish)
    : _report = initial {
    _publish(_report);
  }

  final void Function(PlaybackReport) _publish;
  PlaybackReport _report;
  int _nextNumber = 1;

  PlaybackReport get report => _report;

  void _update(PlaybackReport Function(PlaybackReport) change) {
    _report = change(_report);
    _publish(_report);
  }

  void _updateLatest(AttemptDiagnostics Function(AttemptDiagnostics) change) =>
      _update((r) {
        final last = r.attempts.lastOrNull;
        if (last == null) return r;
        return r.copyWith(
          attempts: [...r.attempts.take(r.attempts.length - 1), change(last)],
        );
      });

  /// [plan] loads now, for [reason]; one still loading before it was left
  /// for this one.
  void attempt(PlaybackStart plan, AttemptReason reason, {double? at}) =>
      _update((r) {
        final previous = [
          for (final a in r.attempts)
            a.outcome == AttemptOutcome.loading
                ? a.copyWith(outcome: AttemptOutcome.replaced)
                : a,
        ];
        final next = AttemptDiagnostics(
          number: _nextNumber++,
          mode: switch (plan.method) {
            PlaybackMethod.direct => SourceMode.direct,
            PlaybackMethod.transcode when plan.hls => SourceMode.hls,
            PlaybackMethod.transcode => SourceMode.encode,
            _ => SourceMode.stream,
          },
          reason: reason,
          startAt: max(0, at ?? plan.offset + plan.start).floor(),
          audioIndex: plan.audio?.index,
          quality: safeQuality(plan.quality),
          burnIn: plan.subtitleMode == PlaybackSubtitleMode.burnIn,
          why: [
            for (final why in plan.reasons.take(PlaybackReason.all.length))
              ?Safe.known(why, _knownReasons),
          ],
          videoTo: safeVideoCodec(plan.convertedVideo),
          audioTo: safeAudioCodec(plan.convertedAudio),
        );
        final all = [...previous, next];
        final dropped = max(0, all.length - maxAttempts);
        return r.copyWith(
          attempts: all.sublist(dropped),
          droppedAttempts: r.droppedAttempts + dropped,
          tracks: const [],
          file: FileDiagnostics.of(plan.item),
          selection: SelectionDiagnostics.of(plan),
        );
      });

  /// A download loads from the device for [reason], at [at] seconds,
  /// without a server's answer.
  void attemptLocal(
    AttemptReason reason, {
    required double at,
    int? audioIndex,
  }) => _update((r) {
    final previous = [
      for (final a in r.attempts)
        a.outcome == AttemptOutcome.loading
            ? a.copyWith(outcome: AttemptOutcome.replaced)
            : a,
    ];
    final all = [
      ...previous,
      AttemptDiagnostics(
        number: _nextNumber++,
        mode: SourceMode.local,
        reason: reason,
        startAt: max(0, at).floor(),
        audioIndex: audioIndex,
      ),
    ];
    final dropped = max(0, all.length - maxAttempts);
    return r.copyWith(
      attempts: all.sublist(dropped),
      droppedAttempts: r.droppedAttempts + dropped,
      tracks: const [],
    );
  });

  /// The latest source started playing.
  void playing() => _updateLatest(
    (a) => a.outcome == AttemptOutcome.loading
        ? a.copyWith(outcome: AttemptOutcome.playing)
        : a,
  );

  /// The latest source failed.
  void failed(ErrorDiagnostics error) => _updateLatest(
    (a) => a.copyWith(outcome: AttemptOutcome.failed, error: error),
  );

  /// The player closed; a source still loading never played.
  void closed() => _updateLatest(
    (a) => a.outcome == AttemptOutcome.loading
        ? a.copyWith(outcome: AttemptOutcome.closed)
        : a,
  );

  /// What [plan] picked, when a pick changes without a new source.
  void select(PlaybackStart plan) =>
      _update((r) => r.copyWith(selection: SelectionDiagnostics.of(plan)));

  /// What a download picked.
  void selected(SelectionDiagnostics selection) =>
      _update((r) => r.copyWith(selection: selection));

  void device(DeviceDiagnostics device) =>
      _update((r) => r.copyWith(device: device));

  void capabilities(CapabilityDiagnostics capabilities) =>
      _update((r) => r.copyWith(capabilities: capabilities));

  void tracks(List<TrackDiagnostics> tracks) =>
      _update((r) => r.copyWith(tracks: tracks.take(maxTracks).toList()));

  /// A decoder started: each one once, the latest [maxDecoders].
  void decoder(DecoderDiagnostics decoder) => _update((r) {
    final all = [...r.decoders.where((d) => d != decoder), decoder];
    return r.copyWith(decoders: all.sublist(max(0, all.length - maxDecoders)));
  });

  void note(DiagnosticsNote note) => _update(
    (r) => r.copyWith(notes: {...r.notes, note: (r.notes[note] ?? 0) + 1}),
  );

  /// What the engine said as it played: tracks, a decoder, or the error
  /// that the next failure is.
  void engine(wire.DiagnosticsMessage message) {
    if (message.tracks case final tracks?) {
      this.tracks(tracks.map(TrackDiagnostics.of).toList());
    }
    if ((message.decoderKind, message.decoder) case (
      final kind?,
      final name?,
    )) {
      decoder(DecoderDiagnostics(_kind(kind), Safe.token(name, 64)));
    }
  }
}

/// The latest playback's report, kept in memory for Settings.
final playbackReportProvider =
    NotifierProvider<PlaybackReportStore, PlaybackReport?>(
      PlaybackReportStore.new,
    );

class PlaybackReportStore extends Notifier<PlaybackReport?> {
  @override
  PlaybackReport? build() => null;

  /// The player's last change can come as the app goes away with it.
  void publish(PlaybackReport report) {
    if (ref.mounted) state = report;
  }

  void clear() => state = null;
}

/// The app and the device for the report, or null where the platform
/// can't say.
final deviceDiagnosticsProvider =
    FutureProvider<wire.DeviceDiagnosticsMessage?>((ref) async {
      try {
        return await wire.PlayerApi().deviceDiagnostics();
      } on Exception {
        return null;
      }
    }, retry: (count, error) => null);

/// The report as text to paste in an issue or send to whoever runs the
/// server. Its keys stay in English, so anyone can read every report.
String formatReport(PlaybackReport report) {
  final out = StringBuffer();
  void line(String text) => out.writeln(text);
  String yesNo(bool value) => value ? 'yes' : 'no';
  String list(List<Safe> values) => values.isEmpty ? 'none' : values.join(',');
  String opt(Object? value) => value?.toString() ?? 'unknown';

  line('Matinee playback report v1');
  line(
    'privacy: codes and formats only; no titles, file names, addresses, '
    'accounts, or tokens',
  );

  final d = report.device;
  line('app: ${opt(d.appVersion)} (${d.appBuild}, ${opt(d.buildType)})');
  line(
    'android: ${opt(d.androidRelease)} (api ${d.sdk}), ${opt(d.abi)}'
    '${d.tv ? ', tv' : ''}',
  );
  line('device: ${opt(d.manufacturer)} ${opt(d.model)}');
  line('media3: ${opt(d.media3)}, ffmpeg audio: ${yesNo(d.ffmpeg)}');

  final s = report.settings;
  line('engine: ${s.engine}, decoders: ${s.decoders}');
  line(
    'settings: quality=${opt(s.quality)} video_codec=${opt(s.videoCodec)} '
    'audio_codec=${opt(s.audioCodec)} convert_audio=${list(s.convertAudio)}',
  );

  final f = report.file;
  if (!f.probed) {
    line('file: container=${opt(f.container)}, not probed');
  } else {
    final size = f.width != null && f.height != null
        ? ' ${f.width}x${f.height}'
        : '';
    final depth = f.bitDepth != null ? ' ${f.bitDepth}bit' : '';
    final dv = f.dolbyVisionProfile != null
        ? ' dv_profile=${f.dolbyVisionProfile}'
        : '';
    final profile = f.videoProfile != null ? ' (${f.videoProfile})' : '';
    line(
      'file: container=${opt(f.container)} video=${f.videoCodec ?? 'none'}'
      '$profile$size$depth hdr=${f.hdr ?? 'none'}$dv',
    );
    line(
      'file tracks: audio=${list(f.audioCodecs)} subtitles=${f.subtitleCount}',
    );
  }

  final sel = report.selection;
  final channels = sel.audioChannels != null ? ' ${sel.audioChannels}ch' : '';
  line(
    'audio picked: ${sel.audioIndex != null ? '#${sel.audioIndex} ${opt(sel.audioCodec)}$channels' : 'default'}',
  );
  final rendering = sel.subtitleRendering;
  line(
    'subtitle picked: ${rendering == null ? 'off' : '${opt(sel.subtitleFormat)} ${opt(sel.subtitleSource)} delivery=${opt(sel.subtitleDelivery)} drawn_by=${Safe.of(rendering)}'}',
  );

  final c = report.capabilities;
  line(
    'device plays: video=${list(c.videoCodecs)} audio=${list(c.audioCodecs)} '
    'embedded_subtitles=${list(c.embeddedSubtitles)}',
  );
  line(
    'asks for: stream_audio=${list(c.streamAudioCodecs)} '
    'encode_video=${list(c.encodeVideoCodecs)}',
  );
  final bitrate = c.maxBitrate != null
      ? ' max_bitrate=${c.maxBitrate! ~/ 1000}kbps'
      : '';
  line(
    'server offers: video=${list(c.serverVideoCodecs)} '
    'audio=${list(c.serverAudioCodecs)}$bitrate',
  );

  line(
    'attempts:${report.droppedAttempts > 0 ? ' (${report.droppedAttempts} earlier left out)' : ''}',
  );
  if (report.attempts.isEmpty) line('  none');
  for (final a in report.attempts) {
    final parts = [
      '${a.number}. ${Safe.of(a.mode)}',
      'reason=${Safe.of(a.reason)}',
      'at=${a.startAt}s',
      if (a.audioIndex != null) 'audio=#${a.audioIndex}',
      if (a.mode == SourceMode.hls || a.mode == SourceMode.encode)
        'quality=${opt(a.quality)}',
      if (a.burnIn) 'burn_in=yes',
      if (a.why.isNotEmpty) 'why=${list(a.why)}',
      if (a.videoTo != null) 'video_to=${a.videoTo}',
      if (a.audioTo != null) 'audio_to=${a.audioTo}',
      '-> ${Safe.of(a.outcome)}',
    ];
    line('  ${parts.join(' ')}');
    if (a.error case final error?) line('     error: ${_formatError(error)}');
  }

  line('tracks:');
  if (report.tracks.isEmpty) line('  none reported');
  for (final t in report.tracks) {
    line('  ${_formatTrack(t)}');
  }

  if (report.decoders.isNotEmpty) {
    line(
      'decoders: ${report.decoders.map((d) => '${Safe.of(d.type)}=${opt(d.name)}').join(', ')}',
    );
  }
  if (report.notes.isNotEmpty) {
    line(
      'notes: ${report.notes.entries.map((e) => '${Safe.of(e.key)} x${e.value}').join(', ')}',
    );
  }
  return out.toString();
}

String _formatTrack(TrackDiagnostics t, {bool selection = true}) {
  final width = t.width;
  final height = t.height;
  return [
    Safe.of(t.type).text,
    if (selection) t.selected ? 'selected' : 'not_selected',
    if (t.mime case final mime?) mime.text,
    if (t.codecs case final codecs?) 'codecs=$codecs',
    if (width != null && height != null && width > 0 && height > 0)
      '${width}x$height',
    if (t.channels case final channels? when channels > 0) '${channels}ch',
    if (t.sampleRate case final rate? when rate > 0) '${rate}Hz',
    if (t.bitrate case final bitrate? when bitrate > 0)
      '${bitrate ~/ 1000}kbps',
    if (t.support case final support?) 'support=$support',
  ].join(' ');
}

String _formatError(ErrorDiagnostics e) => [
  '${e.name ?? 'unknown'} (${e.code})',
  if (e.type case final type?) 'type=$type',
  if (e.httpStatus case final status?) 'http=$status',
  if (e.renderer case final renderer?) 'renderer=$renderer',
  if (e.decoder case final decoder?) 'decoder=$decoder',
  if (e.secureDecoder == true) 'secure_decoder=yes',
  if (e.formatSupport case final support?) 'format_support=$support',
  if (e.format case final format?)
    'format=[${_formatTrack(format, selection: false)}]',
  if (e.causes.isNotEmpty) 'causes=${e.causes.join('>')}',
].join(' ');
