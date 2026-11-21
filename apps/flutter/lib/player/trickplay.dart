import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/matinee_api.dart';
import '../core/session.dart';
import '../media/artwork.dart';

/// Where the frame at [seconds] sits in [images]: its tile and its place in
/// that tile's grid, as the Kotlin app's `TrickplayFrame` cuts it.
({int tile, int column, int row}) trickplayCell(
  Trickplay images,
  double seconds,
) {
  final perTile = math.max(1, images.columns * images.rows);
  final interval = images.intervalSeconds <= 0 ? 1 : images.intervalSeconds;
  final last = math.max(0, images.count - 1);
  final index = seconds.isFinite
      ? (seconds / interval).floor().clamp(0, last)
      : 0;
  final cell = index % perTile;
  return (
    tile: index ~/ perTile,
    column: cell % math.max(1, images.columns),
    row: cell ~/ math.max(1, images.columns),
  );
}

/// The trickplay frame at [seconds], [width] wide at the frames' own shape.
/// The black box shows while its tile loads.
class TrickplayFrame extends ConsumerStatefulWidget {
  const TrickplayFrame({
    super.key,
    required this.itemId,
    required this.images,
    required this.seconds,
    required this.width,
  });

  final String itemId;
  final Trickplay images;
  final double seconds;
  final double width;

  @override
  ConsumerState<TrickplayFrame> createState() => _TrickplayFrameState();
}

class _TrickplayFrameState extends ConsumerState<TrickplayFrame> {
  ImageStream? _stream;
  ImageStreamListener? _listener;
  ui.Image? _image;
  int? _tile;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _resolve();
  }

  @override
  void didUpdateWidget(TrickplayFrame old) {
    super.didUpdateWidget(old);
    if (old.images.key != widget.images.key) _tile = null;
    _resolve();
  }

  @override
  void dispose() {
    _stop();
    _image?.dispose();
    super.dispose();
  }

  void _stop() {
    final listener = _listener;
    if (listener != null) _stream?.removeListener(listener);
    _stream = null;
    _listener = null;
  }

  void _resolve() {
    final tile = trickplayCell(widget.images, widget.seconds).tile;
    if (tile == _tile) return;
    final api = ref.read(apiProvider);
    if (api == null) return;
    _tile = tile;
    _stop();
    final provider = ArtworkImage(
      api.paths.trickplayTile(widget.itemId, widget.images.key, tile),
      ref.read(artworkLoaderProvider),
    );
    final stream = provider.resolve(createLocalImageConfiguration(context));
    final listener = ImageStreamListener((info, _) {
      if (!mounted || _tile != tile) {
        info.dispose();
        return;
      }
      setState(() {
        _image?.dispose();
        _image = info.image;
      });
    }, onError: (_, _) {});
    stream.addListener(listener);
    _stream = stream;
    _listener = listener;
  }

  @override
  Widget build(BuildContext context) {
    final images = widget.images;
    final height = images.width <= 0
        ? widget.width * 9 / 16
        : widget.width * images.height / images.width;
    final cell = trickplayCell(images, widget.seconds);
    final image = _image;
    return SizedBox(
      width: widget.width,
      height: height,
      child: ColoredBox(
        color: const Color(0xFF000000),
        child: image == null || _tile != cell.tile
            ? null
            : CustomPaint(
                painter: _CellPainter(image, images, cell.column, cell.row),
              ),
      ),
    );
  }
}

class _CellPainter extends CustomPainter {
  _CellPainter(this.image, this.images, this.column, this.row);

  final ui.Image image;
  final Trickplay images;
  final int column;
  final int row;

  @override
  void paint(Canvas canvas, Size size) {
    final source = Rect.fromLTWH(
      (column * images.width).toDouble(),
      (row * images.height).toDouble(),
      images.width.toDouble(),
      images.height.toDouble(),
    );
    canvas.drawImageRect(
      image,
      source,
      Offset.zero & size,
      Paint()..filterQuality = FilterQuality.medium,
    );
  }

  @override
  bool shouldRepaint(_CellPainter old) =>
      old.image != image || old.column != column || old.row != row;
}
