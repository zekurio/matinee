import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:matinee/api/matinee_api.dart';

/// The server the downloads talk to: the account's options, and what each
/// path answers as the test sets it.
final class DownloadsBackend {
  DownloadsBackend({bool downloads = true}) {
    options = PlaybackOptions(
      qualities: const [],
      maxBitrate: null,
      downloads: downloads,
      downloadVideoPresets: const [
        DownloadVideoPreset(height: 1080, bitrate: 8000000),
        DownloadVideoPreset(height: 720, bitrate: 4000000),
        DownloadVideoPreset(height: 480, bitrate: 1500000),
      ],
      skipSteps: const [10],
      videoCodecs: const ['h264', 'hevc', 'av1'],
      audioCodecs: const ['aac'],
      audioLanguages: const [],
      subtitleLanguages: const [],
    );
  }

  late PlaybackOptions options;

  /// Answers by path; a function gets the request.
  final answers = <String, Object Function(http.Request request)>{};

  /// Every request, as `METHOD /path`.
  final sent = <String>[];

  late final http.Client client = MockClient((request) async {
    final path = request.url.path;
    sent.add('${request.method} $path');
    if (path == '/api/v1/playback/options') return _json(options.toJson());
    final answer = answers[path];
    if (answer == null) return http.Response('', 404);
    return switch (answer(request)) {
      final http.Response response => response,
      final body => _json(body),
    };
  });

  static http.Response _json(Object body) => http.Response(
    jsonEncode(body),
    200,
    headers: {'Content-Type': 'application/json'},
  );
}

AudioTrack audioTrack(
  int index, {
  String label = 'English',
  String? language = 'en',
  bool primary = false,
}) => AudioTrack(
  index: index,
  label: label,
  language: language,
  title: null,
  codec: 'eac3',
  format: 'E-AC-3',
  channels: 6,
  layout: '5.1',
  primary: primary,
);

SubtitleTrack subtitleTrack(String id, {String label = 'English'}) =>
    SubtitleTrack(
      id: id,
      label: label,
      language: 'en',
      title: null,
      forced: false,
      sdh: false,
      defaultValue: false,
      source: SubtitleSource.embedded,
      format: 'SRT',
      delivery: SubtitleDelivery.webvtt,
    );

/// What `downloads.resolve` says of [id] for [wishes]: a version at the
/// preset's height, or 1080p of the file's own, about a megabyte a line;
/// [unavailableAt] heights it can't make.
DownloadResolution resolution(
  String id,
  DownloadWishes wishes, {
  Set<int> unavailableAt = const {},
  bool keepsVideo = true,
}) {
  final height = wishes.preset?.height;
  if (height != null && unavailableAt.contains(height)) {
    return DownloadResolutionUnavailable(
      id: id,
      message: "Can't make ${height}p",
    );
  }
  final audio = wishes.audioIndices ?? [1];
  final codec = wishes.codec ?? 'h264';
  final encode = height != null || !keepsVideo;
  return DownloadResolutionReady(
    id: id,
    originalPlays: false,
    spec: DownloadSpec(
      container: 'mp4',
      video: encode
          ? DownloadVideoEncode(
              codec: codec,
              maxHeight: height ?? 1080,
              bitrate: 4000000,
            )
          : const DownloadVideoCopy(),
      audio: [for (final index in audio) DownloadAudioCopy(index: index)],
      subtitles: const ['stream-3'],
    ),
    plan: DownloadPlan(
      container: 'mp4',
      durationSeconds: 3600,
      estimatedBytes: (height ?? 1080) * 1000000 + audio.length * 100000000,
      segmentSeconds: 6,
      video: DownloadPlanVideo(
        mode: encode ? 'encode' : 'copy',
        codec: encode ? codec : 'hevc',
        width: 1920,
        height: height ?? 1080,
        bitrate: 4000000,
        hdr: null,
        toneMapped: false,
        hardware: false,
      ),
      audio: [
        for (final index in audio)
          DownloadPlanAudio(
            index: index,
            label: index == 1 ? 'English' : 'Deutsch',
            language: index == 1 ? 'en' : 'de',
            mode: 'copy',
            codec: 'eac3',
            channels: 6,
            bitrate: null,
          ),
      ],
      burnIn: null,
    ),
    choices: DownloadChoices(
      keepsVideo: keepsVideo,
      presets: const [
        DownloadVideoPreset(height: 1080, bitrate: 8000000),
        DownloadVideoPreset(height: 720, bitrate: 4000000),
        DownloadVideoPreset(height: 480, bitrate: 1500000),
      ],
      codecs: const ['h264', 'hevc'],
      hdrCodecs: const [],
      audio: [
        DownloadChoicesAudio(
          track: audioTrack(1, primary: true),
          keep: true,
          conversions: const [],
        ),
        DownloadChoicesAudio(
          track: audioTrack(2, label: 'Deutsch', language: 'de'),
          keep: true,
          conversions: const [],
        ),
      ],
      subtitles: [
        subtitleTrack('stream-3'),
        subtitleTrack('stream-4', label: 'Deutsch'),
      ],
      burnIn: const [],
    ),
  );
}

/// Answers `downloads.resolve` with [resolution] for every id asked.
Object Function(http.Request) resolver({
  Set<int> unavailableAt = const {},
  List<DownloadWishes>? asked,
}) => (request) {
  final input = DownloadResolveInput.fromJson(jsonDecode(request.body));
  asked?.add(input.wishes);
  return [
    for (final id in input.ids)
      resolution(id, input.wishes, unavailableAt: unavailableAt).toJson(),
  ];
};
