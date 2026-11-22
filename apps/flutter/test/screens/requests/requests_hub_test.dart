import 'dart:async';
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/core/permissions.dart';
import 'package:matinee/core/session.dart' show apiProvider;
import 'package:matinee/core/toasts.dart';
import 'package:matinee/kit/toast.dart';
import 'package:matinee/l10n/app_localizations_en.dart';
import 'package:matinee/screens/requests/requests_hub.dart';

/// Toasts that close as the test says, without anyone pressing them.
final class _Toasts extends ToastState {
  ToastResult answer = ToastResult.timedOut;

  @override
  Future<ToastResult> show(
    String message, {
    String? description,
    ToastKind kind = ToastKind.message,
    String? actionLabel,
    ToastDuration? duration,
    Duration? within,
  }) async => answer;
}

const _emptyQueue = {
  'waiting': <Object>[],
  'needsAttention': <Object>[],
  'onTheWay': <Object>[],
  'done': <Object>[],
  'counts': {'waiting': 0, 'needsAttention': 0, 'onTheWay': 0, 'done': 0},
  'nextCursor': null,
};

void main() {
  final l = AppLocalizationsEn();

  ProviderContainer hub(
    http.Client client, {
    required bool runsQueue,
    ToastState? toasts,
  }) {
    final container = ProviderContainer(
      overrides: [
        apiProvider.overrideWithValue(
          MatineeApi(
            base: Uri.parse('https://media.example.com'),
            client: client,
          ),
        ),
        runsQueueProvider.overrideWithValue(runsQueue),
        if (toasts != null) toastProvider.overrideWithValue(toasts),
      ],
    );
    addTearDown(container.dispose);
    container.listen(requestsProvider, (_, _) {});
    return container;
  }

  group("a person's Cancel from Explore's Requests row", () {
    // The bug it pins: a cancel sent at once, or sent after Undo, which
    // the server can't take back.
    test('Undo sends nothing and brings the card back', () async {
      final sent = <String>[];
      final toasts = _Toasts()..answer = ToastResult.action;
      final c = hub(
        MockClient((request) async {
          sent.add(request.url.path);
          return http.Response('null', 200);
        }),
        runsQueue: false,
        toasts: toasts,
      );
      await c.read(requestsProvider.notifier).withdraw(l, 'r1', 'Dune');
      expect(sent, isEmpty);
      expect(c.read(requestsProvider).held, isEmpty);
    });

    test('goes once the Undo has passed, with the card held out', () async {
      final sent = <(String, Object?)>[];
      final answered = Completer<void>();
      final c = hub(
        MockClient((request) async {
          sent.add((request.url.path, jsonDecode(request.body)));
          await answered.future;
          return http.Response('null', 200);
        }),
        runsQueue: false,
        toasts: _Toasts(),
      );
      final done = c.read(requestsProvider.notifier).withdraw(l, 'r1', 'Dune');
      await pumpEventQueue();
      expect(sent.single.$1, '/api/v1/requests/cancel');
      expect(sent.single.$2, {'id': 'r1'});
      // Out of the row while it's sent, so it doesn't flash back.
      expect(c.read(requestsProvider).held, {'r1'});
      answered.complete();
      await done;
      expect(c.read(requestsProvider).held, isEmpty);
    });
  });

  // The bug it pins: a stream that drops after the queue was shown
  // swaps the row's cards for "didn't load".
  test('the queue says it failed only while none was heard', () async {
    var opened = 0;
    final second = StreamController<List<int>>();
    addTearDown(second.close);
    final c = hub(
      MockClient.streaming((request, _) async {
        expect(request.url.path, '/api/v1/admin/requests/live');
        if (opened++ == 0) {
          return http.StreamedResponse(
            Stream.value(utf8.encode('{"message":"down"}')),
            500,
          );
        }
        return http.StreamedResponse(second.stream, 200);
      }),
      runsQueue: true,
    );
    await pumpEventQueue();
    expect(c.read(requestsProvider).queueFailed, isTrue);
    expect(c.read(requestsProvider).queue, isNull);

    c.read(requestsProvider.notifier).retryQueue();
    expect(c.read(requestsProvider).queueFailed, isFalse);
    second.add(utf8.encode('data: ${jsonEncode(_emptyQueue)}\n\n'));
    await pumpEventQueue();
    expect(c.read(requestsProvider).queue, isNotNull);

    second.addError(const _Dropped());
    await pumpEventQueue();
    expect(c.read(requestsProvider).queueFailed, isFalse);
    expect(c.read(requestsProvider).queue, isNotNull);
  });
}

/// A dropped connection, as the stream reports it.
final class _Dropped implements Exception {
  const _Dropped();
}
