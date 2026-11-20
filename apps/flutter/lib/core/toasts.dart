import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../kit/toast.dart';

/// The app's one queue of toasts, shown over every screen by the host in
/// `app.dart`: what a tap started that failed after its sheet or page had
/// gone, as the Kotlin app's snackbar.
final toastProvider = Provider<ToastState>((ref) {
  final state = ToastState();
  ref.onDispose(state.dispose);
  return state;
});
