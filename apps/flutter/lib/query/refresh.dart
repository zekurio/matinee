import 'package:flutter/widgets.dart';
import 'package:go_router/go_router.dart';

/// Tells a screen the person came back to it, to fetch again what may have
/// moved on meanwhile: the app came back to the front from out of sight, or
/// [path] is where the router is again after another page or tab covered it.
/// The screen decides what's old enough to fetch. The notification shade
/// or a system dialog over the app isn't a return: the screen stayed in
/// sight under it.
class ReturnWatcher extends StatefulWidget {
  const ReturnWatcher({
    super.key,
    required this.path,
    required this.onReturn,
    required this.child,
  });

  final String path;
  final VoidCallback onReturn;
  final Widget child;

  @override
  State<ReturnWatcher> createState() => _ReturnWatcherState();
}

class _ReturnWatcherState extends State<ReturnWatcher> {
  late final AppLifecycleListener _lifecycle;
  GoRouter? _router;
  bool _covered = false;

  @override
  void initState() {
    super.initState();
    _lifecycle = AppLifecycleListener(onShow: () => widget.onReturn());
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final router = GoRouter.maybeOf(context);
    if (router == _router) return;
    _router?.routerDelegate.removeListener(_moved);
    _router = router;
    router?.routerDelegate.addListener(_moved);
  }

  void _moved() {
    final router = _router;
    if (router == null) return;
    final here = router.routerDelegate.currentConfiguration.uri.path;
    final covered = here != widget.path;
    if (_covered && !covered) widget.onReturn();
    _covered = covered;
  }

  @override
  void dispose() {
    _router?.routerDelegate.removeListener(_moved);
    _lifecycle.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.child;
}
