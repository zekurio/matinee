import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:matinee/api/matinee_api.dart';
import 'package:matinee/core/failure_text.dart';
import 'package:matinee/l10n/app_localizations_en.dart';

final _strings = AppLocalizationsEn();

void main() {
  test('a failed request reads as what the person can do about it', () {
    expect(
      describeFailure(
        _strings,
        const ApiException(status: 400, message: 'That code ran out.'),
      ),
      'That code ran out.',
    );
    expect(
      describeFailure(_strings, const ApiException(status: 500)),
      _strings.errorServer,
    );
    for (final unreachable in <Object>[
      const SocketException('Connection refused'),
      TimeoutException('slow'),
      http.ClientException('gone'),
    ]) {
      expect(describeFailure(_strings, unreachable), _strings.errorUnreachable);
    }
    expect(
      describeFailure(_strings, const FormatException('not json')),
      _strings.errorUnreadable,
    );
    expect(
      describeFailure(_strings, StateError('x')),
      _strings.errorConnectionLost,
    );
  });
}
