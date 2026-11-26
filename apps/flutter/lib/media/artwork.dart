import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:isolate';
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:crypto/crypto.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';

import '../api/matinee_api.dart';
import '../core/session.dart';
import '../kit/motion.dart';
import 'blurhash.dart';

/// Where artwork stays between runs. The server's artwork URLs never change
/// their picture (contracts' `artworkPath`), so a copy is good for good.
abstract interface class ArtworkCache {
  Future<Uint8List?> read(Uri url);
  Future<void> write(Uri url, Uint8List bytes);
}

/// Artwork in files under the app's cache folder, which Android may clear
/// when it needs room, named by a hash of the URL. Past [maxBytes] the
/// oldest go, checked every [_pruneEvery] writes.
final class DiskArtworkCache implements ArtworkCache {
  DiskArtworkCache(this._folder, {this.maxBytes = 256 << 20});

  final Future<Directory> _folder;
  final int maxBytes;
  int _writes = 0;

  static const _pruneEvery = 64;

  String _name(Uri url) => sha256.convert(utf8.encode('$url')).toString();

  @override
  Future<Uint8List?> read(Uri url) async {
    try {
      final folder = await _folder;
      return await File('${folder.path}/${_name(url)}').readAsBytes();
    } on FileSystemException {
      return null;
    }
  }

  @override
  Future<void> write(Uri url, Uint8List bytes) async {
    try {
      final folder = await _folder;
      final name = _name(url);
      // Written aside, then moved, so a read never sees half a file.
      final part = File('${folder.path}/$name.part');
      await part.writeAsBytes(bytes, flush: true);
      await part.rename('${folder.path}/$name');
      if (++_writes % _pruneEvery == 0) {
        final path = folder.path;
        final limit = maxBytes;
        await Isolate.run(() => _prune(path, limit));
      }
    } on FileSystemException {
      // A full or cleared disk only means fetching again next time.
    }
  }
}

/// Deletes the oldest files in [path] until they take [maxBytes] at most,
/// down to three quarters of it so it doesn't run on every write.
void _prune(String path, int maxBytes) {
  final files = [
    for (final entry in Directory(path).listSync())
      if (entry is File) (entry, entry.statSync()),
  ]..sort((a, b) => a.$2.modified.compareTo(b.$2.modified));
  var total = files.fold<int>(0, (sum, file) => sum + file.$2.size);
  if (total <= maxBytes) return;
  for (final (file, stat) in files) {
    if (total <= maxBytes * 3 ~/ 4) break;
    try {
      file.deleteSync();
      total -= stat.size;
    } on FileSystemException {
      // Gone already.
    }
  }
}

/// Artwork that didn't come: the server has none at that path, or refused.
final class ArtworkUnavailable implements Exception {
  const ArtworkUnavailable(this.url, this.status);

  final Uri url;
  final int status;

  @override
  String toString() => 'ArtworkUnavailable($status, $url)';
}

/// Fetches artwork through the session's artwork client, which sends each
/// saved server its own token, and keeps it in [_cache].
final class ArtworkLoader {
  const ArtworkLoader(this._client, this._cache);

  final http.Client _client;
  final ArtworkCache _cache;

  Future<Uint8List> load(Uri url) async {
    final kept = await _cache.read(url);
    if (kept != null && kept.isNotEmpty) return kept;
    final response = await _client.get(url);
    if (response.statusCode != 200) {
      throw ArtworkUnavailable(url, response.statusCode);
    }
    final bytes = response.bodyBytes;
    unawaited(_cache.write(url, bytes));
    return bytes;
  }
}

/// Where the app keeps what it can fetch again. `main` gives an Apple TV
/// its own, since path_provider has no tvOS side.
final cacheFolderProvider = Provider<Future<Directory>>(
  (ref) => getApplicationCacheDirectory(),
);

final artworkCacheProvider = Provider<ArtworkCache>(
  (ref) => DiskArtworkCache(
    ref
        .watch(cacheFolderProvider)
        .then(
          (folder) =>
              Directory('${folder.path}/artwork').create(recursive: true),
        ),
  ),
);

final artworkLoaderProvider = Provider<ArtworkLoader>(
  (ref) => ArtworkLoader(
    ref.watch(artworkHttpProvider),
    ref.watch(artworkCacheProvider),
  ),
);

/// A picture from the server, as Flutter's image cache keeps it: one per
/// URL and decode size, however it's loaded. Without a [box] it decodes
/// whole, as a trickplay sheet needs.
@immutable
final class ArtworkImage extends ImageProvider<ArtworkImage> {
  const ArtworkImage(
    this.url,
    this.loader, {
    this.box,
    this.fit = BoxFit.cover,
  });

  /// Decoded no larger than [fit] in a box [pixels] in device pixels needs,
  /// with the box rounded up by [decodeBox] so a box that changes size a
  /// little keeps its decode.
  ArtworkImage.sized(
    Uri url,
    ArtworkLoader loader,
    Size pixels, {
    BoxFit fit = BoxFit.cover,
  }) : this(url, loader, box: decodeBox(pixels), fit: fit);

