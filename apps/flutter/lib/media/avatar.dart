import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/session.dart';
import '../kit/kit.dart';

/// An account's picture in a circle [size] across: the picture at [url] when
/// the account has one, else, and while no server is in use or the picture
/// can't load, [fallback], or the name's first letter on the secondary fill.
class Avatar extends ConsumerWidget {
  const Avatar({
    super.key,
    required this.url,
    required this.name,
    this.size = 40,
    this.fallback,
  });

  /// `avatarUrl` from the contract: a path on the server, which loads with
  /// the session, or the sign-in provider's own URL, which loads without.
  final String? url;
  final String name;
  final double size;
  final Widget? fallback;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final api = ref.watch(apiProvider);
    final url = this.url;
    final placeholder = fallback ?? _Initial(name: name, size: size);
    final address = url == null || api == null ? null : api.paths.server(url);
    // Only the server gets the session, never another host.
    final ours = address != null && address.origin == api?.paths.base.origin;
    return SizedBox.square(
      dimension: size,
      child: address == null
          ? placeholder
          : ClipOval(
              child: Image.network(
                address.toString(),
                headers: ours ? ref.watch(playerHeadersProvider) : null,
                fit: BoxFit.cover,
                semanticLabel: name,
                errorBuilder: (context, error, stack) => placeholder,
              ),
            ),
    );
  }
}

class _Initial extends StatelessWidget {
  const _Initial({required this.name, required this.size});

  final String name;
  final double size;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final letter = name.isEmpty ? '?' : name.characters.first.toUpperCase();
    return Semantics(
      label: name,
      child: ExcludeSemantics(
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: colors.secondary,
            shape: BoxShape.circle,
          ),
          // Unbounded, the wordmark's face, cut down to capitals whose
          // middle is the middle of a one-em line box, so the letter
          // centers with no nudging (brand/wordmark.py).
          child: Center(
            child: Text(
              letter,
              style: TextStyle(
                fontFamily: 'Unbounded',
                fontSize: size * .4,
                height: 1,
                fontWeight: FontWeight.w700,
                color: colors.mutedForeground,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
