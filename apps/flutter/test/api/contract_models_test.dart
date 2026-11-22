import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/api/matinee_api.dart';

void main() {
  test('tagged unions decode their payload and write the original tag', () {
    const json = {
      'status': 'ready',
      'images': {
        'key': 'frames-v1',
        'width': 160,
        'height': 90,
        'columns': 5,
        'rows': 5,
        'count': 100,
        'intervalSeconds': 10,
      },
    };

    final status = TrickplayStatus.fromJson(json);
    expect(status, isA<TrickplayStatusReady>());
    expect(
      (status as TrickplayStatusReady).images.intervalSeconds,
      isA<double>(),
    );
    expect(status.toJson(), json);
    expect(
      () => TrickplayStatus.fromJson({'status': 'unexpected'}),
      throwsFormatException,
    );
  });

  test('Explicit distinguishes an omitted field, null, and a value', () {
    const omitted = <String, Object?>{};
    const cleared = {'season': null};
    const set = {'season': 2};

    expect(TitlesItemsInput.fromJson(omitted).season, isNull);
    expect(TitlesItemsInput.fromJson(cleared).season, isA<Explicit<int>>());
    expect(TitlesItemsInput.fromJson(cleared).season!.value, isNull);
    expect(TitlesItemsInput.fromJson(set).season!.value, 2);

    expect(const TitlesItemsInput().toJson(), omitted);
    expect(const TitlesItemsInput(season: Explicit(null)).toJson(), cleared);
    expect(const TitlesItemsInput(season: Explicit(2)).toJson(), set);
  });

  test('a string enum survives a new value from a newer server', () {
    const json = {'platform': 'future-console', 'name': 'Living room'};

    final device = AppDevice.fromJson(json);

    expect(DevicePlatform.all, isNot(contains(device.platform)));
    expect(device.platform, 'future-console');
    expect(device.toJson(), json);
  });

  // Explore reads the Requests row from this field, and an older server
  // that sends none must still show Discover, with no row.
  test("an older server's Discover reads without a Requests row", () {
    final rails = DiscoverRails.fromJson({
      'enabled': true,
      'rails': <Object>[],
      'browse': ['movie'],
    });
    expect(rails.requests, isNull);
  });
}
