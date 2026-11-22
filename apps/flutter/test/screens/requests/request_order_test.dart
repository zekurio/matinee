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

AdminRequestItem _item(String id, {String status = 'asked'}) =>
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
      'status': status,
      'fulfilmentState': null,
      'error': null,
      'reason': null,
      'note': null,
      'declinedAt': null,
      'connection': null,
      'followers': <Object>[],
      'destinationDescription': 'Films',
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
  counts: RequestQueueCounts(
    waiting: waiting.length,
    needsAttention: needsAttention.length,
    onTheWay: onTheWay.length,
    done: done.length,
  ),
  nextCursor: null,
);

List<String> _ids(Iterable<AdminRequestItem> items) => [
  for (final item in items) item.id,
];

void main() {
  // The bug it pins: the overview and Explore's row put a request in the
  // wrong state, or out of the server's order of its lists, once the
  // tabs that kept them apart are gone.
  test("the queue reads in its lists' order, each with its list's state", () {
    final entries = queueInOrder(
      _queue(
        done: [
          _item('d1', status: 'declined'),
          _item('d2', status: 'approved'),
        ],
        onTheWay: [_item('o1', status: 'approved')],
        needsAttention: [_item('n1', status: 'approved')],
        waiting: [_item('w1'), _item('w2')],
      ),
      held: {'w2'},
    );
    expect(
      [for (final entry in entries) (entry.item.id, entry.state)],
      [
        ('w1', RequestState.waiting),
        ('n1', RequestState.needsAttention),
        ('o1', RequestState.onTheWay),
        ('d1', RequestState.declined),
        ('d2', RequestState.here),
      ],
    );
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
