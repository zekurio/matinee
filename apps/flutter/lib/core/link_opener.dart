import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'session.dart';

/// Opens [url] in the system browser, for the person to read or act on
/// there. Nothing comes back from it.
typedef LinkOpener = Future<void> Function(Uri url);

/// A Custom Tab in the browser, over the same bridge as the browser sign-in.
/// Its callback scheme never comes back, so the tab ends only when the
/// person closes it, which is when this completes. Where a browser can't
/// open, nothing happens.
final linkOpenerProvider = Provider<LinkOpener>((ref) {
  final web = ref.watch(webAuthenticatorProvider);
  return (url) async {
    try {
      await web.authenticate(url);
    } on Object {
      // A link that can't open is no worse than one never tapped.
    }
  };
});
