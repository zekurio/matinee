import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app.dart';
import 'core/device.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final device = await Device.load();
  runApp(
    ProviderScope(
      overrides: [deviceProvider.overrideWithValue(device)],
      child: const MatineeApp(),
    ),
  );
}
