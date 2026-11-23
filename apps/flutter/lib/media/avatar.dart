import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/session.dart';
import '../kit/kit.dart';

/// An account's picture in a circle [size] across: the server's picture when
/// the account has one, else, and while no server is in use or the picture
/// can't load, [fallback], or the name's first letter on the secondary fill.
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

/// How far below the middle of a one-high line box a capital's middle has to
/// move to sit in the middle of it, in ems. Red Hat Text rises 1018 and drops
/// 305 per 1000, so a line box one em high puts the baseline 1018 / 1323 down
/// and a 700 high capital's middle .08 above the box's.
const _capDrop = .5 - (1018 / 1323 - .35);

class _Initial extends StatelessWidget {
  const _Initial({required this.name, required this.size});

  final String name;
  final double size;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    final letter = name.isEmpty ? '?' : name.characters.first.toUpperCase();
    final fontSize = size * .4;
    return Semantics(
      label: name,
      child: ExcludeSemantics(
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: colors.secondary,
            shape: BoxShape.circle,
          ),
          child: Center(
            child: Transform.translate(
              offset: Offset(0, fontSize * _capDrop),
              child: Text(
                letter,
                style: TextStyle(
                  fontFamily: KitText.family,
                  fontSize: fontSize,
                  height: 1,
                  fontWeight: FontWeight.w600,
                  fontVariations: const [FontVariation('wght', 600)],
                  color: colors.mutedForeground,
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
