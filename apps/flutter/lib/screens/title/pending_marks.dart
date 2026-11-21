import 'package:flutter_riverpod/flutter_riverpod.dart';

/// What a page shows ahead of the server's answer to a tap on its tick or
/// heart, by what was marked. Each is kept only while the page still shows
/// the [Object] it was marked on: once the change lands, the page fetches
/// again, and the new answer is the truth.
mixin PendingMarks<T extends ConsumerStatefulWidget> on ConsumerState<T> {
  final _marks = <String, (Object, bool)>{};

  /// [server]'s value, or the one marked on [basis] that's on its way.
  bool marked(String key, Object? basis, bool server) {
    final mark = _marks[key];
    return mark != null && identical(mark.$1, basis) ? mark.$2 : server;
  }

  /// What `toggleWatched` and `toggleFavorite` call with the value to show,
  /// and with null when the server refused it.
  void Function(bool? pending) pendingFor(String key, Object basis) => (value) {
    if (!mounted) return;
    setState(() {
      if (value == null) {
        _marks.remove(key);
      } else {
        _marks[key] = (basis, value);
      }
    });
  };
}
