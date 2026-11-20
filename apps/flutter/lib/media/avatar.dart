import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/session.dart';
import '../kit/kit.dart';

/// An account's picture in a circle [size] across, as the Kotlin app's
/// `Avatar`: the server's picture when the account has one, else, and
/// while no server is in use or the picture can't load, [fallback], or the
/// name's first letter on the secondary fill.
class Avatar extends ConsumerWidget {
  const Avatar({
    super.key,
    required this.avatarId,
    required this.name,
    this.size = 40,
    this.fallback,
  });

  final String? avatarId;
  final String name;
  final double size;
  final Widget? fallback;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final api = ref.watch(apiProvider);
    final id = avatarId;
    final placeholder = fallback ?? _Initial(name: name, size: size);
    return SizedBox.square(
      dimension: size,
      child: id == null || api == null
          ? placeholder
          : ClipOval(
              child: Image.network(
                api.paths.avatar(id).toString(),
                headers: ref.watch(playerHeadersProvider),
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
          child: Center(
            child: Text(
              letter,
              style: TextStyle(
                fontFamily: KitText.family,
                fontSize: size * .4,
                height: 1,
                fontWeight: FontWeight.w600,
                fontVariations: const [FontVariation('wght', 600)],
                color: colors.mutedForeground,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
