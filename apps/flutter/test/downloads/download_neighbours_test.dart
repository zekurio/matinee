import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/downloads/download_neighbours.dart';
import 'package:matinee/downloads/offline_item.dart';
import 'package:matinee/platform/downloads.g.dart' as wire;

import '../media/fixtures.dart';
import 'fake_downloads.dart';

const _server = 'https://media.example.com/';
final _show = titleJson('s1', kind: 'show', name: 'The Expanse');

OfflineItem _download(
  int season,
  int episode, {
  wire.DownloadStateMessage state = wire.DownloadStateMessage.done,
  Map<String, Object?>? title,
  DownloadOffline? offline,
}) => OfflineItem.of(
  downloadEntry(
    itemJson(
      's${season}e$episode',
      title: title ?? _show,
      season: season,
      episode: episode,
    ),
    server: _server,
    state: state,
    offline: offline,
  ),
)!;

String? _id(MediaItem? item) => item?.id;

(String?, String?) _either(int season, int episode, List<OfflineItem> here) {
  final (previous, next) = downloadNeighbours(_download(season, episode), here);
  return (_id(previous), _id(next));
}

/// What the server sends with a download: the show's files in its order.
DownloadOffline _served(List<String> episodes) => DownloadOffline(
  segments: const [MediaSegment(kind: 'intro', start: 10, end: 80)],
  episodes: episodes,
  upNextAt: 1200,
);

void main() {
  group('a download made before the server sent the order', () {
    test('the episodes either side in the season', () {
      final here = [_download(1, 1), _download(1, 2), _download(1, 3)];
      expect(_either(1, 2, here), ('s1e1', 's1e3'));
      expect(_either(1, 1, here), (null, 's1e2'));
    });

    test("skips none that isn't on the device", () {
      final here = [_download(1, 1), _download(1, 3)];
      expect(_either(1, 2, here), ('s1e1', 's1e3'));
      expect(_either(1, 1, here), (null, null));
    });

    test('crosses into the next season after the last one here', () {
      final here = [_download(1, 9), _download(1, 10), _download(2, 1)];
      expect(_either(1, 10, here), ('s1e9', 's2e1'));
      expect(_either(2, 1, here), ('s1e10', null));
      // A later episode of this season is here, so the next isn't S2E1.
      expect(_either(1, 9, [_download(1, 12), _download(2, 1)]), (null, null));
    });

    test('counts only finished downloads of the same show', () {
      final here = [
        _download(1, 1, state: wire.DownloadStateMessage.running),
        _download(
          1,
          3,
          title: titleJson('s2', kind: 'show', name: 'Other'),
        ),
      ];
      expect(_either(1, 2, here), (null, null));
    });

    test('leaves a film with no neighbours', () {
      final film = OfflineItem.of(
        downloadEntry(
          itemJson(
            'film',
            title: titleJson('film', kind: 'movie', name: 'Arrival'),
          ),
          server: _server,
        ),
      )!;
      final (previous, next) = downloadNeighbours(film, [_download(1, 1)]);
      expect((previous, next), (null, null));
    });
  });

  group('a download the server sent the order for', () {
    test('reads its skips, order and next time back from the store', () {
      final stored = _download(
        1,
        2,
        offline: _served(['s1e1', 's1e2', 's1e3']),
      );
      final offline = stored.offline!;
      expect(offline.segments.single.kind, 'intro');
      expect(offline.segments.single.start, 10);
      expect(offline.segments.single.end, 80);
      expect(offline.episodes, ['s1e1', 's1e2', 's1e3']);
      expect(offline.upNextAt, 1200);
    });

    test('goes to the nearest one here, over the ones that are not', () {
      final episodes = ['s1e1', 's1e2', 's1e3', 's1e4', 's1e5'];
      final here = [_download(1, 1), _download(1, 2), _download(1, 5)];
      final current = _download(1, 2, offline: _served(episodes));
      expect(downloadNeighbours(current, here).$1?.id, 's1e1');
      expect(downloadNeighbours(current, here).$2?.id, 's1e5');
      // Nothing else is here.
      final alone = _download(1, 4, offline: _served(episodes));
      expect(downloadNeighbours(alone, [alone]), (null, null));
    });

    test("follows the server's order, not the episode numbers", () {
      // The server puts a special the account shows second, whatever its
      // season, and the next season's first file last.
      final episodes = ['s1e1', 's0e1', 's1e2', 's2e1'];
      final here = [_download(1, 1), _download(0, 1), _download(1, 2)];
      final first = _download(1, 1, offline: _served(episodes));
      expect(downloadNeighbours(first, here).$2?.id, 's0e1');
      final second = _download(1, 2, offline: _served(episodes));
      expect(downloadNeighbours(second, here).$1?.id, 's0e1');
      expect(downloadNeighbours(second, here).$2, isNull);
    });

    test('a file that is here twice counts once', () {
      final episodes = ['s1e1', 's1e2'];
      final here = [
        _download(1, 1, state: wire.DownloadStateMessage.running),
        _download(1, 2),
      ];
      final current = _download(1, 1, offline: _served(episodes));
      final (previous, next) = downloadNeighbours(current, here);
      expect(previous, isNull);
      expect(next?.id, 's1e2');
    });
  });
}
