import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';

/// A BlurHash (https://blurha.sh) as a small picture: the blurred stand-in
/// the server sends with each artwork, so a card shows its colors while
/// the picture loads, as the web and the Kotlin app do (its `BlurHash`).
@immutable
final class BlurHashImage extends ImageProvider<BlurHashImage> {
  const BlurHashImage(this.hash, {this.size = 32});

  final String hash;

  /// Its width and height in pixels; it's stretched over the box anyway.
  final int size;

  @override
  Future<BlurHashImage> obtainKey(ImageConfiguration configuration) =>
      SynchronousFuture(this);

  @override
  ImageStreamCompleter loadImage(
    BlurHashImage key,
    ImageDecoderCallback decode,
  ) => OneFrameImageStreamCompleter(_load(key));

  static Future<ImageInfo> _load(BlurHashImage key) async {
    final pixels = decodeBlurHash(key.hash, key.size, key.size);
    if (pixels == null) throw FormatException('not a blurhash', key.hash);
    final buffer = await ui.ImmutableBuffer.fromUint8List(pixels);
    final descriptor = ui.ImageDescriptor.raw(
      buffer,
      width: key.size,
      height: key.size,
      pixelFormat: ui.PixelFormat.rgba8888,
    );
    final codec = await descriptor.instantiateCodec();
    final frame = await codec.getNextFrame();
    codec.dispose();
    descriptor.dispose();
    buffer.dispose();
    return ImageInfo(image: frame.image);
  }

  @override
  bool operator ==(Object other) =>
      other is BlurHashImage && other.hash == hash && other.size == size;

  @override
  int get hashCode => Object.hash(hash, size);
}

const _chars =
    '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#\$%*+,-.:;=?@[]^_{|}~';

/// [hash] as [width] by [height] RGBA pixels, or null when it isn't one.
Uint8List? decodeBlurHash(String hash, int width, int height) {
  int? decode83(int from, int to) {
    var value = 0;
    for (var i = from; i < to; i++) {
      final digit = _chars.indexOf(hash[i]);
      if (digit < 0) return null;
      value = value * 83 + digit;
    }
    return value;
  }

  if (hash.length < 6) return null;
  final sizeFlag = decode83(0, 1);
  if (sizeFlag == null) return null;
  final nx = sizeFlag % 9 + 1;
  final ny = sizeFlag ~/ 9 + 1;
  if (hash.length != 4 + 2 * nx * ny) return null;
  final quantised = decode83(1, 2);
  if (quantised == null) return null;
  final maxAc = (quantised + 1) / 166;
  final colors = <List<double>>[];
  for (var i = 0; i < nx * ny; i++) {
    if (i == 0) {
      final dc = decode83(2, 6);
      if (dc == null) return null;
      colors.add([
        _toLinear(dc >> 16),
        _toLinear((dc >> 8) & 255),
        _toLinear(dc & 255),
      ]);
    } else {
      final ac = decode83(4 + i * 2, 6 + i * 2);
      if (ac == null) return null;
      colors.add([
        _signPow((ac ~/ (19 * 19) - 9) / 9) * maxAc,
        _signPow(((ac ~/ 19) % 19 - 9) / 9) * maxAc,
        _signPow((ac % 19 - 9) / 9) * maxAc,
      ]);
    }
  }
  final pixels = Uint8List(width * height * 4);
  for (var y = 0; y < height; y++) {
    for (var x = 0; x < width; x++) {
      var r = 0.0;
      var g = 0.0;
      var b = 0.0;
      for (var j = 0; j < ny; j++) {
        final cy = math.cos(math.pi * y * j / height);
        for (var i = 0; i < nx; i++) {
          final basis = math.cos(math.pi * x * i / width) * cy;
          final color = colors[i + j * nx];
          r += color[0] * basis;
          g += color[1] * basis;
          b += color[2] * basis;
        }
      }
      final at = (x + y * width) * 4;
      pixels[at] = _toSrgb(r);
      pixels[at + 1] = _toSrgb(g);
      pixels[at + 2] = _toSrgb(b);
      pixels[at + 3] = 255;
    }
  }
  return pixels;
}

double _toLinear(int value) {
  final v = value / 255;
  return v <= .04045 ? v / 12.92 : math.pow((v + .055) / 1.055, 2.4).toDouble();
}

int _toSrgb(double value) {
  final v = value.clamp(0.0, 1.0);
  final srgb = v <= .0031308 ? v * 12.92 : 1.055 * math.pow(v, 1 / 2.4) - .055;
  return (srgb * 255 + .5).toInt().clamp(0, 255);
}

double _signPow(double value) => value.sign * value * value;
