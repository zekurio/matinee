import 'package:flutter_test/flutter_test.dart';
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/screens/requests/request_words.dart';

const _availability = {
  'state': 'asked',
  'action': null,
  'progress': null,
  'etaSeconds': null,
  'releaseDate': null,
  'stillLooking': false,
  'reason': null,
  'askedBySelf': false,
  'requestId': null,
  'others': {'count': 0, 'names': <String>[]},
  'limit': null,
  'libraryTitleId': null,
  'disabledReason': null,
};

AdminRequestItem _item(String id, {String state = 'waiting'}) =>
    AdminRequestItem.fromJson({
      'id': id,
      'title': {
        'ref': {'kind': 'movie', 'provider': 'tmdb', 'providerId': id},
        'name': id,
        'year': 2024,
        'poster': null,
        'availability': _availability,
      },
      'library': {'id': 'films', 'name': 'Films'},
      'scope': null,
      'createdAt': '2026-11-01T00:00:00.000Z',
      'arrivedAt': null,
      'availability': _availability,
      'season': null,
      'status': switch (state) {
        'waiting' => 'asked',
        'declined' => 'declined',
        _ => 'approved',
      },
      'state': state,
      'fulfilmentState': null,
      'error': null,
      'reason': null,
      'note': null,
      'declinedAt': null,
      'connection': null,
      'followers': <Object>[],
      'destinations': <Object>[],
      'remoteUrl': null,
      'diagnostics': <Object>[],
    });

RequestQueue _queue({
  List<AdminRequestItem> waiting = const [],
  List<AdminRequestItem> needsAttention = const [],
  List<AdminRequestItem> onTheWay = const [],
  List<AdminRequestItem> done = const [],
}) => RequestQueue(
  waiting: waiting,
  needsAttention: needsAttention,
  onTheWay: onTheWay,
  done: done,
  doneCount: done.length,
  nextCursor: null,
);

List<String> _ids(Iterable<AdminRequestItem> items) => [
  for (final item in items) item.id,
];

void main() {
  // The bug it pins: the overview and Explore's row out of the server's
  // order of its lists, or showing a request held for Undo.
  test("the queue reads in its lists' order, without what's held", () {
    final entries = queueInOrder(
      _queue(
        done: [
          _item('d1', state: 'declined'),
          _item('d2', state: 'here'),
        ],
        onTheWay: [_item('o1', state: 'onTheWay')],
        needsAttention: [_item('n1', state: 'needsAttention')],
        waiting: [_item('w1'), _item('w2')],
      ),
      held: {'w2'},
    );
    expect(_ids(entries), ['w1', 'n1', 'o1', 'd1', 'd2']);
  });

  test('Done read past the live queue takes its place', () {
    final entries = queueInOrder(
      _queue(
        waiting: [_item('w1')],
        done: [_item('d1', state: 'here')],
      ),
      done: [
        _item('d1', state: 'here'),
        _item('d2', state: 'declined'),
      ],
    );
    expect(_ids(entries), ['w1', 'd1', 'd2']);
  });

  group('Done past what the live queue holds', () {
    final live = [_item('a'), _item('b'), _item('c')];

    test('is the live list alone when that is all of Done', () {
      final done = doneInOrder(
        live,
        liveIsAll: true,
        paged: [_item('a'), _item('z')],
        pagedDone: false,
      );
      expect(_ids(done.items), ['a', 'b', 'c']);
      expect(done.more, isFalse);
    });

    // The bug it pins: a request answered since a page was read, which
    // left Done, coming back from that page.
    test('takes from the pages only what comes after the live list', () {
      final done = doneInOrder(
        live,
        liveIsAll: false,
        paged: [_item('a'), _item('gone'), _item('b'), _item('c'), _item('d')],
        pagedDone: false,
      );
      expect(_ids(done.items), ['a', 'b', 'c', 'd']);
      expect(done.more, isTrue);
    });

    test('waits for the page that reaches the live list', () {
      final done = doneInOrder(
        live,
        liveIsAll: false,
        paged: [_item('a'), _item('b')],
        pagedDone: false,
      );
      expect(_ids(done.items), ['a', 'b', 'c']);
      expect(done.more, isTrue);
    });
  });
}
