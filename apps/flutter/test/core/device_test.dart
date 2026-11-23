import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/api/matinee_api.dart' show DevicePlatform;
import 'package:matinee/core/device.dart';

Device _device(String platform, String model) => Device(
  formFactor: FormFactor.handset,
  name: '',
  model: model,
  osVersion: '',
  appVersion: '',
  platform: platform,
);

void main() {
  // Settings said "Matinee for Android" on an iPhone.
  test('names the system it runs', () {
    expect(_device(DevicePlatform.android, 'Pixel 9').systemName, 'Android');
    expect(_device(DevicePlatform.androidtv, 'SHIELD').systemName, 'Android');
    expect(_device(DevicePlatform.ios, 'iPhone18,3').systemName, 'iOS');
    expect(_device(DevicePlatform.ios, 'iPad16,3').systemName, 'iPadOS');
  });
}
