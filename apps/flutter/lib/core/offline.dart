import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../downloads/downloads.dart';

/// Whether this device holds downloads of the server in use, which the
/// unreachable screen offers to watch without the server: any of them, finished
/// or still coming.
final hasDownloadsProvider = Provider<bool>(
  (ref) => ref.watch(shownDownloadsProvider).isNotEmpty,
);
