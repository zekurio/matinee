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
  ),
)!;

String? _id(MediaItem? item) => item?.id;

(String?, String?) _either(int season, int episode, List<OfflineItem> here) {
  final (previous, next) = downloadNeighbours(
    _download(season, episode).item,
    here,
  );
  return (_id(previous), _id(next));
}

void main() {
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
}
