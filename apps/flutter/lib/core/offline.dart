import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Whether this device holds downloads of the signed-in account, which the
/// unreachable screen offers to watch without the server. The Flutter app
/// has no downloads yet, so this says none until the downloads store
/// exists; the unreachable screen already reads it.
final hasDownloadsProvider = Provider<bool>((ref) => false);