  final Uri url;
  final ArtworkLoader loader;

  /// The box it shows in, in device pixels, already rounded by [decodeBox].
  final Size? box;
  final BoxFit fit;

  @override
  Future<ArtworkImage> obtainKey(ImageConfiguration configuration) =>
      SynchronousFuture(this);

  @override
  ImageStreamCompleter loadImage(
    ArtworkImage key,
    ImageDecoderCallback decode,
  ) => MultiFrameImageStreamCompleter(
    codec: _load(key, decode),
    scale: 1,
    debugLabel: '$url',
  );

  static Future<ui.Codec> _load(
    ArtworkImage key,
    ImageDecoderCallback decode,
  ) async {
    try {
      final bytes = await key.loader.load(key.url);
      final buffer = await ui.ImmutableBuffer.fromUint8List(bytes);
      final box = key.box;
      if (box == null) return await decode(buffer);
      return await decode(
        buffer,
        getTargetSize: (width, height) {
          final size = decodeSize(
            Size(width.toDouble(), height.toDouble()),
            box,
            key.fit,
          );
          // Only the width, so the codec keeps the picture's own shape.
          return size == null
              ? const ui.TargetImageSize()
              : ui.TargetImageSize(width: size.width.round());
        },
      );
    } on Object {
      // As NetworkImage does: a failure isn't kept, so the next time the
      // picture shows it's asked for again, as a frame that's made by then.
      scheduleMicrotask(() => PaintingBinding.instance.imageCache.evict(key));
      rethrow;
    }
  }

  @override
  bool operator ==(Object other) =>
      other is ArtworkImage &&
      other.url == url &&
      other.box == box &&
      other.fit == fit;

  @override
  int get hashCode => Object.hash(url, box, fit);
}

/// [pixels] rounded up in steps of an eighth of the power of two below
/// each side: 573 by 860 to 576 by 896. Each doubling has eight steps, so
/// a box that grows or shrinks decodes again a few times, not every frame,
/// and each side decodes at most an eighth more than it shows.
Size decodeBox(Size pixels) {
  double up(double side) {
    if (side <= 64) return 64;
    final step = math.pow(2, (math.log(side) / math.ln2).floor()) / 8;
    return (side / step).ceil() * step;
  }

  return Size(up(pixels.width), up(pixels.height));
}

/// The size to decode a picture [intrinsic] pixels big at, to [fit] it in
/// [box]: for a cover, large enough that both sides fill the box. Null to
/// decode it whole, when it would need as many pixels or more, or so
/// nearly as many that a resize isn't worth it. Never larger than it is.
Size? decodeSize(Size intrinsic, Size box, BoxFit fit) {
  if (intrinsic.isEmpty) return null;
  final across = box.width / intrinsic.width;
  final down = box.height / intrinsic.height;
  final scale = switch (fit) {
    BoxFit.cover || BoxFit.fill => math.max(across, down),
    BoxFit.contain || BoxFit.scaleDown => math.min(across, down),
    BoxFit.fitWidth => across,
    BoxFit.fitHeight => down,
    BoxFit.none => 1.0,
  };
  // Past nine tenths of each side, the saving is under a fifth of the pixels.
  if (scale >= .9) return null;
  return Size(
    (intrinsic.width * scale).ceilToDouble(),
    (intrinsic.height * scale).ceilToDouble(),
  );
}

/// Where a picture comes from. Each picks its URL for how many pixels wide
/// it shows at.
sealed class PictureSource {
  const PictureSource();

  /// The blurred stand-in to show while it loads.
  ImagePlaceholder? get placeholder => null;

  Uri url(Paths paths, double pixels);
}

/// Artwork from a metadata provider, at the smallest of the server's sizes
/// at least [pixels] wide, and no larger than [largest].
final class ArtSource extends PictureSource {
  const ArtSource(this.art, {this.largest = ArtworkSize.large});

  final Artwork art;
  final ArtworkSize largest;

  @override
  ImagePlaceholder? get placeholder => art.placeholder;

  @override
  Uri url(Paths paths, double pixels) =>
      paths.artwork(art.id, size: artworkSizeFor(pixels, largest: largest));
}

/// A frame from the file itself, which has no placeholder.
final class FrameSource extends PictureSource {
  const FrameSource(this.itemId);

  final String itemId;

  @override
  Uri url(Paths paths, double pixels) =>
      paths.thumbnail(itemId, large: pixels > _widths[ArtworkSize.small]!);
}

/// The widths the server scales artwork to, as contracts' `ARTWORK_WIDTHS`.
const _widths = {
  ArtworkSize.thumb: 240,
  ArtworkSize.small: 480,
  ArtworkSize.medium: 960,
  ArtworkSize.large: 1920,
  ArtworkSize.xlarge: 3840,
};

