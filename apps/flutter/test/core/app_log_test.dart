import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/core/app_log.dart';

/// The Kotlin app's `AppLogTest`, with the same lines and answers.
void main() {
  final known = KnownValues.of('https://media.example.org:8443/matinee', [
    'jdoe',
    'Jane Doe',
    null,
  ]);
  String scrub(String message) => scrubLogMessage(message, known);

  test('takes out the server and the account', () {
    expect(
      scrub('connecting to MEDIA.example.org as Jane Doe (jdoe)'),
      'connecting to <server> as <account> (<account>)',
    );
  });

  test('takes out addresses', () {
    expect(
      scrub('GET https://other.host/api/v1/titles/abc?token=x failed'),
      'GET <url> failed',
    );
    expect(
      scrub('Failed to connect to nas.lan/192.168.1.20:8443'),
      'Failed to connect to <host>/<ip>',
    );
    expect(scrub('peer fe80::1c2b:3aff:fe4d closed'), 'peer <ip> closed');
    expect(scrub('mail jane@mail.example.de'), 'mail <email>');
    expect(scrub('reached jellyfin.duckdns.org'), 'reached <host>');
  });

  test('takes out paths, files, and quotes', () {
    expect(
      scrub('[file] Cannot open /storage/emulated/0/Movies/heist.mkv'),
      '[file] Cannot open <path>',
    );
    expect(scrub('opening Secret.Heist.2024.mkv now'), 'opening <file> now');
    expect(
      scrub('Unable to resolve host "media.example.net": No address'),
      'Unable to resolve host "…": No address',
    );
    expect(scrub("title 'Secret Heist' missing"), "title '…' missing");
    expect(
      scrub(
        'Unexpected JSON token at offset 4: JSON input: {"title":"Secret"}',
      ),
      'Unexpected JSON token at offset 4: JSON input: <removed>',
    );
  });

  test('takes out tokens and ids', () {
    expect(
      scrub('Authorization: Bearer abc.def.ghi'),
      'Authorization: Bearer <token>',
    );
    expect(
      scrub('item 0b8c7a3e-1f2d-4c5b-9a8e-7d6c5b4a3f2e gone'),
      'item <id> gone',
    );
    expect(scrub('session k3j4h5g6f7d8s9a0q1w2e3r4t5'), 'session <id>');
  });

  test('keeps what helps', () {
    for (final line in [
      'ExoPlaybackException: ERROR_CODE_IO_NETWORK_CONNECTION_FAILED (2001) '
          'video/hevc c2.android.hevc.decoder',
      'at io.github.zekurio.matinee.ui.tv.TvApp.invoke(TvApp.kt:123)',
      "position 01:23:45, The server's answer didn't parse",
      'at androidx.media3.extractor.ts.TsExtractor.read(TsExtractor.java:412)',
      // A Dart frame, which the Kotlin app had none of.
      '#0      SessionStore.open (package:matinee/core/session_store.dart:42:7)',
    ]) {
      expect(scrub(line), line);
    }
  });

  test('reads threadtime lines', () {
    expect(
      formatLogLine(
        '11-12 01:41:46.123  4321  4350 W MpvPlayer: [ffmpeg] '
        'https://media.example.org/x failed',
        known,
      ),
      '11-12 01:41:46.123 W MpvPlayer: [ffmpeg] <url> failed',
    );
    expect(formatLogLine('--------- beginning of main', known), isNull);
  });

  test('keeps the latest lines within bounds', () {
    final lines = [
      for (var i = 1; i <= maxLogLines + 50; i++)
        '11-12 01:41:46.123  1  2 I Tag: line $i',
    ];
    final log = formatLog(lines, known);
    expect(log, startsWith('Matinee app log v1\n'));
    expect(log, endsWith('line ${maxLogLines + 50}\n'));
    expect(log, isNot(contains('line 50\n')));
    expect(log.length, lessThanOrEqualTo(maxLogChars + 200));
  });

  test('an empty log says so', () {
    expect(formatLog(const [], known), endsWith('nothing logged\n'));
  });
}
