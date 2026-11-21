import 'dart:typed_data';

import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/kit/kit.dart';
import 'package:matinee/media/artwork.dart';
import 'package:matinee/media/blurhash.dart';

import 'fixtures.dart';

final class MemoryCache implements ArtworkCache {
  final files = <Uri, Uint8List>{};

  @override
  Future<Uint8List?> read(Uri url) async => files[url];

  @override
  Future<void> write(Uri url, Uint8List bytes) async => files[url] = bytes;
}

void main() {
  final paths = Paths(Uri(scheme: 'https', host: 'media.example.com'));

  test('artwork asks for the smallest size that is sharp in its box', () {
    expect(artworkSizeFor(100), ArtworkSize.thumb);
    expect(artworkSizeFor(240), ArtworkSize.thumb);
    expect(artworkSizeFor(241), ArtworkSize.small);
    expect(artworkSizeFor(176 * 2.625), ArtworkSize.small);
    expect(artworkSizeFor(1200), ArtworkSize.large);
    expect(artworkSizeFor(5000), ArtworkSize.xlarge);
    expect(artworkSizeFor(5000, largest: ArtworkSize.large), ArtworkSize.large);
    final art = Artwork.fromJson(artJson('a1'));
    expect(
      ArtSource(art).url(paths, 700).toString(),
      'https://media.example.com/api/artwork/a1?size=medium',
    );
    expect(
      const FrameSource('m1').url(paths, 900).queryParameters['size'],
      'large',
    );
    expect(
      const FrameSource('m1').url(paths, 300).queryParameters['size'],
      'small',
    );
  });

  test('a file\'s wide pictures put the still first, a movie its backdrop', () {
    final show = titleJson('s1', kind: 'show', backdrop: 'bd');
    final episode = MediaItem.fromJson(
      itemJson('e1', title: show, season: 1, episode: 2, still: 'st'),
    );
    expect(
      [for (final source in landscapeSources(episode)) source.url(paths, 1)],
      [
        paths.artwork('st', size: ArtworkSize.thumb),
        paths.thumbnail('e1'),
        paths.artwork('bd', size: ArtworkSize.thumb),
      ],
    );
    final movie = MediaItem.fromJson(
      itemJson('m1', title: titleJson('t1', backdrop: 'bd')),
    );
    expect(
      [for (final source in landscapeSources(movie)) source.url(paths, 1)],
      [paths.artwork('bd', size: ArtworkSize.thumb), paths.thumbnail('m1')],
    );
  });

  test('the loader keeps what it fetched and fetches it once', () async {
    var fetched = 0;
    final client = MockClient((request) async {
      fetched++;
      return http.Response.bytes([1, 2, 3], 200);
    });
    final cache = MemoryCache();
    final loader = ArtworkLoader(client, cache);
    final url = paths.artwork('a1');
    expect(await loader.load(url), [1, 2, 3]);
    await pumpEventQueue();
    expect(cache.files[url], [1, 2, 3]);
    expect(await loader.load(url), [1, 2, 3]);
    expect(fetched, 1);
  });

  test('missing artwork fails and is not kept', () async {
    final cache = MemoryCache();
    final loader = ArtworkLoader(
      MockClient((request) async => http.Response('', 404)),
      cache,
    );
    await expectLater(
      loader.load(paths.artwork('gone')),
      throwsA(isA<ArtworkUnavailable>()),
    );
    expect(cache.files, isEmpty);
  });

  test('a blurhash decodes to its colors, and junk to nothing', () {
    final pixels = decodeBlurHash('LEHV6nWB2yk8pyo0adR*.7kCMdnj', 4, 3);
    expect(pixels, isNotNull);
    expect(pixels!.length, 4 * 3 * 4);
    expect(pixels[3], 255);
    expect(decodeBlurHash('LEHV6nWB', 4, 3), isNull);
    expect(decodeBlurHash('!!!!!!!', 4, 3), isNull);
  });

  test('a tone is the same for the same name', () {
    final a = toneGradient(matineeDark, 'Arrival');
    final b = toneGradient(matineeDark, 'Arrival');
    expect(a.colors, b.colors);
    expect(a.colors.first, isNot(a.colors.last));
    expect(a.begin, Alignment.topLeft);
  });
}
