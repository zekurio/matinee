import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/screens/settings/admin/transcoding_page.dart';

/// What the server says each acceleration can decode, in its order.
const _support = [
  HardwareDecodeSupport(acceleration: 'vaapi', codecs: ['h264', 'hevc', 'av1']),
  HardwareDecodeSupport(
    acceleration: 'nvenc',
    codecs: ['h264', 'hevc', 'mpeg2video', 'av1'],
  ),
  // AV1 needs an Apple GPU that decodes it, which detection can't tell.
  HardwareDecodeSupport(acceleration: 'videotoolbox', codecs: ['h264', 'hevc']),
];

void main() {
  test('the decoding switches follow the acceleration picked', () {
    expect(decodableCodecs(_support, 'vaapi'), ['h264', 'hevc', 'av1']);
    // A pick not saved yet gets its own codecs, not the saved pick's.
    expect(decodableCodecs(_support, 'nvenc'), [
      'h264',
      'hevc',
      'mpeg2video',
      'av1',
    ]);
    expect(decodableCodecs(_support, 'videotoolbox'), ['h264', 'hevc']);
  });

  test('an acceleration the server lists no codecs for shows none', () {
    expect(decodableCodecs(_support, 'none'), isEmpty);
    expect(decodableCodecs(_support, 'qsv'), isEmpty);
    expect(decodableCodecs(const [], 'vaapi'), isEmpty);
  });
}