/// The smallest artwork size at least [pixels] wide, up to [largest].
ArtworkSize artworkSizeFor(
  double pixels, {
  ArtworkSize largest = ArtworkSize.xlarge,
}) {
  for (final size in ArtworkSize.values) {
    if (size == largest || _widths[size]! >= pixels) return size;
  }
  return largest;
}

/// Wide pictures for a file, best first: the episode's still, then a frame from
/// the file, then the show's backdrop; for a movie, its backdrop first.
List<PictureSource> landscapeSources(MediaItem item) {
  final still = item.episode?.still;
  final backdrop = item.title?.images.backdrop;
  final frame = FrameSource(item.id);
  if (item.title?.kind == TitleKind.movie) {
    return [if (backdrop != null) ArtSource(backdrop), frame];
  }
  return [
    if (still != null) ArtSource(still),
    frame,
    if (backdrop != null) ArtSource(backdrop),
  ];
}

/// The first of [sources] that loads, filling its box over the first's
/// blurred placeholder while it loads. Nothing when every one fails, or
/// while no server is in use, so what's beneath shows: in a card, the
/// title's tone. It asks for the size its box needs at this screen's
/// density.
class Picture extends ConsumerStatefulWidget {
  const Picture(
    this.sources, {
    super.key,
    this.fit = BoxFit.cover,
    this.alignment = Alignment.center,
  });

  final List<PictureSource> sources;
  final BoxFit fit;
  final Alignment alignment;

  @override
  ConsumerState<Picture> createState() => _PictureState();
}

class _PictureState extends ConsumerState<Picture> {
  int _index = 0;

  @override
  void didUpdateWidget(Picture old) {
    super.didUpdateWidget(old);
    if (!listEquals(_keys(old.sources), _keys(widget.sources))) _index = 0;
  }

  static List<Object> _keys(List<PictureSource> sources) => [
    for (final source in sources)
      switch (source) {
        ArtSource(:final art) => art.id,
        FrameSource(:final itemId) => 'frame:$itemId',
      },
  ];

  void _failed(int index) {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && _index == index) setState(() => _index++);
    });
  }

  @override
  Widget build(BuildContext context) {
    final api = ref.watch(apiProvider);
    // No server means nothing to fetch: the loader would need the session's
    // artwork client, which has nothing to send without one.
    final loader = api == null ? null : ref.watch(artworkLoaderProvider);
    final sources = widget.sources;
    final hash = sources.isEmpty ? null : sources.first.placeholder?.blurhash;
    final index = _index;
    return LayoutBuilder(
      builder: (context, constraints) {
        final dpr = MediaQuery.devicePixelRatioOf(context);
        final width = constraints.hasBoundedWidth
            ? constraints.maxWidth
            : constraints.maxHeight * 16 / 9;
        final pixels = width * dpr;
        final box = constraints.hasBoundedWidth && constraints.hasBoundedHeight
            ? Size(pixels, constraints.maxHeight * dpr)
            : null;
        return Stack(
          fit: StackFit.expand,
          children: [
            if (hash != null)
              Image(
                image: BlurHashImage(hash),
                fit: BoxFit.cover,
                excludeFromSemantics: true,
                errorBuilder: (context, error, stack) => const SizedBox(),
              ),
            if (api != null && loader != null && index < sources.length)
              Image(
                key: ValueKey(index),
                image: box == null
                    ? ArtworkImage(
                        sources[index].url(api.paths, pixels),
                        loader,
                      )
                    : ArtworkImage.sized(
                        sources[index].url(api.paths, pixels),
                        loader,
                        box,
                        fit: widget.fit,
                      ),
                fit: widget.fit,
                alignment: widget.alignment,
                excludeFromSemantics: true,
                gaplessPlayback: true,
                frameBuilder: (context, child, frame, synchronous) => _Arrival(
                  arrived: synchronous || frame != null,
                  child: child,
                ),
                errorBuilder: (context, error, stack) {
                  _failed(index);
                  return const SizedBox();
                },
              ),
          ],
        );
      },
    );
  }
}

/// A picture fading in over its placeholder the first time it [arrived],
/// and shown at once when it was already in memory. Once in, it stays: a
/// sharper size of the same picture, for a box that grew, takes its place
/// without fading out first.
class _Arrival extends StatefulWidget {
  const _Arrival({required this.arrived, required this.child});

  final bool arrived;
  final Widget child;

  @override
  State<_Arrival> createState() => _ArrivalState();
}

class _ArrivalState extends State<_Arrival> {
  late bool _arrived = widget.arrived;

  @override
  void didUpdateWidget(_Arrival old) {
    super.didUpdateWidget(old);
    if (widget.arrived) _arrived = true;
  }

  @override
  Widget build(BuildContext context) => AnimatedOpacity(
    opacity: _arrived ? 1 : 0,
    duration: KitMotion.of(context, KitMotion.enter),
    curve: KitMotion.easing,
    child: widget.child,
  );
}
