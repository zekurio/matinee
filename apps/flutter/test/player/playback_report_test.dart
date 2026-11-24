import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/platform/player.g.dart' as wire;
import 'package:matinee/player/playback_report.dart';
import 'package:matinee/player/player_preferences.dart';
import 'package:matinee/player/player_state.dart';

import 'playback_fakes.dart';

PlaybackReport _empty() => PlaybackReport(
  settings: SettingsDiagnostics.of(PlayerEngine.mpv, const PlayerPrefs()),
);

void main() {
  test('Safe keeps short codes and known values, nothing else', () {
    expect(
      Safe.token('c2.android.avc.decoder')?.text,
      'c2.android.avc.decoder',
    );
    expect(Safe.token('Main 10')?.text, 'Main 10');
    expect(Safe.token('  '), isNull);
    expect(Safe.token(null), isNull);
    for (final text in [
      'https://media.example/video',
      '/storage/emulated/0/Movies/a.mkv',
      'Could not open: file not found',
      'x' * 49,
    ]) {
      expect(Safe.token(text), Safe.other, reason: text);
    }
    expect(Safe.known('HEVC', knownVideoCodecs)?.text, 'hevc');
    expect(Safe.known('my-codec', knownVideoCodecs), Safe.other);
    expect(Safe.mime('video/avc')?.text, 'video/avc');
    expect(Safe.mime('video/../../etc'), Safe.other);
    expect(Safe.mime('secret/avc'), Safe.other);
    expect(safeAudioCodec('pcm_s16le')?.text, 'pcm_s16le');
    expect(Safe.of(AttemptReason.audioChange).text, 'audio_change');
  });

  test('the recorder keeps the latest attempts and each decoder once', () {
    final published = <PlaybackReport>[];
    final recorder = DiagnosticsRecorder(_empty(), published.add);
    expect(published, hasLength(1));
    for (var i = 0; i < maxAttempts + 3; i++) {
      recorder.attempt(plan(start: i.toDouble()), AttemptReason.retry);
    }
    final report = recorder.report;
    expect(report.attempts, hasLength(maxAttempts));
    expect(report.droppedAttempts, 3);
    expect(report.attempts.first.number, 4);
    // Each was left for the next while still loading.
    expect(
      report.attempts.take(maxAttempts - 1).map((a) => a.outcome).toSet(),
      {AttemptOutcome.replaced},
    );
    expect(report.latest?.outcome, AttemptOutcome.loading);
    recorder.closed();
    expect(recorder.report.latest?.outcome, AttemptOutcome.closed);

    for (final name in ['a', 'b', 'a', 'c', 'd', 'e']) {
      recorder.engine(
        wire.DiagnosticsMessage(
          decoderKind: wire.TrackKindMessage.audio,
          decoder: name,
        ),
      );
    }
    expect(recorder.report.decoders.map((d) => d.name?.text), [
      'a',
      'c',
      'd',
      'e',
    ]);
    recorder
      ..note(DiagnosticsNote.seekFailed)
      ..note(DiagnosticsNote.seekFailed);
    expect(recorder.report.notes, {DiagnosticsNote.seekFailed: 2});
    expect(published.last, same(recorder.report));
  });
}
