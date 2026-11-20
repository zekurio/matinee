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
