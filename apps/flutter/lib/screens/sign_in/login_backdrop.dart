import 'dart:async';
import 'dart:math' as math;
import 'dart:ui' show ImageFilter;

import 'package:flutter/foundation.dart' show ValueListenable;
import 'package:flutter/scheduler.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/matinee_api.dart';
import '../../core/session.dart';
import '../../kit/kit.dart';

/* The wall of artwork behind the sign-in screens, as the web's login page
   has it (apps/web/src/components/login-backdrop.tsx): rows of posters and
   thumbs that drift in turns left and right, the wall sloped, blurred, and
   faded into the background. Each row is its own shuffle of the tiles, so a
   mixed wall falls differently in every row. The server serves these images
   without a session while the backdrop is on. */

const _slope = -12 * math.pi / 180;

/// How much larger than the screen the wall is, so its edges stay off it
/// once sloped.
const _oversize = 1.7;

/// Seconds a row takes to drift one copy's width, per row.
const _durations = [96, 120, 104, 132, 100, 124, 112, 140, 108, 128];

/// How wide one copy of a row is at least, in row heights, so it loops
/// cleanly.
const _minRowWidth = 30.0;

/// Dark text loses contrast against artwork faster, so a light theme shows
/// the wall weaker.
const _lightStrength = .35;

const _gap = 12.0;

double _aspectOf(LoginBackdropTile tile) =>
    tile.kind == LoginBackdropKind.poster ? 2 / 3 : 16 / 9;

/// One copy of each row: its own shuffle, repeated until it's wide enough.
List<List<LoginBackdropTile>> _buildRows(
  List<LoginBackdropTile> tiles,
  int count,
) => [
  for (var row = 0; row < count; row++)
    () {
      final order = [...tiles]..shuffle(math.Random(row + 1));
      final copy = <LoginBackdropTile>[];
      var width = 0.0;
      for (var i = 0; width < _minRowWidth && order.isNotEmpty; i++) {
        final tile = order[i % order.length];
        copy.add(tile);
        width += _aspectOf(tile);
      }
      return copy;
    }(),
];

/// The backdrop [settings] describe, from the server being signed in to,
/// filling the screen behind what follows it. Nothing while it's off, or
/// when the server has nothing to show or can't be asked.
class LoginBackdropWall extends ConsumerStatefulWidget {
  const LoginBackdropWall({super.key, required this.settings});

  final LoginBackdrop settings;

  @override
  ConsumerState<LoginBackdropWall> createState() => _LoginBackdropWallState();
}

class _LoginBackdropWallState extends ConsumerState<LoginBackdropWall>
    with SingleTickerProviderStateMixin {
  MatineeApi? _api;
  List<LoginBackdropTile> _tiles = const [];
  late final Ticker _ticker;
  final _seconds = ValueNotifier<double>(0);

  @override
  void initState() {
    super.initState();
    _ticker = createTicker(
      (elapsed) => _seconds.value = elapsed.inMicroseconds / 1e6,
    );
    if (widget.settings.enabled) unawaited(_load());
  }

  Future<void> _load() async {
    // A server being added, before it's saved, or the one in use.
    final api = ref.read(sessionProvider.notifier).signInApi();
    _api = api;
    try {
      final loaded = (await api.auth.loginBackdrop()).tiles;
      if (!mounted) return;
      setState(() => _tiles = loaded);
      _syncDrift();
    } on Object {
      // An older server, or one that went away: the plain background.
    }
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _syncDrift();
  }

  /// Drifts while there's a wall to move. Animations off in the system
  /// settings stop it, as reduced motion does on the web.
  void _syncDrift() {
    final still = MediaQuery.disableAnimationsOf(context);
    if (still || _tiles.isEmpty) {
      _ticker.stop();
    } else if (!_ticker.isActive) {
      unawaited(_ticker.start());
    }
  }

  @override
  void dispose() {
    _ticker.dispose();
    _seconds.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final api = _api;
    final settings = widget.settings;
    if (!settings.enabled || api == null || _tiles.isEmpty) {
      return const SizedBox.shrink();
    }
    final colors = MatineeTheme.of(context);
    final strength =
        (1 - settings.fade / 100) * (colors.isDark ? 1.0 : _lightStrength);
    return ExcludeSemantics(
      child: ClipRect(
        child: ColoredBox(
          color: colors.background,
          child: LayoutBuilder(
            builder: (context, box) {
              final rowHeight = (box.maxHeight * .16).clamp(88.0, 200.0);
              final count =
                  (box.maxHeight * _oversize / (rowHeight + _gap)).ceil() + 1;
              final rows = _buildRows(_tiles, count);
              final wallHeight = count * (rowHeight + _gap) - _gap;
              Widget wall = OverflowBox(
                minWidth: box.maxWidth * _oversize,
                maxWidth: box.maxWidth * _oversize,
                minHeight: wallHeight,
                maxHeight: wallHeight,
                child: Transform.rotate(
                  angle: _slope,
                  child: Opacity(
                    opacity: strength.clamp(0, 1),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      spacing: _gap,
                      children: [
                        for (final (index, row) in rows.indexed)
                          _WallRow(
                            api: api,
                            tiles: row,
                            height: rowHeight,
                            seconds: _durations[index % _durations.length],
                            reverse: index.isOdd,
                            drift: _seconds,
                          ),
                      ],
                    ),
                  ),
                ),
              );
              if (settings.blur > 0) {
                wall = ImageFiltered(
                  imageFilter: ImageFilter.blur(
                    sigmaX: settings.blur.toDouble(),
                    sigmaY: settings.blur.toDouble(),
                  ),
                  child: wall,
                );
              }
              return wall;
            },
          ),
        ),
      ),
    );
  }
}

class _WallRow extends StatelessWidget {
  const _WallRow({
    required this.api,
    required this.tiles,
    required this.height,
    required this.seconds,
    required this.reverse,
    required this.drift,
  });

  final MatineeApi api;
  final List<LoginBackdropTile> tiles;
  final double height;
  final int seconds;
  final bool reverse;
  final ValueListenable<double> drift;

  @override
  Widget build(BuildContext context) {
    final colors = MatineeTheme.of(context);
    // A copy's width, so moving by it lands on the same picture.
    final copyWidth = tiles.fold<double>(
      0,
      (sum, tile) => sum + height * _aspectOf(tile) + _gap,
    );
    // Two copies, so the row never runs out while it moves by one.
    final images = [
      for (final tile in [...tiles, ...tiles])
        SizedBox(
          width: height * _aspectOf(tile),
          height: height,
          child: ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: ColoredBox(
              color: colors.foreground.withValues(alpha: .05),
              child: Image.network(
                api.paths
                    .artwork(tile.artwork.id, size: ArtworkSize.small)
                    .toString(),
                fit: BoxFit.cover,
                gaplessPlayback: true,
                errorBuilder: (context, error, stack) => const SizedBox(),
              ),
            ),
          ),
        ),
    ];
    return SizedBox(
      height: height,
      child: ClipRect(
        child: OverflowBox(
          alignment: AlignmentDirectional.centerStart,
          minWidth: 0,
          maxWidth: double.infinity,
          child: ValueListenableBuilder<double>(
            valueListenable: drift,
            child: Row(
              mainAxisSize: MainAxisSize.min,
              spacing: _gap,
              children: images,
            ),
            builder: (context, elapsed, row) {
              final progress = (elapsed / seconds) % 1;
              return Transform.translate(
                offset: Offset(
                  -copyWidth * (reverse ? 1 - progress : progress),
                  0,
                ),
                child: row,
              );
            },
          ),
        ),
      ),
    );
  }
}
